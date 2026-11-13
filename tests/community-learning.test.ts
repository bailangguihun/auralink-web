import test from "node:test";
import assert from "node:assert/strict";
import { communityApi, parseCommunityImage, parseOutcome, parsePost, readOperation } from "../lib/community.ts";
import { communityFilters, communityHref, readCommunityReturn } from "../lib/community-filters.ts";
import { communityDraftKey, emptyCommunityDraft, readCommunityDraft, readCommunityHandoff } from "../lib/community-draft.ts";

const id = "23c2e7c7-3898-5ecd-9ca0-dc47fc7b2d39";
const image = { id, filename: "作品.png", mimeType: "image/png", width: 100, height: 160, bytes: 1000, sha256: "a".repeat(64), contentUrl: `/api/community/media/${id}`, previewUrl: `/api/community/media/${id}?variant=preview` };
test("community images retain only canonical authorized paths and validated image metadata", () => {
  assert.deepEqual(parseCommunityImage(image), image);
  for (const patch of [{ contentUrl: "https://elsewhere.invalid/image.png" }, { previewUrl: image.previewUrl + "&token=private" }, { id: "../../private" }, { mimeType: "image/svg+xml" }, { bytes: -1 }, { width: 0 }, { sha256: "unknown" }]) assert.throws(() => parseCommunityImage({ ...image, ...patch }));
});
test("raw image uploads preserve their image MIME type and request identity through the shared client", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/community/uploads");
      const headers = new Headers(options?.headers);
      assert.equal(headers.get("content-type"), "image/png");
      assert.equal(headers.get("x-request-id"), id);
      assert.equal(headers.get("authorization"), "Bearer local-test-token");
      assert(options?.body instanceof File);
      return new Response(JSON.stringify({ state: "COMMITTED", result: { kind: "upload", assetId: id } }), { headers: { "content-type": "application/json" } });
    };
    assert.equal((await communityApi.upload("local-test-token", new File(["fixture"], "作品.png", { type: "image/png" }), id)).result?.assetId, id);
  } finally { globalThis.fetch = original; }
});
test("legacy posts remain readable after upgrading the UI", () => {
  const post = parsePost({ id, content: "旧帖", author: { id: "1", displayName: "观画人" }, createdAt: "2026-11-12T00:00:00Z", likeCount: 0, commentCount: 0, liked: false, favorited: false, galleryReference: null });
  assert.equal(post.kind, "discussion"); assert.deepEqual(post.images, []); assert.equal(post.workflowStatus, "sharing");
});
test("upload receipts recover by asset identity; new mutations keep owner-scoped handles", () => {
  assert.equal(parseOutcome({ state: "COMMITTED", result: { kind: "upload", assetId: id } }).result?.assetId, id);
  assert.throws(() => parseOutcome({ state: "COMMITTED", result: { kind: "upload" } }));
  assert.throws(() => parseOutcome({ state: "COMMITTED", result: { kind: "workflow" } }));
  assert.deepEqual(readOperation(JSON.stringify({ actorId: "1", requestId: id, kind: "revision", token: "ignored", content: "ignored" }), "1"), { actorId: "1", requestId: id, kind: "revision" });
});
test("community list URLs retain filters and reject invalid destinations and pages", () => {
  const filters = communityFilters("view=favorites&kind=artwork&q=山水&tag=笔墨&workflow=revising&sort=popular&page=2");
  assert.deepEqual(communityFilters(communityHref(filters).split("?")[1]), filters);
  assert.equal(communityFilters("page=-5&sort=untrusted&kind=unknown").page, 0);
  assert.equal(communityFilters("page=-5&sort=untrusted&kind=unknown").sort, "latest");
  assert.equal(readCommunityReturn(JSON.stringify({ href: "//evil.invalid", scrollY: 50 })), null);
  assert.equal(readCommunityReturn(JSON.stringify({ href: "/community?kind=artwork", scrollY: 55 }))?.scrollY, 55);
});
test("draft restoration is account-scoped, expires, and never restores supplied credentials", () => {
  const now = Date.now(), draft = { ...emptyCommunityDraft(), title: "我的作品", content: "保留输入", images: [image] };
  const saved = JSON.stringify({ actorId: "1", savedAt: now, draft: { ...draft, token: "must not restore" } });
  assert.deepEqual(readCommunityDraft(saved, "1", now), draft);
  assert.equal(readCommunityDraft(saved, "2", now), null);
  assert.equal(readCommunityDraft(saved, "1", now + 25 * 60 * 60 * 1000), null);
  assert.notEqual(communityDraftKey("1"), communityDraftKey("2"));
});
test("assistant handoffs contain only explicit user-selected content, IDs, and a short lifetime", () => {
  const now = Date.now(), saved = JSON.stringify({ actorId: "1", savedAt: now, handoff: { target: "assistant", text: "请分析我的作品", postId: id, imageIds: [id], token: "ignored" } });
  const restored = readCommunityHandoff(saved, "1", now);
  assert.equal(restored?.postId, id); assert(!JSON.stringify(restored).includes("ignored"));
  assert.equal(readCommunityHandoff(saved, "2", now), null);
  assert.equal(readCommunityHandoff(saved, "1", now + 61 * 60 * 1000), null);
});

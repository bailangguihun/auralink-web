import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../lib/api.ts";
import { parseOutcome, parsePost, parseReference, readOperation, operationStorageKey, definiteWriteFailure } from "../lib/community.ts";
import { communityOrigin, communityPath, communityUpstreamFailure } from "../lib/community-proxy.ts";

const id = "23c2e7c7-3898-5ecd-9ca0-dc47fc7b2d39";
test("community read outages are retryable while failed writes keep unknown-outcome guidance", () => {
  for (const method of ["GET", "HEAD"]) {
    const error = communityUpstreamFailure(method);
    assert.equal(error.code, "COMMUNITY_UNAVAILABLE");
    assert.match(error.message, /稍后重试/);
    assert.doesNotMatch(error.message, /操作记录|重复提交/);
  }
  for (const method of ["POST", "PUT", "DELETE"]) {
    const error = communityUpstreamFailure(method);
    assert.equal(error.code, "COMMUNITY_RESULT_UNCERTAIN");
    assert.match(error.message, /不要重复提交/);
    assert.equal(definiteWriteFailure(new ApiError(error.message, 503, "server")), false);
  }
});
test("community results distinguish committed and not observed; incomplete successes remain unknown", () => {
  assert.equal(parseOutcome({ state: "NOT_OBSERVED", result: null }).state, "NOT_OBSERVED");
  assert.equal(parseOutcome({ state: "COMMITTED", result: { kind: "post", postId: id } }).result?.postId, id);
  assert.throws(() => parseOutcome({ state: "COMMITTED", result: {} }));
  assert.throws(() => parseOutcome({ state: "COMMITTED", result: { kind: "post", postId: "javascript:bad" } }));
  assert.throws(() => parseOutcome({ state: "UNKNOWN" }));
  assert.throws(() => parseOutcome({ state: "COMMITTED", result: { kind: "comment", postId: id } }));
  assert.throws(() => parseOutcome({ state: "COMMITTED", result: { kind: "like", postId: id } }));
  assert.equal(definiteWriteFailure(new Error("network")), false);
  assert.equal(definiteWriteFailure(new ApiError("timeout", 503, "server")), false);
  assert.equal(definiteWriteFailure(new ApiError("invalid", 400, "validation")), true);
});
test("restricted references discard stale metadata and URL fields", () => {
  assert.deepEqual(parseReference({ state: "UNAVAILABLE", paintingId: id, title: "private", imageUrl: "private" }),
    { state: "UNAVAILABLE", paintingId: id });
  assert.throws(() => parsePost({ id, content: "incomplete" }));
});
test("gallery references accept only the matching logical original image and tolerate old services", () => {
  const reference = { state: "AVAILABLE", paintingId: id, title: "山水", authorName: "作者", period: "清代" };
  const image = { assetId: id, contentUrl: `/api/v1/assets/${id}/content`, downloadUrl: `/api/v1/assets/${id}/download`,
    mimeType: "image/jpeg", width: 600, height: 1200, fileSize: null };
  assert.deepEqual(parseReference({ ...reference, image }).image, image);
  assert.equal(parseReference(reference).image, null);
  for (const contentUrl of ["https://untrusted.invalid/image.jpg", "/root/private.jpg", image.contentUrl + "?token=private", `/api/v1/assets/${id}/download`]) {
    assert.equal(parseReference({ ...reference, image: { ...image, contentUrl } }).image, null);
  }
  for (const state of ["UNAVAILABLE", "UNVERIFIED"]) {
    assert.deepEqual(parseReference({ ...reference, state, image }), { state, paintingId: id });
  }
  assert.deepEqual(parseReference({ ...reference, image: { ...image, width: -1, height: "1200", downloadUrl: "https://untrusted.invalid" } }).image,
    { ...image, width: null, height: null });
});
test("only owner-scoped operation handles survive reload", () => {
  const value = JSON.stringify({ actorId: "101", kind: "post", requestId: id, token: "must not survive parsing", content: "private" });
  assert.deepEqual(readOperation(value, "101"), { actorId: "101", kind: "post", requestId: id });
  assert.throws(() => readOperation(value, "202"));
  assert.notEqual(operationStorageKey("101"), operationStorageKey("202"));
  assert.equal(readOperation(null, "101"), null);
});
test("community proxy permits only pinned loopback destinations and specific paths", () => {
  assert.equal(communityOrigin(undefined), null);
  assert.equal(communityOrigin("http://127.0.0.1:3178"), "http://127.0.0.1:3178");
  for (const url of ["https://evil.invalid", "http://user:pass@127.0.0.1:3178", "http://127.0.0.1:3178/path"]) assert.throws(() => communityOrigin(url));
  assert.equal(communityPath(["posts", id, "comments"]), "/api/v1/community/posts/" + id + "/comments");
  for (const parts of [["..", "admin"], ["uploads", id], ["posts", id, "coins"]]) assert.throws(() => communityPath(parts));
});

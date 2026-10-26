import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../lib/api.ts";
import { parseOutcome, parsePost, parseReference, readOperation, operationStorageKey, definiteWriteFailure } from "../lib/community.ts";
import { communityOrigin, communityPath } from "../lib/community-proxy.ts";

const id = "23c2e7c7-3898-5ecd-9ca0-dc47fc7b2d39";
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

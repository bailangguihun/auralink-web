import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { api, ApiError } from "../lib/api.ts";
import { KnowledgeContractError, parsePaintingMetricPage, type PaintingMetricPage, type PaintingMetricQuery } from "../lib/knowledge-contracts.ts";
import { KnowledgeMetricReader, type MetricReadState } from "../lib/knowledge-metric-reader.ts";

const query: PaintingMetricQuery = { page: 0, size: 100, q: "", sort: "value" };
const page = (name = "完整项目"): PaintingMetricPage => ({ schemaVersion: 1, metric: "style", items: [{ name, value: 1 }], page: 0, size: 100, totalItems: 1, totalPages: 1, hasMore: false, revision: "a".repeat(64) });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("complete knowledge metric pages", () => {
  it("accepts a tail page beyond the old 100-item total cap", () => {
    const input = { ...page(), metric: "imagery" as const, page: 118, totalItems: 11819, totalPages: 119, items: Array.from({ length: 19 }, (_, i) => ({ name: `尾部词条 ${i}`, value: 1 })) };
    assert.deepEqual(parsePaintingMetricPage(input, "imagery"), input);
    const dynasty = { ...page(), metric: "dynasty" as const, size: 200, totalItems: 178, items: Array.from({ length: 178 }, (_, i) => ({ name: `朝代原值 ${i}`, value: 1 })) };
    assert.equal(parsePaintingMetricPage(dynasty, "dynasty").items.length, 178);
  });
  it("rejects incomplete pages, duplicate names, inconsistent totals, and another metric", () => {
    for (const input of [
      { ...page(), totalItems: 2 }, { ...page(), totalPages: 2 }, { ...page(), hasMore: true },
      { ...page(), totalItems: 2, items: [page().items[0], page().items[0]] },
      { ...page(), size: 201 }, { ...page(), revision: "" }, { ...page(), metric: "imagery" },
    ]) assert.throws(() => parsePaintingMetricPage(input, "style"), KnowledgeContractError);
  });
  it("accepts empty search and an out-of-range page without inventing groups", () => {
    const empty = { ...page(), page: 9, totalItems: 0, totalPages: 0, items: [] };
    assert.deepEqual(parsePaintingMetricPage(empty, "style"), empty);
    assert.equal(parsePaintingMetricPage({ ...page(), page: 5, items: [] }, "style").items.length, 0);
  });
  it("preserves decimal rule scores and encodes search as a literal query", async () => {
    const score = { ...page(), metric: "sentimentByDynasty" as const, items: [{ name: "原始年代", value: 74.25 }] };
    assert.equal(parsePaintingMetricPage(score, "sentimentByDynasty").items[0].value, 74.25);
    let url: URL | null = null;
    globalThis.fetch = async input => { url = new URL(String(input)); return new Response(JSON.stringify(page()), { headers: { "Content-Type": "application/json" } }); };
    await api.paintingMetric("style", { ...query, q: "山&水 100%", revision: "b".repeat(64) }, "isolated-test-token");
    const requested = url as unknown as URL;
    assert.equal(requested.pathname, "/api/v1/knowledge/painting-statistics/style");
    assert.equal(requested.searchParams.get("q"), "山&水 100%");
    assert.equal(requested.searchParams.get("revision"), "b".repeat(64));
  });
});

describe("knowledge metric request ownership", () => {
  it("aborts an old query and ignores a late response after a new query succeeds", async () => {
    const old = deferred<PaintingMetricPage>(), fresh = deferred<PaintingMetricPage>();
    const signals: AbortSignal[] = [], states: MetricReadState[] = [];
    const reader = new KnowledgeMetricReader((params, signal) => { signals.push(signal); return params.q === "new" ? fresh.promise : old.promise; }, () => true, state => states.push(state), () => assert.fail("unexpected sign out"));
    const first = reader.read(query), second = reader.read({ ...query, q: "new" });
    assert.equal(signals[0].aborted, true);
    fresh.resolve(page("新查询")); await second;
    old.resolve(page("旧查询")); await first;
    assert.deepEqual(states.filter(state => state.data).map(state => state.data?.items[0].name), ["新查询"]);
  });
  it("rejects both stale data and delayed unauthorized errors after account replacement", async () => {
    for (const failure of [false, true]) {
      const pending = deferred<PaintingMetricPage>(); let current = true, signedOut = false;
      const states: MetricReadState[] = [];
      const reader = new KnowledgeMetricReader(() => pending.promise, () => current, state => states.push(state), () => { signedOut = true; });
      const result = reader.read(query); current = false;
      if (failure) pending.reject(new ApiError("old account", 401, "unauthorized")); else pending.resolve(page("旧账号"));
      await result;
      assert.equal(signedOut, false); assert.equal(states.length, 1); assert.equal(states[0].loading, true);
    }
  });
  it("handles the current account's unauthorized response", async () => {
    let signedOut = false;
    const reader = new KnowledgeMetricReader(async () => { throw new ApiError("expired", 401, "unauthorized"); }, () => true, () => {}, () => { signedOut = true; });
    await reader.read(query); assert.equal(signedOut, true);
  });
  it("starts page zero exactly once when a pinned revision changes", async () => {
    const calls: PaintingMetricQuery[] = [], states: MetricReadState[] = [];
    const reader = new KnowledgeMetricReader(async params => { calls.push(params); if (calls.length === 1) throw new ApiError("changed", 409, "conflict"); return page(); }, () => true, state => states.push(state), () => {});
    await reader.read({ ...query, page: 56, revision: "old" });
    assert.equal(calls.length, 2); assert.equal(calls[1].page, 0); assert.equal(calls[1].revision, undefined);
    assert.equal(states.at(-1)?.data?.page, 0);
  });
  it("does not keep retrying conflicts or retry an unpinned request", async () => {
    for (const revision of [undefined, "old"]) {
      let calls = 0; const states: MetricReadState[] = [];
      const reader = new KnowledgeMetricReader(async () => { calls++; throw new ApiError("changed", 409, "conflict"); }, () => true, state => states.push(state), () => {});
      await reader.read({ ...query, revision });
      assert.equal(calls, revision ? 2 : 1); assert.equal(states.at(-1)?.error, "changed");
    }
  });
  it("resets a no-longer-existing page and fences completion after disposal", async () => {
    const states: MetricReadState[] = [], calls: PaintingMetricQuery[] = [];
    const reader = new KnowledgeMetricReader(async params => { calls.push(params); return params.page ? { ...page(), page: params.page, items: [] } : page(); }, () => true, state => states.push(state), () => {});
    await reader.read({ ...query, page: 4 });
    assert.deepEqual(calls.map(item => item.page), [4, 0]);
    assert.equal(states.at(-1)?.data?.page, 0);
    const pending = deferred<PaintingMetricPage>(); let emitted = 0;
    const disposed = new KnowledgeMetricReader(() => pending.promise, () => true, () => { emitted++; }, () => {});
    const result = disposed.read(query); disposed.dispose(); pending.resolve(page()); await result;
    assert.equal(emitted, 1);
  });
});

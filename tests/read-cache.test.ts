import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ReadCache } from "../lib/read-cache.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const abortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe("session-scoped read cache", () => {
  it("reuses fresh results and expires relative to completion without extending TTL on reads", async () => {
    let now = 10;
    const cache = new ReadCache({ now: () => now });
    const pending = deferred<{ count: number }>();
    let requests = 0;
    const result = cache.read(0, "stats", () => { requests++; return pending.promise; }, { ttlMs: 100 });
    await flush();
    now = 40;
    pending.resolve({ count: 12 });
    await result;
    now = 139;
    assert.deepEqual(await cache.read(0, "stats", async () => { requests++; return { count: 13 }; }, { ttlMs: 100 }), { count: 12 });
    assert.equal(requests, 1);
    now = 140;
    assert.equal(cache.peek(0, "stats"), undefined);
    assert.deepEqual(await cache.read(0, "stats", async () => { requests++; return { count: 13 }; }, { ttlMs: 100 }), { count: 13 });
    assert.equal(requests, 2);
  });

  it("deduplicates prefetch and foreground reads, including concurrent force reads", async () => {
    const cache = new ReadCache();
    const pending = deferred<string>();
    let requests = 0;
    const load = () => { requests++; return pending.promise; };
    const first = cache.read(0, "paintings", load, { ttlMs: 500 });
    const second = cache.read(0, "paintings", load, { ttlMs: 500 });
    const forced = cache.read(0, "paintings", load, { ttlMs: 500, force: true });
    await flush();
    assert.equal(requests, 1);
    pending.resolve("one response");
    assert.deepEqual(await Promise.all([first, second, forced]), ["one response", "one response", "one response"]);
  });

  it("does not abort a foreground subscriber when a prefetch consumer cancels", async () => {
    const cache = new ReadCache();
    const pending = deferred<string>();
    const prefetchController = new AbortController();
    let underlying!: AbortSignal;
    const prefetch = cache.read(0, "stats", signal => { underlying = signal; return pending.promise; }, { ttlMs: 500, signal: prefetchController.signal });
    const foreground = cache.read(0, "stats", async () => "must not execute", { ttlMs: 500 });
    const rejected = assert.rejects(prefetch, abortError);
    await flush();
    prefetchController.abort();
    await rejected;
    assert.equal(underlying.aborted, false);
    pending.resolve("visible result");
    assert.equal(await foreground, "visible result");
    assert.equal(cache.peek(0, "stats"), "visible result");
  });

  it("aborts transport when its last consumer leaves and discards an ignored-abort late response", async () => {
    const cache = new ReadCache();
    const old = deferred<string>();
    const controller = new AbortController();
    let transport!: AbortSignal;
    const request = cache.read(0, "stats", signal => { transport = signal; return old.promise; }, { ttlMs: 500, signal: controller.signal });
    const rejected = assert.rejects(request, abortError);
    await flush();
    controller.abort();
    await rejected;
    assert.equal(transport.aborted, true);
    assert.equal(await cache.read(0, "stats", async () => "new", { ttlMs: 500 }), "new");
    old.resolve("old");
    await flush();
    assert.equal(cache.peek(0, "stats"), "new");
  });

  it("does not launch loaders for already-aborted or obsolete-session consumers", async () => {
    const cache = new ReadCache();
    const controller = new AbortController();
    controller.abort();
    let requests = 0;
    const loader = async () => { requests++; return "unexpected"; };
    cache.reset(2);
    await assert.rejects(cache.read(0, "stats", loader, { ttlMs: 500 }), abortError);
    await assert.rejects(cache.read(2, "stats", loader, { ttlMs: 500, signal: controller.signal }), abortError);
    assert.equal(requests, 0);
    assert.equal(await cache.read(2, "stats", async () => "current", { ttlMs: 500 }), "current");
    assert.equal(cache.peek(0, "stats"), undefined);
    assert.equal(cache.peek(2, "stats"), "current");
  });

  it("clears completed and pending private results on account reset and rejects late completions", async () => {
    const cache = new ReadCache();
    cache.reset(4);
    await cache.read(4, "community:page:0", async () => ({ actor: "A" }), { ttlMs: 500 });
    const old = deferred<string>();
    const request = cache.read(4, "stats", () => old.promise, { ttlMs: 500 });
    const rejected = assert.rejects(request, abortError);
    await flush();
    cache.reset(5);
    await rejected;
    assert.equal(cache.peek(5, "community:page:0"), undefined);
    assert.equal(await cache.read(5, "stats", async () => "B", { ttlMs: 500 }), "B");
    old.resolve("A");
    await flush();
    assert.equal(cache.peek(4, "stats"), undefined);
    assert.equal(cache.peek(5, "stats"), "B");
  });

  it("reset also invalidates pending work when the generation number stays the same", async () => {
    const cache = new ReadCache();
    const old = deferred<string>();
    const request = cache.read(0, "stats", () => old.promise, { ttlMs: 500 });
    const rejected = assert.rejects(request, abortError);
    await flush();
    cache.reset(0);
    await rejected;
    await cache.read(0, "stats", async () => "fresh", { ttlMs: 500 });
    old.resolve("stale");
    await flush();
    assert.equal(cache.peek(0, "stats"), "fresh");
  });

  it("invalidates matching cached and in-flight prefixes without affecting unrelated data", async () => {
    const cache = new ReadCache();
    await cache.read(0, "community:page:0", async () => "cached post", { ttlMs: 500 });
    await cache.read(0, "knowledge:stats", async () => "stats", { ttlMs: 500 });
    const old = deferred<string>();
    const request = cache.read(0, "community:post:1", () => old.promise, { ttlMs: 500 });
    const rejected = assert.rejects(request, abortError);
    await flush();
    cache.invalidate(0, "community:");
    await rejected;
    old.resolve("outdated post");
    await flush();
    assert.equal(cache.peek(0, "community:page:0"), undefined);
    assert.equal(cache.peek(0, "community:post:1"), undefined);
    assert.equal(cache.peek(0, "knowledge:stats"), "stats");
    cache.invalidate(1);
    assert.equal(cache.peek(0, "knowledge:stats"), "stats");
  });

  it("forces a fresh request and does not reuse a failed refresh or cached errors", async () => {
    const cache = new ReadCache();
    let requests = 0;
    const load = async () => ++requests;
    assert.equal(await cache.read(0, "stats", load, { ttlMs: 500 }), 1);
    assert.equal(await cache.read(0, "stats", load, { ttlMs: 500, force: true }), 2);
    const failure = new Error("503 unavailable");
    await assert.rejects(cache.read(0, "stats", async () => { throw failure; }, { ttlMs: 500, force: true }), error => error === failure);
    assert.equal(cache.peek(0, "stats"), undefined);
    assert.equal(await cache.read(0, "stats", load, { ttlMs: 500 }), 3);
  });

  it("evicts the least recently used entry at the entry limit", async () => {
    const cache = new ReadCache({ maxEntries: 2 });
    await cache.read(0, "a", async () => "A", { ttlMs: 500 });
    await cache.read(0, "b", async () => "B", { ttlMs: 500 });
    assert.equal(cache.peek(0, "a"), "A");
    await cache.read(0, "c", async () => "C", { ttlMs: 500 });
    assert.equal(cache.peek(0, "b"), undefined);
    assert.equal(cache.peek(0, "a"), "A");
    assert.equal(cache.peek(0, "c"), "C");
  });

  it("enforces estimated byte limits and delivers oversized data without retaining it", async () => {
    // Each JSON string below occupies 12 estimated UTF-16 bytes, including quotes.
    const cache = new ReadCache({ maxBytes: 24 });
    await cache.read(0, "a", async () => "aaaa", { ttlMs: 500 });
    await cache.read(0, "b", async () => "bbbb", { ttlMs: 500 });
    await cache.read(0, "c", async () => "cccc", { ttlMs: 500 });
    assert.equal(cache.peek(0, "a"), undefined);
    assert.equal(cache.peek(0, "b"), "bbbb");
    assert.equal(cache.peek(0, "c"), "cccc");
    const large = "x".repeat(30);
    assert.equal(await cache.read(0, "huge", async () => large, { ttlMs: 500 }), large);
    assert.equal(cache.peek(0, "huge"), undefined);
    assert.equal(cache.peek(0, "b"), "bbbb", "oversized reads must not flush otherwise useful entries");
  });

  it("uses the shortest concurrent TTL and can serve nonretained reads", async () => {
    let now = 0;
    const cache = new ReadCache({ now: () => now });
    const pending = deferred<null>();
    const long = cache.read(0, "stats", () => pending.promise, { ttlMs: 500 });
    const short = cache.read(0, "stats", async () => null, { ttlMs: 10 });
    pending.resolve(null);
    await Promise.all([long, short]);
    assert.equal(cache.peek(0, "stats"), null);
    now = 10;
    assert.equal(cache.peek(0, "stats"), undefined);
    assert.equal(await cache.read(0, "ephemeral", async () => "now", { ttlMs: 0 }), "now");
    assert.equal(cache.peek(0, "ephemeral"), undefined);
  });
});

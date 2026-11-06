import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { PaintingDetailData, prefetchPaintingDetail, readPaintingDetail } from "../lib/painting-detail-data.ts";
import { ReadCache, readCache } from "../lib/read-cache.ts";
import type { PaintingDetail } from "../lib/types.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; readCache.reset(0); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const abortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const detail = (paintingId: string, title = "山居叠翠"): PaintingDetail => ({
  paintingId, title, authorName: "陆道淮", creationDynastyRaw: "清代", creationDynastyNormalized: "清代",
  category: null, subject: null, paintingSchool: null, style: null, artisticConception: null,
  imageAvailable: false, image: null, favorited: false,
  sourceSequence: null, imageStorageName: null, authorBirthYear: null, authorBirthPlace: null,
  authorSchool: null, creationYear: null, actualSize: null, collectionInstitution: null,
  color: null, composition: null, brushwork: null, inkMethod: null, paintingMaterial: null,
  pigment: null, seal: null, culturalSymbol: null, generatedText: "作品资料", musicSceneDescription: null,
  collectionPlatform: null, visibleInGallery: true, status: "ACTIVE",
});

describe("painting detail reads", () => {
  it("shares repeated confirmed clicks, the foreground read, and a fresh revisit through the production cache", async () => {
    readCache.reset(7);
    const response = deferred<Response>();
    const requests: Array<{ path: string; method: string; authorization: string | null }> = [];
    globalThis.fetch = async (input, init) => {
      requests.push({ path: new URL(String(input)).pathname, method: init?.method || "GET",
        authorization: new Headers(init?.headers).get("Authorization") });
      return response.promise;
    };
    const firstClick = prefetchPaintingDetail("painting-a", "session-a", 7);
    const secondClick = prefetchPaintingDetail("painting-a", "session-a", 7);
    const foreground = readPaintingDetail("painting-a", "session-a", 7);
    assert.equal(firstClick, secondClick);
    await flush();
    assert.deepEqual(requests, [{ path: "/api/v1/paintings/painting-a", method: "GET", authorization: "Bearer session-a" }]);
    response.resolve(Response.json(detail("painting-a")));
    const values = await Promise.all([firstClick, secondClick, foreground]);
    assert(values.every(value => value.title === "山居叠翠"));
    assert.equal((await readPaintingDetail("painting-a", "session-a", 7)).paintingId, "painting-a");
    assert.equal(requests.length, 1);
  });

  it("switches prefetch to the newly selected artwork without cancelling an existing detail subscriber", async () => {
    const data = new PaintingDetailData(new ReadCache());
    const responses = new Map<string, ReturnType<typeof deferred<Response>>>();
    const transports = new Map<string, AbortSignal>();
    globalThis.fetch = async (input, init) => {
      const id = new URL(String(input)).pathname.split("/").at(-1)!;
      const response = deferred<Response>(); responses.set(id, response);
      transports.set(id, init!.signal!);
      return response.promise;
    };
    const prefetchA = data.prefetch("a", "token", 0);
    const cancelledA = assert.rejects(prefetchA, abortError);
    const foregroundA = data.read("a", "token", 0);
    await flush();
    const prefetchB = data.prefetch("b", "token", 0);
    await cancelledA; await flush();
    assert.equal(transports.get("a")!.aborted, false);
    responses.get("a")!.resolve(Response.json(detail("a")));
    responses.get("b")!.resolve(Response.json(detail("b")));
    assert.equal((await foregroundA).paintingId, "a");
    assert.equal((await prefetchB).paintingId, "b");
    assert.equal(responses.size, 2);
  });

  it("abandons the old prefetch transport when a different click is its only consumer", async () => {
    const data = new PaintingDetailData(new ReadCache());
    const oldResponse = deferred<Response>();
    let oldTransport!: AbortSignal;
    let requests = 0;
    globalThis.fetch = async (input, init) => {
      requests++;
      if (String(input).endsWith("/a")) { oldTransport = init!.signal!; return oldResponse.promise; }
      return Response.json(detail("b"));
    };
    const first = data.prefetch("a", "token", 0);
    const cancelled = assert.rejects(first, abortError);
    await flush();
    assert.equal((await data.prefetch("b", "token", 0)).paintingId, "b");
    await cancelled;
    assert.equal(oldTransport.aborted, true);
    oldResponse.resolve(Response.json(detail("a")));
    await flush();
    assert.equal(requests, 2);
  });

  it("cancelling the foreground consumer leaves the pending confirmed-click prefetch usable", async () => {
    const data = new PaintingDetailData(new ReadCache());
    const response = deferred<Response>();
    let transport!: AbortSignal;
    let requests = 0;
    globalThis.fetch = async (_input, init) => { requests++; transport = init!.signal!; return response.promise; };
    const prefetch = data.prefetch("a", "token", 0);
    const controller = new AbortController();
    const foreground = data.read("a", "token", 0, controller.signal);
    const cancelled = assert.rejects(foreground, abortError);
    await flush(); controller.abort(); await cancelled;
    assert.equal(transport.aborted, false);
    response.resolve(Response.json(detail("a")));
    await prefetch;
    assert.equal((await data.read("a", "token", 0)).title, "山居叠翠");
    assert.equal(requests, 1);
  });

  it("expires details 30 seconds after completion without extending retention on repeat reads", async () => {
    let now = 0;
    const data = new PaintingDetailData(new ReadCache({ now: () => now }));
    const response = deferred<Response>();
    let requests = 0;
    globalThis.fetch = async () => ++requests === 1 ? response.promise : Response.json(detail("a", "更新资料"));
    const pending = data.read("a", "token", 0);
    await flush(); now = 500;
    response.resolve(Response.json(detail("a"))); await pending;
    now = 30_499;
    assert.equal((await data.read("a", "token", 0)).title, "山居叠翠");
    assert.equal(requests, 1);
    now = 30_500;
    assert.equal((await data.read("a", "token", 0)).title, "更新资料");
    assert.equal(requests, 2);
  });

  it("bounds the prefetch consumer to 15 seconds while a foreground consumer can keep waiting", async context => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const data = new PaintingDetailData(new ReadCache());
    const response = deferred<Response>();
    let transport!: AbortSignal;
    globalThis.fetch = async (_input, init) => { transport = init!.signal!; return response.promise; };
    const prefetch = data.prefetch("a", "token", 0);
    const cancelled = assert.rejects(prefetch, abortError);
    const foreground = data.read("a", "token", 0);
    await flush();
    context.mock.timers.tick(14_999);
    assert.equal(transport.aborted, false);
    context.mock.timers.tick(1);
    await cancelled;
    assert.equal(transport.aborted, false);
    response.resolve(Response.json(detail("a")));
    assert.equal((await foreground).paintingId, "a");
  });

  it("aborts an unclaimed prefetch at its deadline without retrying or caching a late response", async context => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const data = new PaintingDetailData(new ReadCache());
    const response = deferred<Response>();
    let transport!: AbortSignal;
    let requests = 0;
    globalThis.fetch = async (_input, init) => {
      requests++; transport = init!.signal!;
      return requests === 1 ? response.promise : Response.json(detail("a", "fresh"));
    };
    const prefetch = data.prefetch("a", "token", 0);
    const cancelled = assert.rejects(prefetch, abortError);
    await flush(); context.mock.timers.tick(15_000); await cancelled;
    assert.equal(transport.aborted, true);
    response.resolve(Response.json(detail("a", "late"))); await flush();
    assert.equal(requests, 1);
    assert.equal((await data.read("a", "token", 0)).title, "fresh");
    assert.equal(requests, 2);
  });

  it("clears prior-account details and pending prefetch on a synchronous session reset", async () => {
    const cache = new ReadCache();
    const data = new PaintingDetailData(cache);
    cache.reset(10);
    const oldResponse = deferred<Response>();
    let oldTransport!: AbortSignal;
    const requests: Array<string | null> = [];
    globalThis.fetch = async (_input, init) => {
      requests.push(new Headers(init?.headers).get("Authorization"));
      if (requests.length === 2) { oldTransport = init!.signal!; return oldResponse.promise; }
      return Response.json(detail("a", requests.length === 1 ? "old cached" : "new account"));
    };
    await data.read("a", "old-token", 10);
    const prefetch = data.prefetch("b", "old-token", 10);
    const cancelled = assert.rejects(prefetch, abortError);
    await flush(); cache.reset(11); await cancelled;
    assert.equal(oldTransport.aborted, true);
    assert.equal((await data.read("a", "new-token", 11)).title, "new account");
    await assert.rejects(data.read("a", "old-token", 10), abortError);
    oldResponse.resolve(Response.json(detail("b", "old late response"))); await flush();
    assert.deepEqual(requests, ["Bearer old-token", "Bearer old-token", "Bearer new-token"]);
    assert.equal((await data.read("a", "new-token", 11)).title, "new account");
  });

  it("does not let a delayed old-account click cancel the new account's prefetch", async () => {
    const cache = new ReadCache(); cache.reset(12);
    const data = new PaintingDetailData(cache);
    const response = deferred<Response>();
    let transport!: AbortSignal;
    let requests = 0;
    globalThis.fetch = async (_input, init) => { requests++; transport = init!.signal!; return response.promise; };
    const current = data.prefetch("a", "new-token", 12); await flush();
    await assert.rejects(data.prefetch("b", "old-token", 11), abortError);
    assert.equal(transport.aborted, false);
    response.resolve(Response.json(detail("a"))); await current;
    assert.equal(requests, 1);
  });

  it("does not cache errors or retry internally, and force refresh bypasses a retained detail", async () => {
    const data = new PaintingDetailData(new ReadCache());
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      return requests === 1 || requests === 4
        ? Response.json({ message: "暂不可用" }, { status: 503 })
        : Response.json(detail("a", `version ${requests}`));
    };
    await assert.rejects(data.prefetch("a", "token", 0), { status: 503 });
    await flush(); assert.equal(requests, 1);
    assert.equal((await data.read("a", "token", 0)).title, "version 2");
    assert.equal((await data.read("a", "token", 0)).title, "version 2");
    assert.equal((await data.read("a", "token", 0, undefined, true)).title, "version 3");
    await assert.rejects(data.read("a", "token", 0, undefined, true), { status: 503 });
    assert.equal((await data.read("a", "token", 0)).title, "version 5");
    assert.equal(requests, 5);
  });

  it("explicit retry replaces a stalled prefetch and foreground transport and ignores its late response", async () => {
    const data = new PaintingDetailData(new ReadCache());
    const responses = [deferred<Response>(), deferred<Response>()];
    const transports: AbortSignal[] = [];
    globalThis.fetch = async (_input, init) => {
      transports.push(init!.signal!);
      return responses[transports.length - 1].promise;
    };
    const prefetch = data.prefetch("a", "token", 0);
    const foreground = data.read("a", "token", 0);
    const rejected = Promise.all([assert.rejects(prefetch, abortError), assert.rejects(foreground, abortError)]);
    await flush(); assert.equal(transports.length, 1);

    const retry = data.read("a", "token", 0, undefined, true);
    const nextClick = data.prefetch("a", "token", 0);
    await rejected; await flush();
    assert.equal(transports.length, 2, "the retry starts a new GET even while prefetch was subscribed");
    assert.equal(transports[0].aborted, true);
    assert.equal(transports[1].aborted, false);
    responses[1].resolve(Response.json(detail("a", "fresh retry")));
    assert.equal((await retry).title, "fresh retry");
    assert.equal((await nextClick).title, "fresh retry");
    responses[0].resolve(Response.json(detail("a", "late stale response"))); await flush();
    assert.equal((await data.read("a", "token", 0)).title, "fresh retry");
    assert.equal(transports.length, 2);
  });

  it("retry invalidation is exact and preserves another ID's cache and in-flight read", async () => {
    const data = new PaintingDetailData(new ReadCache());
    const otherResponses = new Map([['ab', deferred<Response>()], ['a:other', deferred<Response>()]]);
    const transports = new Map<string, AbortSignal>();
    const counts = new Map<string, number>();
    globalThis.fetch = async (input, init) => {
      const id = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1)!);
      counts.set(id, (counts.get(id) || 0) + 1); transports.set(id, init!.signal!);
      return otherResponses.get(id)?.promise || Response.json(detail(id));
    };
    await data.read("a-cached", "token", 0);
    const otherReads = [...otherResponses.keys()].map(id => data.read(id, "token", 0));
    await flush();
    await data.read("a", "token", 0, undefined, true);
    for (const [id, response] of otherResponses) {
      assert.equal(transports.get(id)!.aborted, false, `${id} transport must survive the unrelated retry`);
      response.resolve(Response.json(detail(id)));
    }
    await Promise.all(otherReads);
    await data.read("a-cached", "token", 0);
    for (const id of ["a-cached", ...otherResponses.keys()]) {
      await data.read(id, "token", 0);
      assert.equal(counts.get(id), 1, `${id} cached result must survive the unrelated retry`);
    }
  });

  it("an already-cancelled retry cannot invalidate an active subscriber", async () => {
    const data = new PaintingDetailData(new ReadCache());
    const response = deferred<Response>();
    let transport!: AbortSignal;
    let requests = 0;
    globalThis.fetch = async (_input, init) => { requests++; transport = init!.signal!; return response.promise; };
    const current = data.read("a", "token", 0); await flush();
    const controller = new AbortController(); controller.abort();
    await assert.rejects(data.read("a", "token", 0, controller.signal, true), abortError);
    assert.equal(transport.aborted, false);
    response.resolve(Response.json(detail("a"))); await current;
    assert.equal(requests, 1);
  });
});

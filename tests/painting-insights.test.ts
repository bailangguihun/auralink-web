import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { api } from "../lib/api.ts";
import { parseHistoricalPaintingGuide, parsePaintingCritiqueTask, parsePaintingGuide, PaintingInsightContractError } from "../lib/painting-insight-contracts.ts";
import { PaintingInsightsController, pollCritiqueTask, type PaintingInsightsState } from "../lib/painting-insights.ts";
import type { PollingPolicy } from "../lib/creation-polling.ts";
import { critiqueId, critiquePayload, guidePayload, historicalGuidePayload, paintingId } from "./fixtures/painting-insights.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function mockMissing(options: { capability?: boolean; post?: (url: string) => Promise<Response> } = {}) {
  const requests: Array<{ url: string; method: string; signal: AbortSignal | null | undefined }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method || "GET", signal: init?.signal });
    if (init?.method === "POST") return options.post ? options.post(url) : json(url.endsWith("/guide") ? { ...guidePayload, cacheStatus: "GENERATED" } : critiquePayload());
    if (url.endsWith("/critic/capability")) return json({ submissionAvailable: options.capability ?? true, reason: "READY_FOR_CONTROLLED_EVALUATION" });
    if (url.endsWith("/guide/history")) return json({ code: "GUIDE_HISTORICAL_NOT_AVAILABLE" }, 404);
    if (url.endsWith("/guide")) return json({ code: "GUIDE_NOT_AVAILABLE" }, 404);
    return json({ code: "CRITIC_TASK_NOT_FOUND" }, 404);
  };
  return requests;
}
function controller(options: { current?: () => boolean; imageAvailable?: boolean } = {}) {
  const updates: PaintingInsightsState[] = [];
  const instance = new PaintingInsightsController({
    paintingId, token: "fixture-token", imageAvailable: options.imageAvailable ?? true,
    isCurrent: options.current ?? (() => true), onUnauthorized: () => undefined, onChange: (value) => updates.push(value),
  });
  return { instance, updates };
}

describe("painting insight contracts", () => {
  it("keeps historical scope and rejects mismatched paintings", () => {
    assert.equal(parsePaintingGuide(guidePayload, paintingId).cacheStatus, "HIT");
    const historical = parseHistoricalPaintingGuide(historicalGuidePayload, paintingId);
    assert.equal(historical.currentApplicability, "UNVERIFIED");
    assert.equal("cacheStatus" in historical, false);
    assert.throws(() => parsePaintingGuide(guidePayload, "different-painting"), PaintingInsightContractError);
    assert.throws(() => parseHistoricalPaintingGuide({ ...historicalGuidePayload, currentApplicability: "VERIFIED" }, paintingId), PaintingInsightContractError);
  });
  it("accepts optional empty Guide sections and refuses invalid timestamps", () => {
    assert.equal(parsePaintingGuide({ ...guidePayload, sections: {} }, paintingId).sections.composition, null);
    assert.throws(() => parsePaintingGuide({ ...guidePayload, updatedAt: "invalid" }, paintingId), PaintingInsightContractError);
  });
  it("validates the deployed score-free four-dimension schema", () => {
    const payload = critiquePayload();
    const task = parsePaintingCritiqueTask(payload, paintingId, critiqueId);
    assert.equal(task.result?.dimensions.length, 4);
    assert.equal(task.result?.dimensions[0].dimensionName, "气韵与意境");
    assert.throws(() => parsePaintingCritiqueTask(payload, paintingId, "other-task"), PaintingInsightContractError);
    payload.result!.meta.scoring_used = true;
    assert.throws(() => parsePaintingCritiqueTask(payload, paintingId), PaintingInsightContractError);
    const duplicate = critiquePayload();
    duplicate.result!.report.dimension_assessments[1].dimension_id = "qiyun_yijing";
    assert.throws(() => parsePaintingCritiqueTask(duplicate, paintingId), PaintingInsightContractError);
    assert.throws(() => parsePaintingCritiqueTask({ ...critiquePayload(), result: null }, paintingId), PaintingInsightContractError);
  });
  it("keeps valid saved Critic reports readable when list[str] contains blank bullets", () => {
    const payload = critiquePayload();
    payload.result!.report.dimension_assessments[0].limitations = ["", "  ", "保留的局限"];
    payload.result!.report.consensus = ["", "已有共识"];
    payload.result!.report.viewing_limitations = ["\t"];
    const task = parsePaintingCritiqueTask(payload, paintingId);
    assert.deepEqual(task.result?.dimensions[0].limitations, ["保留的局限"]);
    assert.deepEqual(task.result?.consensus, ["已有共识"]);
    assert.deepEqual(task.result?.viewingLimitations, []);
    assert.throws(() => parsePaintingCritiqueTask({
      ...payload, result: { ...payload.result, report: { ...payload.result!.report, consensus: [42] } },
    }, paintingId), PaintingInsightContractError);
    assert.throws(() => parsePaintingGuide({ ...guidePayload, highlights: [""] }, paintingId), PaintingInsightContractError);
  });
});

describe("painting insight recovery and explicit submissions", () => {
  it("initializes, refreshes and recovers missing results using GET only", async () => {
    const requests = mockMissing();
    const { instance } = controller();
    await instance.start();
    assert.equal(instance.state.guide.state, "missing");
    assert.equal(instance.state.critique.state, "missing");
    await Promise.all([instance.readGuide(), instance.readCritique()]);
    assert.equal(requests.length, 8);
    assert.ok(requests.every((request) => request.method === "GET"));
    assert.ok(requests.every((request) => request.signal));
    instance.dispose();
  });
  it("reads historical Guide separately and never generates as a 404 fallback", async () => {
    const requests = mockMissing();
    const fallback = globalThis.fetch;
    globalThis.fetch = async (input, init) => String(input).endsWith("/guide/history") ? json(historicalGuidePayload) : fallback(input, init);
    const { instance } = controller();
    await instance.start();
    assert.equal(instance.state.guide.state, "historical");
    assert.ok(requests.every((request) => request.method === "GET"));
    instance.dispose();
  });
  it("does not interpret missing artwork or forbidden access as a generation invitation", async () => {
    for (const status of [403, 404]) {
      const methods: string[] = [];
      globalThis.fetch = async (_input, init) => { methods.push(init?.method || "GET"); return json({ code: "PAINTING_NOT_FOUND" }, status); };
      const { instance } = controller();
      await instance.start();
      await Promise.all([instance.generateGuide(), instance.submitCritique()]);
      assert.equal(instance.state.guide.state, "error");
      assert.equal(instance.state.critique.state, "error");
      assert.equal(methods.length, 3);
      assert.ok(methods.every((method) => method === "GET"));
      instance.dispose();
    }
  });
  it("synchronously blocks duplicate Guide and Critic clicks while each POST is pending", async () => {
    const guideResponse = deferred<Response>();
    const criticResponse = deferred<Response>();
    const requests = mockMissing({ post: (url) => url.endsWith("/guide") ? guideResponse.promise : criticResponse.promise });
    const { instance } = controller();
    await instance.start();
    const guide = instance.generateGuide();
    const critic = instance.submitCritique();
    await Promise.all([instance.generateGuide(), instance.submitCritique(), instance.readGuide(), instance.readCritique()]);
    assert.equal(requests.filter((request) => request.method === "POST").length, 2);
    guideResponse.resolve(json({ ...guidePayload, cacheStatus: "GENERATED" }));
    criticResponse.resolve(json(critiquePayload()));
    await Promise.all([guide, critic]);
    assert.equal(instance.state.guide.state, "available");
    assert.equal(instance.state.critique.state, "success");
    instance.dispose();
  });
  it("never retries an uncertain POST and uses only GET for manual recovery", async () => {
    const requests = mockMissing({ post: async () => json({ code: "PROVIDER_TIMEOUT", message: "请求超时" }, 504) });
    const { instance } = controller();
    await instance.start();
    await Promise.all([instance.generateGuide(), instance.submitCritique()]);
    assert.equal(instance.state.guide.state, "error");
    assert.equal(instance.state.critique.state, "error");
    await Promise.all([instance.generateGuide(), instance.submitCritique()]);
    assert.equal(requests.filter((request) => request.method === "POST").length, 2);
    await Promise.all([instance.readGuide(), instance.readCritique()]);
    assert.equal(requests.filter((request) => request.method === "POST").length, 2);
    instance.dispose();
  });
  it("blocks Critic submissions when capability is disabled or image is missing", async () => {
    for (const mode of ["disabled", "missing-image"]) {
      const requests = mockMissing({ capability: mode !== "disabled" });
      const { instance } = controller({ imageAvailable: mode !== "missing-image" });
      await instance.start();
      await instance.submitCritique();
      assert.equal(requests.some((request) => request.method === "POST"), false);
      instance.dispose();
    }
  });
  it("keeps successful saved Critic results readable even when new submissions are disabled", async () => {
    globalThis.fetch = async (input) => String(input).endsWith("/critic/capability")
      ? json({ submissionAvailable: false, reason: "CRITIC_DISABLED_OR_UNCONFIGURED" }) : json(critiquePayload());
    const { instance } = controller();
    await instance.readCritique();
    assert.equal(instance.state.critique.state, "success");
    assert.ok(instance.state.critique.task?.result);
    instance.dispose();
  });
  it("ignores late responses after account generation changes, even if transport ignores abort", async () => {
    const response = deferred<Response>();
    globalThis.fetch = async () => response.promise;
    let current = true;
    const { instance, updates } = controller({ current: () => current });
    const read = instance.readGuide();
    const count = updates.length;
    current = false;
    response.resolve(json(guidePayload));
    await read;
    assert.equal(updates.length, count);
    instance.dispose();
  });
  it("aborts an old artwork controller and drops its late POST response", async () => {
    const response = deferred<Response>();
    const requests = mockMissing({ post: async () => response.promise });
    const { instance, updates } = controller();
    await instance.start();
    const submit = instance.submitCritique();
    const count = updates.length;
    instance.dispose();
    assert.equal(requests.at(-1)?.signal?.aborted, true);
    response.resolve(json(critiquePayload()));
    await submit;
    assert.equal(updates.length, count);
  });
  it("does not let a late 401 sign out a replacement login generation", async () => {
    const response = deferred<Response>();
    let current = true;
    let signOuts = 0;
    globalThis.fetch = async () => response.promise;
    const instance = new PaintingInsightsController({
      paintingId, token: "old-fixture-token", imageAvailable: true, isCurrent: () => current,
      onChange: () => undefined, onUnauthorized: () => { signOuts += 1; },
    });
    const read = instance.readGuide();
    current = false;
    response.resolve(json({ code: "UNAUTHORIZED" }, 401));
    await read;
    assert.equal(signOuts, 0);
    instance.dispose();
  });
  it("forwards AbortSignal and does not repeat failed API calls", async () => {
    const controller = new AbortController();
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      assert.equal(init?.signal, controller.signal);
      return json({ code: "CRITIC_DISABLED" }, 503);
    };
    await assert.rejects(api.submitCritique(paintingId, "token", controller.signal));
    assert.equal(calls, 1);
  });
});

const policy: PollingPolicy = { initialDelayMs: 1, maxDelayMs: 2, backoffFactor: 1.5, maxAttempts: 3, maxElapsedMs: 1000, requestTimeoutMs: 100 };
describe("bounded Critic reads", () => {
  it("stops at a terminal task, unknown status, and the attempt bound", async () => {
    for (const status of ["SUCCEEDED", "NEW_UNKNOWN_STATUS", "RUNNING"]) {
      let reads = 0;
      const outcome = await pollCritiqueTask({
        signal: new AbortController().signal, policy, sleep: async () => undefined,
        read: async () => { reads += 1; return parsePaintingCritiqueTask(critiquePayload(status), paintingId); }, onUpdate: () => undefined,
      });
      assert.equal(reads, status === "RUNNING" ? 3 : 1);
      assert.equal(outcome, status === "SUCCEEDED" ? "terminal" : status === "RUNNING" ? "timeout" : "unknown");
    }
  });
  it("never publishes a result after cancellation, even from an uncooperative transport", async () => {
    const controller = new AbortController();
    let updates = 0;
    const outcome = await pollCritiqueTask({
      signal: controller.signal, policy, sleep: async () => undefined,
      read: async () => { controller.abort(); return parsePaintingCritiqueTask(critiquePayload(), paintingId); }, onUpdate: () => { updates += 1; },
    });
    assert.equal(outcome, "aborted");
    assert.equal(updates, 0);
  });
  it("stops on a status-read timeout without submitting anything", async () => {
    const outcome = await pollCritiqueTask({
      signal: new AbortController().signal, policy: { ...policy, requestTimeoutMs: 2 }, sleep: async () => undefined,
      read: (signal) => new Promise((_resolve, reject) => { signal.addEventListener("abort", () => reject(signal.reason), { once: true }); }), onUpdate: () => assert.fail("unexpected update"),
    });
    assert.equal(outcome, "timeout");
  });
});

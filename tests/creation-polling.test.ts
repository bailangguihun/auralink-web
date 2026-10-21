import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyCreationStatus,
  pollCreation,
  type PollingPolicy,
} from "../lib/creation-polling.ts";
import type { CreationDetail } from "../lib/types.ts";

function detail(status: string): CreationDetail {
  return {
    creationId: "33333333-3333-3333-3333-333333333333",
    workflowId: "11111111-1111-1111-1111-111111111111",
    workflowName: "测试工作流",
    status,
    errorCode: status === "FAILED" ? "UPSTREAM_ERROR" : null,
    errorMessage: status === "FAILED" ? "执行失败" : null,
    recoveryState: "NONE",
    sourceModality: "TEXT_DESCRIPTION",
    sourcePaintingId: null,
    sourcePaintingTitle: null,
    sourcePaintingContentUrl: null,
    sourceAssetId: null,
    sourceText: "测试输入",
    sourceAssetContentUrl: null,
    sourceAssetDownloadUrl: null,
    finalModality: status === "SUCCEEDED" ? "PAINTING" : null,
    finalAssetId: null,
    finalAssetContentUrl: null,
    finalAssetDownloadUrl: null,
    finalText: null,
    finalPoem: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    startedAt: null,
    finishedAt: null,
    retryVersion: 0,
    retryAvailable: status === "FAILED",
    retryBlockedReason: status === "FAILED" ? null : "CREATION_RETRY_NOT_AVAILABLE",
    executionAttemptCount: 1,
    steps: [],
  };
}

/** The persisted shape of Round-6 Creation f4ae6554-7b29-4747-a97f-d4ca81495ec5. */
function completedUntitledTwoStepDetail(status: "RUNNING" | "SUCCEEDED"): CreationDetail {
  const poem = {
    schemaVersion: "1",
    title: null,
    lines: ["孤舟系岸柳风轻", "远岫含烟水自清", "数点浮石分碧落", "一篱茅舍隐林声"],
    text: "孤舟系岸柳风轻\n远岫含烟水自清\n数点浮石分碧落\n一篱茅舍隐林声",
  };
  const paintingStep = {
    stepId: "f618abdb-fcc9-409b-8936-405366e7ce94",
    stepIndex: 0,
    nodeId: "step1",
    operation: "TEXT_TO_PAINTING",
    inputModality: "TEXT_DESCRIPTION",
    outputModality: "PAINTING",
    status: "SUCCEEDED",
    attemptCount: 1,
    errorCode: null,
    errorMessage: null,
    outputAssetId: "09af351f-e66c-4382-933f-264c213a517a",
    outputAssetContentUrl: "/api/v1/assets/09af351f-e66c-4382-933f-264c213a517a/content",
    outputAssetDownloadUrl: "/api/v1/assets/09af351f-e66c-4382-933f-264c213a517a/download",
    outputText: null,
    outputPoem: null,
    startedAt: "2026-09-08T15:51:50.309Z",
    finishedAt: "2026-09-08T15:52:41.881Z",
  } as const;
  const poemStep = {
    stepId: "0de69fa3-47b0-457d-b3d9-47c09f06e269",
    stepIndex: 1,
    nodeId: "step2",
    operation: "PAINTING_TO_POEM",
    inputModality: "PAINTING",
    outputModality: "POEM",
    status,
    attemptCount: 1,
    errorCode: null,
    errorMessage: null,
    outputAssetId: null,
    outputAssetContentUrl: null,
    outputAssetDownloadUrl: null,
    outputText: status === "SUCCEEDED" ? poem.text : null,
    outputPoem: status === "SUCCEEDED" ? poem : null,
    startedAt: "2026-09-08T15:52:41.898Z",
    finishedAt: status === "SUCCEEDED" ? "2026-09-08T15:52:45.412Z" : null,
  } as const;
  return {
    ...detail(status),
    creationId: "f4ae6554-7b29-4747-a97f-d4ca81495ec5",
    workflowName: "123",
    sourceText: "暮春江畔，渔船停在岸边",
    finalModality: status === "SUCCEEDED" ? "POEM" : null,
    finalAssetId: null,
    finalAssetContentUrl: null,
    finalAssetDownloadUrl: null,
    finalText: status === "SUCCEEDED" ? poem.text : null,
    finalPoem: status === "SUCCEEDED" ? poem : null,
    steps: [paintingStep, poemStep],
  };
}

const policy: PollingPolicy = {
  initialDelayMs: 10,
  maxDelayMs: 25,
  backoffFactor: 2,
  maxAttempts: 5,
  maxElapsedMs: 1_000,
  requestTimeoutMs: 100,
};

describe("Creation polling", () => {
  it("moves from active to success using backend responses and stops", async () => {
    const responses = [detail("RUNNING"), detail("SUCCEEDED")];
    const updates: string[] = [];
    const outcome = await pollCreation({
      signal: new AbortController().signal,
      policy,
      sleep: async () => undefined,
      getDetail: async () => responses.shift()!,
      onUpdate: (value) => updates.push(value.status),
    });
    assert.equal(outcome.kind, "terminal");
    assert.deepEqual(updates, ["RUNNING", "SUCCEEDED"]);
  });

  it("replaces the selected running two-step history with the persisted untitled poem", async () => {
    const responses = [completedUntitledTwoStepDetail("RUNNING"), completedUntitledTwoStepDetail("SUCCEEDED")];
    let selected: CreationDetail | null = null;
    const latest = (): CreationDetail | null => selected;
    const outcome = await pollCreation({
      signal: new AbortController().signal,
      policy,
      sleep: async () => undefined,
      getDetail: async () => responses.shift()!,
      onUpdate: (value) => { selected = value; },
    });

    assert.equal(outcome.kind, "terminal");
    assert.equal(latest()?.status, "SUCCEEDED");
    assert.equal(latest()?.sourceText, "暮春江畔，渔船停在岸边");
    assert.equal(latest()?.steps[0]?.outputAssetId, "09af351f-e66c-4382-933f-264c213a517a");
    assert.equal(latest()?.steps[1]?.outputPoem?.title, null);
    assert.equal(latest()?.finalPoem?.text, "孤舟系岸柳风轻\n远岫含烟水自清\n数点浮石分碧落\n一篱茅舍隐林声");
  });

  it("retains the last known creation when a later detail read fails", async () => {
    const known = completedUntitledTwoStepDetail("RUNNING");
    let selected: CreationDetail | null = null;
    const latest = (): CreationDetail | null => selected;
    const outcome = await pollCreation({
      signal: new AbortController().signal,
      policy,
      sleep: async () => undefined,
      getDetail: async () => {
        if (!latest()) return known;
        throw new Error("temporary detail read failure");
      },
      onUpdate: (value) => { selected = value; },
    });

    assert.equal(outcome.kind, "error");
    assert.equal(latest()?.creationId, known.creationId);
    assert.equal(latest()?.status, "RUNNING");
    assert.equal(latest()?.steps[0]?.outputAssetId, "09af351f-e66c-4382-933f-264c213a517a");
  });

  it("moves from active to failure and preserves backend retry eligibility", async () => {
    const responses = [detail("QUEUED"), detail("FAILED")];
    const outcome = await pollCreation({
      signal: new AbortController().signal,
      policy,
      sleep: async () => undefined,
      getDetail: async () => responses.shift()!,
      onUpdate: () => undefined,
    });
    assert.equal(outcome.kind, "terminal");
    assert.equal(outcome.kind === "terminal" && outcome.detail.retryAvailable, true);
  });

  it("never overlaps polling requests", async () => {
    let inFlight = 0;
    let maximum = 0;
    let calls = 0;
    const outcome = await pollCreation({
      signal: new AbortController().signal,
      policy,
      sleep: async () => undefined,
      getDetail: async () => {
        inFlight += 1;
        maximum = Math.max(maximum, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        calls += 1;
        return detail(calls === 3 ? "SUCCEEDED" : "RUNNING");
      },
      onUpdate: () => undefined,
    });
    assert.equal(outcome.kind, "terminal");
    assert.equal(maximum, 1);
  });

  it("uses capped backoff and stops at the attempt bound", async () => {
    const delays: number[] = [];
    const bounded = { ...policy, maxAttempts: 4 };
    const outcome = await pollCreation({
      signal: new AbortController().signal,
      policy: bounded,
      sleep: async (delay) => { delays.push(delay); },
      getDetail: async () => detail("RUNNING"),
      onUpdate: () => undefined,
    });
    assert.equal(outcome.kind, "timeout");
    assert.deepEqual(delays, [10, 20, 25, 25]);
  });

  it("stops immediately for terminal and unknown states", async () => {
    for (const status of ["FAILED", "SUCCEEDED", "PARTIAL_SUCCESS", "FUTURE_STATE"]) {
      let calls = 0;
      const outcome = await pollCreation({
        signal: new AbortController().signal,
        policy,
        sleep: async () => undefined,
        getDetail: async () => { calls += 1; return detail(status); },
        onUpdate: () => undefined,
      });
      assert.equal(calls, 1);
      assert.equal(outcome.kind, status === "FUTURE_STATE" ? "unknown" : "terminal");
    }
    assert.equal(classifyCreationStatus("FUTURE_STATE"), "unknown");
  });

  it("aborts a pending timer and performs cleanup without a status GET", async () => {
    const controller = new AbortController();
    let calls = 0;
    const polling = pollCreation({
      signal: controller.signal,
      policy,
      sleep: (_delay, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      getDetail: async () => { calls += 1; return detail("RUNNING"); },
      onUpdate: () => undefined,
    });
    controller.abort();
    const outcome = await polling;
    assert.equal(outcome.kind, "aborted");
    assert.equal(calls, 0);
  });

  it("stops at the elapsed-time bound", async () => {
    const times = [0, 0, 1_001];
    const outcome = await pollCreation({
      signal: new AbortController().signal,
      policy,
      now: () => times.shift() ?? 1_001,
      sleep: async () => undefined,
      getDetail: async () => detail("RUNNING"),
      onUpdate: () => undefined,
    });
    assert.equal(outcome.kind, "timeout");
  });

  it("aborts one hung status request at its request deadline", async () => {
    const outcome = await pollCreation({
      signal: new AbortController().signal,
      policy: { ...policy, requestTimeoutMs: 2 },
      sleep: async () => undefined,
      getDetail: (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      onUpdate: () => undefined,
    });
    assert.equal(outcome.kind, "timeout");
    assert.equal(outcome.attempts, 0);
  });

  it("rejects a detail response that resolves after the caller has aborted", async () => {
    const controller = new AbortController();
    const updates: string[] = [];
    const outcome = await pollCreation({
      signal: controller.signal,
      policy,
      sleep: async () => undefined,
      getDetail: async () => {
        controller.abort();
        await Promise.resolve();
        return detail("SUCCEEDED");
      },
      onUpdate: (value) => updates.push(value.status),
    });
    assert.equal(outcome.kind, "aborted");
    assert.deepEqual(updates, []);
  });

  it("does not publish a response from a transport that resolves after its request timeout", async () => {
    const updates: string[] = [];
    const outcome = await pollCreation({
      signal: new AbortController().signal,
      policy: { ...policy, requestTimeoutMs: 2 },
      sleep: async () => undefined,
      getDetail: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return detail("SUCCEEDED");
      },
      onUpdate: (value) => updates.push(value.status),
    });
    assert.equal(outcome.kind, "timeout");
    assert.deepEqual(updates, []);
  });

  it("does not publish a response that outlives the overall polling deadline", async () => {
    let now = 0;
    const updates: string[] = [];
    const outcome = await pollCreation({
      signal: new AbortController().signal,
      policy,
      now: () => now,
      sleep: async () => undefined,
      getDetail: async () => { now = policy.maxElapsedMs; return detail("SUCCEEDED"); },
      onUpdate: (value) => updates.push(value.status),
    });
    assert.equal(outcome.kind, "timeout");
    assert.deepEqual(updates, []);
  });
});

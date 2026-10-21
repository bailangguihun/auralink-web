import assert from "node:assert/strict";
import { test } from "node:test";
import {
  creationAdmissionRejected, executionStep, mergeCreationObservation, StudioSubmissionGate, submissionGateFor,
  type AcknowledgedExecution,
} from "../lib/studio-execution-context.ts";
import type { CreationDetail } from "../lib/types.ts";

function execution(): AcknowledgedExecution {
  return {
    creationId: "ack", workflowId: "workflow", epoch: 4,
    source: { modality: "PAINTING", paintingId: "painting-a" },
    graph: { schemaVersion: 2, nodes: [{ id: "step1", kind: "TRANSFORM", operation: "PAINTING_TO_MUSIC",
      inputModality: "PAINTING", outputModality: "AUDIO", parameters: {} }], edges: [] },
    detail: { creationId: "ack", workflowId: "workflow", sourceModality: "PAINTING", sourcePaintingId: "painting-a",
      steps: [{ nodeId: "step1", operation: "PAINTING_TO_MUSIC", inputModality: "PAINTING", outputModality: "AUDIO", requestedDurationSeconds: 10 }],
    } as CreationDetail,
  };
}

test("acknowledged default-duration AUDIO binds to its exact source and context", () => {
  const current = execution();
  assert.equal(executionStep(current, 4, "step1")?.outputModality, "AUDIO");
  assert.equal(executionStep(current, 5, "step1"), null);
  current.detail!.sourcePaintingId = "another-painting";
  assert.equal(executionStep(current, 4, "step1"), null);
});

test("workflowId and positional node ID cannot bind an old or mismatched run", () => {
  for (const field of ["creationId", "workflowId"] as const) {
    const current = execution(); current.detail![field] = "old";
    assert.equal(executionStep(current, 4, "step1"), null);
  }
  for (const field of ["operation", "inputModality", "outputModality"] as const) {
    const current = execution(); current.detail!.steps[0][field] = "wrong";
    assert.equal(executionStep(current, 4, "step1"), null);
  }
  const current = execution(); current.graph.nodes[0].parameters = { durationSeconds: 23 };
  assert.equal(executionStep(current, 4, "step1"), null);
});

test("rapid handler invocations enter the session gate only once", () => {
  const gate = new StudioSubmissionGate(); const operation = gate.begin()!;
  assert.equal(gate.begin(), null);
  gate.markDispatched(operation); gate.finishWithoutAcknowledgement(operation);
  assert.equal(gate.snapshot(), "uncertain");
  assert.equal(gate.begin(), null);
});

test("uncertainty survives Studio remount but not a different authenticated session", () => {
  const identity = { token: "synthetic", generation: 1 };
  const gate = submissionGateFor(identity), operation = gate.begin()!;
  gate.markDispatched(operation); gate.finishWithoutAcknowledgement(operation);
  assert.equal(submissionGateFor(identity).begin(), null);
  assert.equal(submissionGateFor({ token: "synthetic", generation: 2 }).snapshot(), "idle");
});

test("a real late ACK resolves only its own operation, not a later pending one", () => {
  const gate = new StudioSubmissionGate(), first = gate.begin()!;
  gate.markDispatched(first); gate.finishWithoutAcknowledgement(first);
  gate.acknowledge(first);
  const second = gate.begin()!;
  gate.acknowledge(first); gate.finishWithoutAcknowledgement(first);
  assert.equal(gate.snapshot(), "pending");
  gate.finishWithoutAcknowledgement(second);
  assert.equal(gate.snapshot(), "idle");
});

test("known pre-admission rejections are distinct from ambiguous server failures", () => {
  assert.equal(creationAdmissionRejected({ status: 422, code: "CREATION_SOURCE_INVALID" }), true);
  assert.equal(creationAdmissionRejected({ status: 503, code: "CREATION_QUEUE_FULL" }), true);
  assert.equal(creationAdmissionRejected({ status: 409, code: "CREATION_OPERATION_UNAVAILABLE" }), true);
  assert.equal(creationAdmissionRejected({ status: 503 }), false);
  assert.equal(creationAdmissionRejected({ status: 500, code: "CREATION_QUEUE_FULL" }), false);
  assert.equal(creationAdmissionRejected({ status: 422, code: "UNKNOWN_CODE" }), false);
});

test("parallel reads cannot regress terminal status within the same Core retryVersion", () => {
  for (const status of ["SUCCEEDED", "PARTIAL_SUCCESS", "FAILED"]) {
    const terminal = { creationId: "ack", retryVersion: 0, status };
    for (const status of ["QUEUED", "RUNNING", "UNRECOGNIZED_NEW_STATE"]) {
      assert.equal(mergeCreationObservation(terminal, { ...terminal, status }), terminal);
    }
  }
});

test("new admitted retries remain visible while late older attempts cannot replace them", () => {
  const completed = { creationId: "ack", retryVersion: 0, status: "FAILED" };
  const retry = { ...completed, retryVersion: 1, status: "RUNNING" };
  assert.equal(mergeCreationObservation(completed, retry), retry);
  assert.equal(mergeCreationObservation(retry, completed), retry);
  const unrelated = { ...completed, creationId: "other" };
  assert.equal(mergeCreationObservation(retry, unrelated), unrelated);
});

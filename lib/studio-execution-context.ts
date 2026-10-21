import type { SessionIdentity } from "./session-identity.ts";
import type { CreationDetail, CreationSource, CreationStep, CreationSummary, WorkflowGraph } from "./types.ts";

/** Client-only association; never a server workflow revision or an idempotency key. */
export type AcknowledgedExecution = {
  creationId: string;
  workflowId: string;
  epoch: number;
  graph: WorkflowGraph;
  source: CreationSource;
  detail: CreationDetail | null;
};

export function executionStep(
  execution: AcknowledgedExecution | null,
  epoch: number,
  nodeId: string,
): CreationStep | null {
  if (!execution || execution.epoch !== epoch || !execution.detail) return null;
  const { detail, source } = execution;
  if (detail.creationId !== execution.creationId || detail.workflowId !== execution.workflowId
      || detail.sourceModality !== source.modality
      || (source.paintingId && detail.sourcePaintingId !== source.paintingId)
      || (source.assetId && detail.sourceAssetId !== source.assetId)
      || (source.text !== undefined && detail.sourceText !== source.text)) return null;
  const expected = execution.graph.nodes.find((node) => node.id === nodeId && node.kind === "TRANSFORM");
  const step = detail.steps.find((item) => item.nodeId === nodeId);
  if (!expected || !step || step.operation !== expected.operation
      || step.inputModality !== expected.inputModality || step.outputModality !== expected.outputModality) return null;
  if (expected.operation === "PAINTING_TO_MUSIC"
      && step.requestedDurationSeconds !== (expected.parameters?.durationSeconds ?? 10)) return null;
  return step;
}

export type SubmissionStatus = "idle" | "pending" | "uncertain";

/** These Core errors are emitted before creation admission, not provider errors. */
export function creationAdmissionRejected(error: { status: number; code?: string }): boolean {
  if ([400, 401, 403, 404].includes(error.status)) return true;
  const codes: Record<number, readonly string[]> = {
    409: ["CREATION_OPERATION_UNAVAILABLE"],
    422: ["CREATION_SOURCE_INVALID", "CREATION_SOURCE_MISMATCH", "WORKFLOW_INVALID",
      "WORKFLOW_DRAFT_NOT_EXECUTABLE", "WORKFLOW_CONVERSION_REQUIRED", "CREATION_VIDEO_RESERVED"],
    503: ["CREATION_QUEUE_FULL", "CREATIONS_DISABLED", "CREATION_RECOVERY_NOT_READY"],
  };
  return Boolean(error.code && codes[error.status]?.includes(error.code));
}

/** Survives Studio remounts during one authenticated session, not reloads/tabs. */
export class StudioSubmissionGate {
  private status: SubmissionStatus = "idle";
  private sequence = 0;
  private dispatched = false;
  private listeners = new Set<() => void>();
  snapshot = (): SubmissionStatus => this.status;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(status: SubmissionStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener());
  }
  begin(): number | null {
    if (this.status !== "idle") return null;
    this.dispatched = false;
    this.update("pending");
    return ++this.sequence;
  }
  markDispatched(operation: number) {
    if (operation === this.sequence && this.status === "pending") this.dispatched = true;
  }
  acknowledge(operation: number) {
    if (operation === this.sequence) this.update("idle");
  }
  rejectBeforeAdmission(operation: number) {
    if (operation === this.sequence) this.update("idle");
  }
  finishWithoutAcknowledgement(operation: number) {
    if (operation === this.sequence && this.status === "pending") {
      this.update(this.dispatched ? "uncertain" : "idle");
    }
  }
}

const sessionGates = new WeakMap<SessionIdentity, StudioSubmissionGate>();
export function submissionGateFor(identity: SessionIdentity): StudioSubmissionGate {
  let gate = sessionGates.get(identity);
  if (!gate) { gate = new StudioSubmissionGate(); sessionGates.set(identity, gate); }
  return gate;
}

/** Core retryVersion identifies a new admitted attempt, not a workflow revision.
 * Parallel detail/poll reads must not regress a known terminal observation in
 * that same attempt. A later admitted retry remains observable as active.
 */
export function mergeCreationObservation<T extends Pick<CreationSummary, "creationId" | "retryVersion" | "status">>(
  previous: T | null | undefined,
  incoming: T,
): T {
  if (!previous || previous.creationId !== incoming.creationId) return incoming;
  if (incoming.retryVersion < previous.retryVersion) return previous;
  if (incoming.retryVersion > previous.retryVersion) return incoming;
  const terminal = (status: string) => ["SUCCEEDED", "PARTIAL_SUCCESS", "FAILED"].includes(status);
  return terminal(previous.status) && !terminal(incoming.status) ? previous : incoming;
}

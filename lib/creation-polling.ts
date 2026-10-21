import type { CreationDetail } from "./types.ts";

export type CreationStateKind = "active" | "success" | "partial" | "failure" | "unknown";

export function classifyCreationStatus(status: string): CreationStateKind {
  if (status === "QUEUED" || status === "RUNNING") return "active";
  if (status === "SUCCEEDED") return "success";
  if (status === "PARTIAL_SUCCESS") return "partial";
  if (status === "FAILED") return "failure";
  return "unknown";
}

export type PollingPolicy = {
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  maxAttempts: number;
  maxElapsedMs: number;
  requestTimeoutMs: number;
};

export const CREATION_POLLING_POLICY: PollingPolicy = {
  initialDelayMs: 1_500,
  maxDelayMs: 8_000,
  backoffFactor: 1.5,
  maxAttempts: 90,
  maxElapsedMs: 10 * 60 * 1_000,
  requestTimeoutMs: 15_000,
};

export function nextPollingDelay(current: number, policy: PollingPolicy): number {
  return Math.min(policy.maxDelayMs, Math.ceil(current * policy.backoffFactor));
}

export function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export type PollOutcome =
  | { kind: "terminal"; detail: CreationDetail; attempts: number }
  | { kind: "unknown"; detail: CreationDetail; attempts: number }
  | { kind: "timeout"; attempts: number }
  | { kind: "aborted"; attempts: number }
  | { kind: "error"; error: unknown; attempts: number };

type PollCreationOptions = {
  signal: AbortSignal;
  getDetail: (signal: AbortSignal) => Promise<CreationDetail>;
  onUpdate: (detail: CreationDetail) => void;
  policy?: PollingPolicy;
  now?: () => number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

export async function pollCreation({
  signal,
  getDetail,
  onUpdate,
  policy = CREATION_POLLING_POLICY,
  now = Date.now,
  sleep = abortableDelay,
}: PollCreationOptions): Promise<PollOutcome> {
  const startedAt = now();
  let attempts = 0;
  let delay = policy.initialDelayMs;

  while (attempts < policy.maxAttempts && now() - startedAt < policy.maxElapsedMs) {
    try {
      await sleep(delay, signal);
    } catch {
      return { kind: "aborted", attempts };
    }
    if (signal.aborted) return { kind: "aborted", attempts };

    const remainingMs = policy.maxElapsedMs - (now() - startedAt);
    if (remainingMs <= 0) return { kind: "timeout", attempts };
    const requestController = new AbortController();
    const abortRequest = () => requestController.abort(signal.reason);
    signal.addEventListener("abort", abortRequest, { once: true });
    const requestTimer = globalThis.setTimeout(
      () => requestController.abort(new DOMException("Creation status request timed out", "TimeoutError")),
      Math.min(policy.requestTimeoutMs, remainingMs),
    );

    let detail: CreationDetail;
    try {
      detail = await getDetail(requestController.signal);
    } catch (error) {
      if (signal.aborted) return { kind: "aborted", attempts };
      if (requestController.signal.aborted) return { kind: "timeout", attempts };
      return { kind: "error", error, attempts };
    } finally {
      globalThis.clearTimeout(requestTimer);
      signal.removeEventListener("abort", abortRequest);
    }
    // A transport or a test double can resolve after abort. Never deliver that
    // late response to a newly selected workflow, history item, or session.
    if (signal.aborted) return { kind: "aborted", attempts };
    if (requestController.signal.aborted || now() - startedAt >= policy.maxElapsedMs) {
      return { kind: "timeout", attempts };
    }
    attempts += 1;
    onUpdate(detail);

    const state = classifyCreationStatus(detail.status);
    if (state === "unknown") return { kind: "unknown", detail, attempts };
    if (state !== "active") return { kind: "terminal", detail, attempts };
    delay = nextPollingDelay(delay, policy);
  }

  return { kind: "timeout", attempts };
}

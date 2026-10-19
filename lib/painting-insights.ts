import { api, ApiError, errorMessage } from "./api.ts";
import { abortableDelay, nextPollingDelay, type PollingPolicy } from "./creation-polling.ts";
import { PaintingInsightContractError } from "./painting-insight-contracts.ts";
import type { CritiqueCapability, HistoricalPaintingGuide, PaintingCritiqueTask, PaintingGuide } from "./types.ts";

export type GuideState = {
  state: "loading" | "missing" | "available" | "historical" | "generating" | "error";
  guide: PaintingGuide | HistoricalPaintingGuide | null;
  error: string | null;
};
export type CritiqueState = {
  state: "loading" | "missing" | "submitting" | "active" | "success" | "failure" | "unknown" | "error";
  task: PaintingCritiqueTask | null;
  capability: CritiqueCapability | null;
  capabilityError: string | null;
  error: string | null;
};
export type PaintingInsightsState = { guide: GuideState; critique: CritiqueState };
export function initialPaintingInsights(): PaintingInsightsState {
  return {
    guide: { state: "loading", guide: null, error: null },
    critique: { state: "loading", task: null, capability: null, capabilityError: null, error: null },
  };
}

export function classifyCritique(status: string): "active" | "success" | "failure" | "unknown" {
  if (status === "QUEUED" || status === "RUNNING") return "active";
  if (status === "SUCCEEDED") return "success";
  if (status === "FAILED") return "failure";
  return "unknown";
}

export const CRITIQUE_POLLING_POLICY: PollingPolicy = {
  initialDelayMs: 1_500, maxDelayMs: 8_000, backoffFactor: 1.5,
  maxAttempts: 90, maxElapsedMs: 10 * 60_000, requestTimeoutMs: 15_000,
};

export async function pollCritiqueTask({
  signal, read, onUpdate, policy = CRITIQUE_POLLING_POLICY, now = Date.now, sleep = abortableDelay,
}: {
  signal: AbortSignal;
  read: (signal: AbortSignal) => Promise<PaintingCritiqueTask>;
  onUpdate: (task: PaintingCritiqueTask) => void;
  policy?: PollingPolicy;
  now?: () => number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}): Promise<"terminal" | "unknown" | "timeout" | "aborted"> {
  const started = now();
  let delay = policy.initialDelayMs;
  for (let attempts = 0; attempts < policy.maxAttempts && now() - started < policy.maxElapsedMs; attempts += 1) {
    try { await sleep(delay, signal); } catch { return "aborted"; }
    if (signal.aborted) return "aborted";
    const remaining = policy.maxElapsedMs - (now() - started);
    if (remaining <= 0) return "timeout";
    const request = new AbortController();
    const abort = () => request.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const timer = globalThis.setTimeout(() => request.abort(new DOMException("Status read timed out", "TimeoutError")), Math.min(policy.requestTimeoutMs, remaining));
    let task: PaintingCritiqueTask;
    try { task = await read(request.signal); }
    catch (error) {
      if (signal.aborted) return "aborted";
      if (request.signal.aborted) return "timeout";
      throw error;
    } finally {
      globalThis.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
    if (signal.aborted) return "aborted";
    if (request.signal.aborted || now() - started >= policy.maxElapsedMs) return "timeout";
    onUpdate(task);
    const state = classifyCritique(task.status);
    if (state === "unknown") return "unknown";
    if (state !== "active") return "terminal";
    delay = nextPollingDelay(delay, policy);
  }
  return "timeout";
}

type InsightApi = Pick<typeof api, "guide" | "historicalGuide" | "ensureGuide" | "critiqueCapability" | "critique" | "critiqueTask" | "submitCritique">;
type ControllerOptions = {
  paintingId: string;
  token: string;
  imageAvailable: boolean;
  isCurrent: () => boolean;
  onUnauthorized: () => void;
  onChange: (state: PaintingInsightsState) => void;
  transport?: InsightApi;
  pollingPolicy?: PollingPolicy;
};

/** One controller belongs to one artwork and one login generation. Reads never generate. */
export class PaintingInsightsController {
  state = initialPaintingInsights();
  private disposed = false;
  private guideRequest: AbortController | null = null;
  private critiqueRequest: AbortController | null = null;
  private guideSubmitting = false;
  private critiqueSubmitting = false;
  private readonly transport: InsightApi;

  constructor(private readonly options: ControllerOptions) { this.transport = options.transport ?? api; }

  private current(request?: AbortController): boolean {
    return !this.disposed && this.options.isCurrent() && !request?.signal.aborted;
  }
  private updateGuide(patch: Partial<GuideState>) {
    if (!this.current()) return;
    this.state = { ...this.state, guide: { ...this.state.guide, ...patch } };
    this.options.onChange(this.state);
  }
  private updateCritique(patch: Partial<CritiqueState>) {
    if (!this.current()) return;
    this.state = { ...this.state, critique: { ...this.state.critique, ...patch } };
    this.options.onChange(this.state);
  }
  private message(error: unknown): string {
    if (this.current() && error instanceof ApiError && error.kind === "unauthorized") this.options.onUnauthorized();
    return error instanceof PaintingInsightContractError ? error.message : errorMessage(error, "读取作品解读失败，请稍后重试读取。");
  }
  private missing(error: unknown, code: string): boolean { return error instanceof ApiError && error.status === 404 && error.code === code; }

  async start(): Promise<void> { await Promise.all([this.readGuide(), this.readCritique()]); }

  async readGuide(): Promise<void> {
    if (!this.current() || this.guideSubmitting) return;
    this.guideRequest?.abort();
    const request = this.guideRequest = new AbortController();
    this.updateGuide({ state: "loading", error: null });
    try {
      let guide: PaintingGuide | HistoricalPaintingGuide;
      try { guide = await this.transport.guide(this.options.paintingId, this.options.token, request.signal); }
      catch (error) {
        if (!this.current(request)) return;
        if (!this.missing(error, "GUIDE_NOT_AVAILABLE")) throw error;
        guide = await this.transport.historicalGuide(this.options.paintingId, this.options.token, request.signal);
      }
      if (this.current(request)) this.updateGuide({ guide, state: "resultScope" in guide ? "historical" : "available", error: null });
    } catch (error) {
      if (!this.current(request)) return;
      if (this.missing(error, "GUIDE_HISTORICAL_NOT_AVAILABLE")) this.updateGuide({ state: "missing", guide: null, error: null });
      else this.updateGuide({ state: "error", error: this.message(error) });
    }
  }

  async generateGuide(): Promise<void> {
    if (!this.current() || this.guideSubmitting || !["missing", "historical"].includes(this.state.guide.state)) return;
    this.guideSubmitting = true;
    this.guideRequest?.abort();
    const request = this.guideRequest = new AbortController();
    this.updateGuide({ state: "generating", error: null });
    try {
      const guide = await this.transport.ensureGuide(this.options.paintingId, this.options.token, request.signal);
      if (this.current(request)) this.updateGuide({ state: "available", guide, error: null });
    } catch (error) {
      if (this.current(request)) this.updateGuide({ state: "error", error: `${this.message(error)} 尚未确认生成结果，请先重试读取。` });
    } finally { this.guideSubmitting = false; }
  }

  async readCritique(): Promise<void> {
    if (!this.current() || this.critiqueSubmitting) return;
    this.critiqueRequest?.abort();
    const request = this.critiqueRequest = new AbortController();
    this.updateCritique({ state: "loading", error: null, capability: null, capabilityError: null });
    await Promise.all([
      this.transport.critiqueCapability(this.options.token, request.signal).then((capability) => {
        if (this.current(request)) this.updateCritique({ capability });
      }).catch((error) => {
        if (this.current(request)) this.updateCritique({ capabilityError: this.message(error) });
      }),
      this.transport.critique(this.options.paintingId, this.options.token, request.signal).then((task) => {
        if (this.current(request)) this.updateCritique({ task, state: classifyCritique(task.status) });
      }).catch((error) => {
        if (!this.current(request)) return;
        if (this.missing(error, "CRITIC_TASK_NOT_FOUND")) this.updateCritique({ task: null, state: "missing" });
        else this.updateCritique({ state: "error", error: this.message(error) });
      }),
    ]);
    if (this.current(request) && this.state.critique.state === "active" && this.state.critique.task) void this.poll(this.state.critique.task, request);
  }

  async submitCritique(): Promise<void> {
    if (!this.current() || this.critiqueSubmitting || !this.options.imageAvailable || !this.state.critique.capability?.submissionAvailable
      || !["missing", "failure"].includes(this.state.critique.state)) return;
    this.critiqueSubmitting = true;
    this.critiqueRequest?.abort();
    const request = this.critiqueRequest = new AbortController();
    this.updateCritique({ state: "submitting", error: null });
    try {
      const task = await this.transport.submitCritique(this.options.paintingId, this.options.token, request.signal);
      if (!this.current(request)) return;
      this.updateCritique({ task, state: classifyCritique(task.status) });
      if (classifyCritique(task.status) === "active") void this.poll(task, request);
    } catch (error) {
      if (this.current(request)) this.updateCritique({ state: "error", error: `${this.message(error)} 请先读取已有任务，系统不会自动重新提交。` });
    } finally { this.critiqueSubmitting = false; }
  }

  private async poll(task: PaintingCritiqueTask, request: AbortController): Promise<void> {
    try {
      const outcome = await pollCritiqueTask({
        signal: request.signal, policy: this.options.pollingPolicy,
        read: (signal) => this.transport.critiqueTask(task.critiqueId, this.options.paintingId, this.options.token, signal),
        onUpdate: (next) => { if (this.current(request)) this.updateCritique({ task: next, state: classifyCritique(next.status) }); },
      });
      if (this.current(request) && outcome === "timeout") this.updateCritique({ state: "error", error: "已停止等待，评析可能仍在处理。请稍后读取已有任务，无需重新提交。" });
    } catch (error) {
      if (this.current(request)) this.updateCritique({ state: "error", error: this.message(error) });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.guideRequest?.abort();
    this.critiqueRequest?.abort();
  }
}

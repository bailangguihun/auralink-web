import { api } from "./api.ts";
import { ReadCache, readCache } from "./read-cache.ts";
import type { PaintingDetail } from "./types.ts";

export const PAINTING_DETAIL_TTL_MS = 30_000;
export const PAINTING_DETAIL_PREFETCH_TIMEOUT_MS = 15_000;

type Prefetch = {
  paintingId: string;
  generation: number;
  controller: AbortController;
  promise: Promise<PaintingDetail>;
};

/** The selected artwork shares one session-scoped read with its detail screen.
 * Prefetch owns only a cancellable consumer, never the shared transport.
 */
export class PaintingDetailData {
  private pendingPrefetch: Prefetch | null = null;

  constructor(private readonly cache: ReadCache = readCache) {}

  read(paintingId: string, token: string, generation: number, signal?: AbortSignal, force = false): Promise<PaintingDetail> {
    if (signal?.aborted) return Promise.reject(new DOMException("The read was cancelled.", "AbortError"));
    // invalidate() accepts a prefix. Encoding the ID and terminating it prevents
    // retrying "a" from invalidating "ab" or an ID containing the separator.
    const key = `painting:detail:${encodeURIComponent(paintingId)}:`;
    if (force) {
      // An explicit retry must replace a stalled shared transport, including its
      // prefetch consumer, rather than joining it for another 15 seconds.
      this.cache.invalidate(generation, key);
      if (this.pendingPrefetch?.paintingId === paintingId && this.pendingPrefetch.generation === generation) {
        this.pendingPrefetch = null;
      }
    }
    return this.cache.read<PaintingDetail>(generation, key,
      sharedSignal => api.painting(paintingId, token, sharedSignal),
      { ttlMs: PAINTING_DETAIL_TTL_MS, signal });
  }

  /** Call only after a confirmed artwork click; callers handle the rejection.
   * There is no retry loop, and failed reads are not retained by ReadCache.
   */
  prefetch(paintingId: string, token: string, generation: number): Promise<PaintingDetail> {
    const previous = this.pendingPrefetch;
    // A delayed handler from an old account cannot cancel the new account's read.
    if (previous && previous.generation > generation) {
      return Promise.reject(new DOMException("The read was cancelled.", "AbortError"));
    }
    if (previous?.paintingId === paintingId && previous.generation === generation && !previous.controller.signal.aborted) {
      return previous.promise;
    }
    previous?.controller.abort();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAINTING_DETAIL_PREFETCH_TIMEOUT_MS);
    const promise = this.read(paintingId, token, generation, controller.signal).finally(() => {
      clearTimeout(timer);
      if (this.pendingPrefetch?.controller === controller) this.pendingPrefetch = null;
    });
    this.pendingPrefetch = { paintingId, generation, controller, promise };
    return promise;
  }
}

const paintingDetailData = new PaintingDetailData();

export function readPaintingDetail(paintingId: string, token: string, generation: number, signal?: AbortSignal, force = false) {
  return paintingDetailData.read(paintingId, token, generation, signal, force);
}

export function prefetchPaintingDetail(paintingId: string, token: string, generation: number) {
  return paintingDetailData.prefetch(paintingId, token, generation);
}

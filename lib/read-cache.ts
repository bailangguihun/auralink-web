type CacheOptions = { maxEntries?: number; maxBytes?: number; now?: () => number };
type ReadOptions = { ttlMs: number; signal?: AbortSignal; force?: boolean };
type Entry = { value: unknown; expiresAt: number; bytes: number };
type Consumer = { resolve: (value: unknown) => void; reject: (reason: unknown) => void; detach: () => void };
type Pending = {
  generation: number;
  key: string;
  controller: AbortController;
  consumers: Set<Consumer>;
  ttlMs: number;
};

const aborted = () => new DOMException("The read was cancelled.", "AbortError");
const positiveTtl = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

/** Bounded, session-scoped JSON read results. Callers treat returned DTOs as immutable.
 * This is an application memory cache, not a permission or HTTP response cache.
 */
export class ReadCache {
  private generation = 0;
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Pending>();
  private bytes = 0;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly now: () => number;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = Number.isFinite(options.maxEntries) ? Math.max(0, Math.floor(options.maxEntries!)) : 24;
    this.maxBytes = Number.isFinite(options.maxBytes) ? Math.max(0, options.maxBytes!) : 4 * 1024 * 1024;
    this.now = options.now ?? Date.now;
  }

  /** Called synchronously when login/restore identity changes, including logout. */
  reset(generation: number): void {
    this.generation = generation;
    this.entries.clear();
    this.bytes = 0;
    for (const request of [...this.pending.values()]) this.cancel(request);
  }

  peek<T>(generation: number, key: string): T | undefined {
    if (generation !== this.generation) return undefined;
    this.pruneExpired();
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value as T;
  }

  read<T>(generation: number, key: string, loader: (signal: AbortSignal) => Promise<T>, options: ReadOptions): Promise<T> {
    if (generation !== this.generation || options.signal?.aborted) return Promise.reject(aborted());
    if (options.force) this.removeEntry(key);
    else {
      const cached = this.peek<T>(generation, key);
      if (cached !== undefined) return Promise.resolve(cached);
    }
    let request = this.pending.get(key);
    if (request) {
      // Shared results never outlive the shortest retention requested by a consumer.
      request.ttlMs = Math.min(request.ttlMs, positiveTtl(options.ttlMs));
    } else {
      request = { generation, key, controller: new AbortController(), consumers: new Set(), ttlMs: positiveTtl(options.ttlMs) };
      this.pending.set(key, request);
      const active = request;
      // Subscribe before invoking a loader, including one which throws synchronously.
      void Promise.resolve().then(() => {
        if (!this.isCurrent(active)) throw aborted();
        return loader(active.controller.signal);
      }).then(value => this.resolve(active, value), error => this.reject(active, error));
    }
    return this.subscribe<T>(request, options.signal);
  }

  /** Prefix invalidation also cancels reads started before a mutation completed. */
  invalidate(generation: number, prefix = ""): void {
    if (generation !== this.generation) return;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.removeEntry(key);
    for (const request of [...this.pending.values()]) if (request.key.startsWith(prefix)) this.cancel(request);
  }

  private subscribe<T>(request: Pending, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const consumer: Consumer = { resolve: value => resolve(value as T), reject, detach: () => signal?.removeEventListener("abort", cancel) };
      const cancel = () => {
        if (!request.consumers.delete(consumer)) return;
        consumer.detach();
        reject(aborted());
        if (!request.consumers.size) this.cancel(request);
      };
      request.consumers.add(consumer);
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  }

  private isCurrent(request: Pending): boolean {
    return request.generation === this.generation && this.pending.get(request.key) === request && !request.controller.signal.aborted;
  }

  private resolve(request: Pending, value: unknown): void {
    if (!this.isCurrent(request)) return;
    this.pending.delete(request.key);
    this.retain(request.key, value, request.ttlMs);
    for (const consumer of request.consumers) { consumer.detach(); consumer.resolve(value); }
    request.consumers.clear();
  }

  private reject(request: Pending, error: unknown): void {
    if (!this.isCurrent(request)) return;
    this.pending.delete(request.key);
    for (const consumer of request.consumers) { consumer.detach(); consumer.reject(error); }
    request.consumers.clear();
  }

  private cancel(request: Pending): void {
    if (this.pending.get(request.key) === request) this.pending.delete(request.key);
    request.controller.abort();
    for (const consumer of request.consumers) { consumer.detach(); consumer.reject(aborted()); }
    request.consumers.clear();
  }

  private retain(key: string, value: unknown, ttlMs: number): void {
    this.pruneExpired();
    if (!ttlMs || !this.maxEntries || !this.maxBytes) return;
    let serialized: string | undefined;
    try { serialized = JSON.stringify(value); } catch { return; }
    if (serialized === undefined) return;
    // UTF-16 JSON length estimates payload memory; the entry cap also bounds metadata.
    const bytes = serialized.length * 2;
    if (bytes > this.maxBytes) return;
    this.removeEntry(key);
    while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.removeEntry(oldest);
    }
    this.entries.set(key, { value, bytes, expiresAt: this.now() + ttlMs });
    this.bytes += bytes;
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.removeEntry(key);
  }

  private removeEntry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.bytes;
    this.entries.delete(key);
  }
}

export const readCache = new ReadCache();

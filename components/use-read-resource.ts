"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errorMessage, isAbortError } from "@/lib/api";
import { useSession } from "@/components/session-provider";
import { readCache } from "@/lib/read-cache";

type ReadState<T> = { key: string; data: T | null; loading: boolean; error: string | null; status?: number };

/** Reads stay component-local unless a caller explicitly supplies a short TTL.
 * Never cache capabilities/permissions. Cached DTOs do not authorize submissions.
 * Changing account or query hides old data in the same render.
 */
export function useReadResource<T>(queryKey: string, loader: (signal: AbortSignal) => Promise<T>, enabled = true, cacheTtlMs = 0) {
  const { sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const key = `${sessionIdentity.generation}:${queryKey}`;
  const [attempt, setAttempt] = useState(0);
  const forceNext = useRef(false);
  const cached = enabled && cacheTtlMs > 0 && typeof window !== "undefined" ? readCache.peek<T>(sessionIdentity.generation, queryKey) : undefined;
  const [state, setState] = useState<ReadState<T>>(() => ({ key, data: cached ?? null, loading: cached === undefined, error: null }));
  const retry = useCallback(() => { forceNext.current = true; setAttempt(value => value + 1); }, []);
  useEffect(() => {
    if (!enabled) { setState({ key, data: null, loading: false, error: null }); return; }
    const controller = new AbortController(); const identity = sessionIdentity;
    const force = forceNext.current; forceNext.current = false;
    const fresh = !force && cacheTtlMs > 0 ? readCache.peek<T>(identity.generation, queryKey) : undefined;
    if (fresh !== undefined) { setState({ key, data: fresh, loading: false, error: null }); return; }
    setState(old => ({ key, data: old.key === key ? old.data : null, loading: true, error: null }));
    const request = cacheTtlMs > 0
      ? readCache.read(identity.generation, queryKey, loader, { ttlMs: cacheTtlMs, signal: controller.signal, force })
      : loader(controller.signal);
    void request.then(data => {
      if (!controller.signal.aborted && isCurrentSession(identity)) setState({ key, data, loading: false, error: null });
    }).catch(error => {
      if (controller.signal.aborted || !isCurrentSession(identity)) return;
      // A mutation may invalidate a shared request while this reader stays mounted.
      if (isAbortError(error)) { retry(); return; }
      const status = error instanceof ApiError ? error.status : undefined;
      if (cacheTtlMs > 0 && (status === 401 || status === 403)) readCache.invalidate(identity.generation, queryKey);
      setState(old => ({ key, data: status === 401 || status === 403 ? null : old.key === key ? old.data : null, loading: false, error: errorMessage(error), status }));
      if (status === 401) signOutIfCurrent(identity);
    });
    return () => controller.abort();
  }, [key, queryKey, enabled, attempt, loader, cacheTtlMs, sessionIdentity, isCurrentSession, signOutIfCurrent, retry]);
  const visible = enabled && state.key === key ? state : { key, data: enabled ? cached ?? null : null, loading: enabled && cached === undefined, error: null };
  return { ...visible, retry, refreshing: visible.loading && visible.data !== null };
}

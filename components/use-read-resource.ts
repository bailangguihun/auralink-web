"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, errorMessage, isAbortError } from "@/lib/api";
import { useSession } from "@/components/session-provider";

type ReadState<T> = { key: string; data: T | null; loading: boolean; error: string | null; status?: number };

/** Read-only, component-local retention: same generation AND query only.
 * No capability cache and no persistence. Callers must not use retained data
 * as permission to submit. Changing a key hides old data in the same render.
 */
export function useReadResource<T>(queryKey: string, loader: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const { sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const key = `${sessionIdentity.generation}:${queryKey}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReadState<T>>({ key: "", data: null, loading: true, error: null });
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!enabled) { setState({ key, data: null, loading: false, error: null }); return; }
    const controller = new AbortController(); const identity = sessionIdentity;
    setState(old => ({ key, data: old.key === key ? old.data : null, loading: true, error: null }));
    void loader(controller.signal).then(data => {
      if (!controller.signal.aborted && isCurrentSession(identity)) setState({ key, data, loading: false, error: null });
    }).catch(error => {
      if (controller.signal.aborted || isAbortError(error) || !isCurrentSession(identity)) return;
      const status = error instanceof ApiError ? error.status : undefined;
      setState(old => ({ key, data: status === 401 || status === 403 ? null : old.key === key ? old.data : null, loading: false, error: errorMessage(error), status }));
      if (status === 401) signOutIfCurrent(identity);
    });
    return () => controller.abort();
  }, [key, enabled, attempt, loader, sessionIdentity, isCurrentSession, signOutIfCurrent]);
  const visible = enabled && state.key === key ? state : { key, data: null, loading: enabled, error: null };
  return { ...visible, retry, refreshing: visible.loading && visible.data !== null };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";
import { ApiError, errorMessage, isAbortError } from "@/lib/api";
import { KnowledgeContractError } from "@/lib/knowledge-contracts";
import { readCache } from "@/lib/read-cache";
import { KNOWLEDGE_TTL_MS } from "@/lib/navigation-data";

/** Every result, including a delayed 401, is scoped to the captured session generation. */
export function useKnowledgeResource<T>(queryKey: string, loader: (token: string, signal?: AbortSignal) => Promise<T>) {
  const { token, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const [attempt, setAttempt] = useState(0);
  const forceNext = useRef(false);
  const key = `${sessionIdentity.generation}:${queryKey}`;
  const [state, setState] = useState(() => {
    const cached = typeof window !== "undefined" && token ? readCache.peek<T>(sessionIdentity.generation, queryKey) : undefined;
    return { key, data: cached ?? null as T | null, loading: cached === undefined, error: null as string | null, unavailable: false };
  });
  const retry = useCallback(() => { forceNext.current = true; setAttempt(value => value + 1); }, []);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const identity = sessionIdentity;
    const force = forceNext.current; forceNext.current = false;
    const cached = !force ? readCache.peek<T>(identity.generation, queryKey) : undefined;
    if (cached !== undefined) { setState({ key, data: cached, loading: false, error: null, unavailable: false }); return; }
    setState(old => ({ key, data: old.key === key ? old.data : null, loading: true, error: null, unavailable: false }));
    void readCache.read(identity.generation, queryKey, signal => loader(token, signal), { ttlMs: KNOWLEDGE_TTL_MS, signal: controller.signal, force }).then((data) => {
      if (!controller.signal.aborted && isCurrentSession(identity)) setState({ key, data, loading: false, error: null, unavailable: false });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || !isCurrentSession(identity)) return;
      if (isAbortError(error)) { retry(); return; }
      if (error instanceof ApiError && [401, 403].includes(error.status)) readCache.invalidate(identity.generation, queryKey);
      if (error instanceof ApiError && error.kind === "unauthorized") { signOutIfCurrent(identity); return; }
      const unavailable = error instanceof ApiError && [404, 503].includes(error.status);
      const message = error instanceof KnowledgeContractError ? error.message : errorMessage(error);
      setState({ key, data: null, loading: false, error: message, unavailable });
    });
    return () => controller.abort();
  }, [attempt, key, queryKey, isCurrentSession, loader, sessionIdentity, signOutIfCurrent, token, retry]);
  const visible = token && state.key === key ? state : { data: null, loading: Boolean(token), error: null, unavailable: false };
  return { ...visible, retry };
}

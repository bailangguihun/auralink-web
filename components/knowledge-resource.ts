"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { ApiError, errorMessage, isAbortError } from "@/lib/api";
import { KnowledgeContractError } from "@/lib/knowledge-contracts";

/** Every result, including a delayed 401, is scoped to the captured session generation. */
export function useKnowledgeResource<T>(loader: (token: string, signal?: AbortSignal) => Promise<T>) {
  const { token, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null; unavailable: boolean }>({ data: null, loading: true, error: null, unavailable: false });
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const identity = sessionIdentity;
    setState(old => ({ data: old.data, loading: true, error: null, unavailable: false }));
    void loader(token, controller.signal).then((data) => {
      if (!controller.signal.aborted && isCurrentSession(identity)) setState({ data, loading: false, error: null, unavailable: false });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || isAbortError(error) || !isCurrentSession(identity)) return;
      if (error instanceof ApiError && error.kind === "unauthorized") { signOutIfCurrent(identity); return; }
      const unavailable = error instanceof ApiError && [404, 503].includes(error.status);
      const message = error instanceof KnowledgeContractError ? error.message : errorMessage(error);
      setState({ data: null, loading: false, error: message, unavailable });
    });
    return () => controller.abort();
  }, [attempt, isCurrentSession, loader, sessionIdentity, signOutIfCurrent, token]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}

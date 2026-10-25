'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useSession } from '@/components/session-provider';
import { ApiError, isAbortError } from '@/lib/api';
import { assistantGenerationNotice } from '@/lib/assistant-contracts';
import { artworkErrorMessage } from '@/lib/assistant-artworks';
/** Every operation captures login generation. Stale successes are rejected as well as 401s. */
export function useAssistantAccess(onError: (message: string) => void) {
  const { token, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());
  const errorRef = useRef(onError); errorRef.current = onError;
  useEffect(() => { mounted.current = true; const active = requests.current; return () => { mounted.current = false; active.forEach(controller => controller.abort()); active.clear(); }; }, [sessionIdentity]);
  const request = useCallback(async <T,>(action: (token: string, signal: AbortSignal) => Promise<T>, externalSignal?: AbortSignal): Promise<T> => {
    if (!token || !mounted.current || !isCurrentSession(sessionIdentity)) throw new DOMException('Stale session', 'AbortError');
    const identity = sessionIdentity; const controller = new AbortController(); requests.current.add(controller);
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    if (externalSignal?.aborted) controller.abort();
    try {
      const result = await action(token, controller.signal);
      if (controller.signal.aborted || !isCurrentSession(identity)) throw new DOMException('Stale account', 'AbortError');
      return result;
    } catch (error) {
      if (controller.signal.aborted || !isCurrentSession(identity)) throw new DOMException('Stale account', 'AbortError');
      if (error instanceof ApiError && error.status === 401) signOutIfCurrent(identity);
      throw error;
    } finally { externalSignal?.removeEventListener("abort", abort); requests.current.delete(controller); }
  }, [token, sessionIdentity, isCurrentSession, signOutIfCurrent]);
  const report = useCallback((error: unknown) => {
    if (isAbortError(error)) return;
    if (error instanceof ApiError && ['ASSISTANT_GENERATION_SUSPENDED', 'ASSISTANT_GENERATION_CONTROL_UNAVAILABLE'].includes(error.code || '')) { errorRef.current(assistantGenerationNotice(error.code)); return; }
    if (error instanceof ApiError && (error.code || '').startsWith('ASSISTANT_ARTWORK_')) {
      errorRef.current(error.code === 'ASSISTANT_ARTWORK_REQUIRED' ? '请先查找并选用平台作品，或清除作品参考后发送普通问题。' : error.code === 'ASSISTANT_ARTWORK_CONTEXT_LIMIT' ? '所选作品资料超出单次上下文上限；请减少选择后重试，没有自动发起模型请求。' : artworkErrorMessage(error)); return;
    }
    errorRef.current(error instanceof Error ? error.message : '操作未完成，请重试。');
  }, []);
  return { request, report, token, sessionIdentity, isCurrentSession, signOutIfCurrent };
}

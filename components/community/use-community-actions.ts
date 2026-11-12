"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";
import { ApiError, errorMessage } from "@/lib/api";
import { readCache } from "@/lib/read-cache";
import { communityApi, definiteWriteFailure, operationStorageKey, readOperation, type OperationHandle, type OperationOutcome, type OperationResult } from "@/lib/community";

export function useCommunityActions() {
  const { token, user, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const actorId = String(user?.id || ""), storageKey = operationStorageKey(actorId);
  const [pending, setPending] = useState<OperationHandle | null>(null), [sending, setSending] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [storageReady, setStorageReady] = useState(false), [message, setMessage] = useState("");
  const [lastResult, setLastResult] = useState<OperationResult | null>(null), [revision, setRevision] = useState(0);
  const active = useRef<OperationHandle | null>(null), locked = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    try {
      const saved = readOperation(sessionStorage.getItem(storageKey), actorId);
      active.current = saved; locked.current = Boolean(saved); setPending(saved); setStorageReady(true);
    } catch (error) { setMessage(errorMessage(error)); }
  }, [storageKey, actorId]);
  const committed = useCallback((handle: OperationHandle, result: OperationResult) => {
    if (active.current?.requestId !== handle.requestId) return;
    if (result.kind !== handle.kind) throw new Error("操作返回身份不一致，请继续核对。");
    readCache.invalidate(sessionIdentity.generation, "community-");
    sessionStorage.removeItem(storageKey); active.current = null; locked.current = false;
    setPending(null); setSending(false); setLastResult(result); setRevision(value => value + 1);
    setMessage(result.kind === "upload" ? "图片已上传，发布前仅自己可见。" : "已保存。");
  }, [sessionIdentity.generation, storageKey]);
  const check = useCallback(async () => {
    const handle = active.current;
    if (!handle || !token || sending) return;
    const identity = sessionIdentity;
    try {
      const outcome = await communityApi.outcome(token, handle.requestId);
      if (!mounted.current || !isCurrentSession(identity) || active.current?.requestId !== handle.requestId) return;
      if (outcome.state === "COMMITTED" && outcome.result) committed(handle, outcome.result);
      else setMessage("暂未查到已提交记录，结果仍待确认。请稍后核对，不要重复提交。");
    } catch (error) {
      if (!mounted.current || !isCurrentSession(identity)) return;
      setMessage(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) signOutIfCurrent(identity);
    }
  }, [token, sending, sessionIdentity, isCurrentSession, committed, signOutIfCurrent]);
  useEffect(() => { if (pending && !sending) void check(); }, [pending, sending, check]);
  const execute = useCallback(async (kind: string, work: (token: string, requestId: string) => Promise<OperationOutcome>) => {
    if (!mounted.current || !isCurrentSession(sessionIdentity) || !token || !storageReady || locked.current) return null;
    const identity = sessionIdentity, handle = { requestId: crypto.randomUUID(), actorId, kind };
    locked.current = true;
    try { sessionStorage.setItem(storageKey, JSON.stringify(handle)); }
    catch { locked.current = false; setMessage("浏览器无法保存操作标识，请检查存储权限后再提交。"); return null; }
    active.current = handle; setPending(handle); setSending(true); setMessage("");
    readCache.invalidate(identity.generation, "community-");
    try {
      const outcome = await work(token, handle.requestId);
      if (!mounted.current || !isCurrentSession(identity) || active.current?.requestId !== handle.requestId) return null;
      if (outcome.state !== "COMMITTED" || !outcome.result) throw new Error("操作结果尚未确认。");
      committed(handle, outcome.result); return outcome.result;
    } catch (error) {
      if (!mounted.current || !isCurrentSession(identity) || active.current?.requestId !== handle.requestId) return null;
      setSending(false);
      if (definiteWriteFailure(error)) {
        sessionStorage.removeItem(storageKey); active.current = null; locked.current = false; setPending(null);
        if (error instanceof ApiError && error.status === 401) signOutIfCurrent(identity);
      }
      setMessage(errorMessage(error)); return null;
    } finally { if (!mounted.current && isCurrentSession(identity)) readCache.invalidate(identity.generation, "community-"); }
  }, [token, storageReady, sessionIdentity, actorId, storageKey, isCurrentSession, committed, signOutIfCurrent]);
  const write = useCallback((path: string, method: string, payload: object, kind: string) =>
    execute(kind, (value, requestId) => communityApi.write(value, path, method, { ...payload, requestId })), [execute]);
  return { busy: !storageReady || sending || Boolean(pending) || transferring, pending, sending, message, setMessage, lastResult, revision, execute, write, check, setTransferring };
}
export type CommunityActions = ReturnType<typeof useCommunityActions>;

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isAbortError } from '@/lib/api';
import { assistantImageFingerprint, assistantPage, assistantRequest, OperationLedger } from '@/lib/assistant-api';
import { mergeItems, type Attachment, type Page } from '@/lib/assistant-contracts';
import { attachmentErrorMessage, isDefinitiveUploadRefusal, uploadRecovery, type UploadResolution, type UploadRecovery } from '@/lib/assistant-attachment-recovery';
import { useAssistantAccess } from './use-assistant-access';

type PendingUpload = { scope: string; state: 'unconfirmed' | 'uploading'; id?: string };
type Access = ReturnType<typeof useAssistantAccess>;
const enc = encodeURIComponent;
/** Server-authoritative session drafts. Cleanup revokes browser resources elsewhere; it never deletes uploads. */
export function useAssistantAttachments(id: string, revision: number, ledger: OperationLedger, access: Access) {
  const { request } = access;
  const [page, setPage] = useState<Page<Attachment>>({ items: [], nextCursor: null, hasMore: false });
  const [localFiles, setLocalFiles] = useState<ReadonlyMap<string, File>>(() => new Map());
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [storageRevision, setStorageRevision] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const epoch = useRef(0); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const resolve = useCallback((key: string) => request((token, signal) => assistantRequest<UploadResolution>('/requests/resolve', token, signal, 'POST', { operation: 'UPLOAD_ATTACHMENT', requestKey: key, sessionId: id })), [id, request]);
  const load = useCallback(async (cursor?: string | null) => {
    const current = ++epoch.current; const reconciled = new Map<string, UploadRecovery>(); setLoading(true); setError('');
    try {
      const unresolved: PendingUpload[] = []; const notices: string[] = [];
      for (const [scope, record] of ledger.entries()) {
        if (!scope.startsWith(`UPLOAD_ATTACHMENT:${id}:`)) continue;
        try {
          const result = await resolve(record.key); if (!alive.current || current !== epoch.current) return;
          const state = uploadRecovery(result); reconciled.set(scope, state);
          if (state === 'ready' || state === 'linked' || state === 'terminal') {
            ledger.resolved(scope);
            if (state === 'terminal') notices.push('上次上传未完成或已移除，请重新选择图片；新的主动上传不会沿用已结束的请求。');
          } else unresolved.push({ scope, state, id: result.resultId });
        } catch (failure) {
          if (isAbortError(failure)) throw failure;
          if (failure instanceof ApiError && failure.status === 410) { reconciled.set(scope, 'terminal'); ledger.resolved(scope); notices.push('上次上传已过期或移除；仍需使用时，请重新选择图片。'); }
          else throw failure;
        }
      }
      const result = await request((token, signal) => assistantPage<Attachment>(`/sessions/${enc(id)}/attachments/draft`, token, signal, cursor));
      if (!alive.current || current !== epoch.current) return;
      setPending(unresolved); setNotice([...new Set(notices)].join(' '));
      setPage(old => cursor ? { ...result, items: mergeItems(old.items, result.items, row => row.id) } : result);
      if (!cursor) {
        const visibleIds = new Set(result.items.map(item => item.id));
        setLocalFiles(old => new Map([...old].filter(([attachmentId]) => visibleIds.has(attachmentId))));
      }
    } catch (failure) { if (alive.current && current === epoch.current && !isAbortError(failure)) setError(attachmentErrorMessage(failure)); }
    finally { if (alive.current && current === epoch.current) { setLoading(false); setStorageRevision(value => value + 1); } }
    return reconciled;
  }, [id, ledger, resolve, request]);
  useEffect(() => { void load(); }, [load, revision]);
  const upload = async (file: File) => {
    if (page.items.length >= 4 || page.hasMore) throw new Error('当前已有至少四张待发送图片，请先发送或移除后再添加。');
    const digest = await assistantImageFingerprint(file); const scope = `UPLOAD_ATTACHMENT:${id}:${digest}`;
    const prior = ledger.entries().find(([name]) => name === scope)?.[1];
    if (prior) {
      try {
        const result = await resolve(prior.key); const state = uploadRecovery(result);
        if (state === 'ready' || state === 'linked') { ledger.resolved(scope); await load(); setNotice(state === 'linked' ? '这张图片已随消息保存，可在历史中查看；没有重复上传。再次主动选择可创建新的待发送图片。' : '已找回服务器确认的图片，没有重复上传。'); return; }
        if (state === 'uploading') { await load(); throw new Error('原上传仍在服务端处理中。请核对状态，或明确移除这次未完成上传后重新选择；没有重复上传。'); }
        if (state === 'terminal') ledger.resolved(scope);
        // NOT_FOUND reuses the original key and payload: a delayed first request cannot create a duplicate.
      } catch (failure) { if (failure instanceof ApiError && failure.status === 410) ledger.resolved(scope); else throw failure; }
    }
    const requestKey = await ledger.key(scope, { digest, filename: file.name }); const form = new FormData(); form.set('file', file);
    try {
      const attachment = await request((token, signal) => assistantRequest<Attachment>(`/sessions/${enc(id)}/attachments?requestKey=${enc(requestKey)}`, token, signal, 'POST', form));
      if (attachment?.sessionId !== id || attachment.status !== 'READY' || !attachment.id || !attachment.contentUrl) {
        throw new Error('上传回执缺少已确认的图片信息。');
      }
      if (!alive.current) return;
      ledger.resolved(scope);
      // Any older list read may have started before the attachment was saved.
      epoch.current++;
      setPage(old => ({ ...old, items: [attachment, ...old.items.filter(item => item.id !== attachment.id)] }));
      setLocalFiles(old => new Map(old).set(attachment.id, file));
      setPending(old => old.filter(item => item.scope !== scope));
      setError('');
      setNotice('');
      setLoading(false);
      setStorageRevision(value => value + 1);
    } catch (failure) {
      if (isAbortError(failure)) throw failure;
      // Reconcile the same key even for a lost response. Never re-POST automatically.
      const reconciled = await load();
      if (alive.current && ['ready', 'linked'].includes(reconciled?.get(scope) || '')) { setNotice('已核对上次上传，服务器已保存图片；没有重复上传。'); return; }
      if (alive.current && reconciled?.get(scope) === 'unconfirmed' && isDefinitiveUploadRefusal(failure)) {
        // This response explicitly refused admission and the original key has no accepted record.
        // Unknown transport outcomes still retain their key; never replace one just to bypass a conflict.
        ledger.resolved(scope); await load();
      }
      throw new Error(attachmentErrorMessage(failure));
    }
  };
  const remove = async (attachmentId: string, scope?: string) => {
    try {
      await request((token, signal) => assistantRequest(`/attachments/${enc(attachmentId)}`, token, signal, 'DELETE'));
      if (scope) ledger.resolved(scope); await load();
    } catch (failure) { if (isAbortError(failure)) throw failure; throw new Error(attachmentErrorMessage(failure)); }
  };
  return { attachments: page.items, localFiles, hasMore: page.hasMore, pending, loading, error, notice, storageRevision, upload, remove, refresh: () => load(), more: () => load(page.nextCursor) };
}

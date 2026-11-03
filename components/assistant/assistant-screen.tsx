'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/components/session-provider';
import { LoadingSection, LoadingStatus, SkeletonRows, PendingIndicator } from '@/components/loading';
import { AssistantLoading, ConversationLoading } from './assistant-loading';
import { StatePanel } from '@/components/state-panel';
import { ApiError, isAbortError } from '@/lib/api';
import { assistantPage, assistantRequest, exportAssistant, OperationLedger } from '@/lib/assistant-api';
import { terminal, stateLabel, stageLabels, mergeItems, ragflowAvailable, webSearchAvailable, assistantRetrievalRequest, assistantGenerationAvailable, assistantGenerationNotice, type AssistantStatus, type AssistantSession, type Branch, type Message, type Run, type Registry, type Citation, type Choice, type Summary, type Timeline, type Page, type ArtworkReference, assistantDate, platformCitationFields } from '@/lib/assistant-contracts';
import { subscribeAssistant } from '@/lib/assistant-stream';
import { useAssistantAccess } from './use-assistant-access';
import { useAssistantAttachments } from './use-assistant-attachments';
import { PrivateAttachment } from './private-attachment';
import { AssistantStorage } from './assistant-storage';
import { useBrowserSpeech } from './use-browser-speech';
import { ArtworkSelection } from './artwork-selection';
import { selectedArtworkReferences, reconcileRejectedArtworkSubmission, artworkRunFailureNotice } from '@/lib/assistant-artworks';
import { AssistantPanel, AssistantModelPicker } from './assistant-panels';
import { AssistantMarkdown } from './assistant-markdown';
import { assistantMarkdownLink, assertAssistantSources } from '@/lib/assistant-presentation';
import styles from './assistant.module.css';
const enc = encodeURIComponent;
const empty = <T,>(): Page<T> => ({ items: [], nextCursor: null, hasMore: false });
type Access = ReturnType<typeof useAssistantAccess>;
function usePage<T>(path: string | null, access: Access, id: (row: T) => string, revision = 0, prepend = false, keepItems = false, reportErrors = true) {
  const [retry, setRetry] = useState(0);
  const [snapshot, setSnapshot] = useState<{ path: string | null; page: Page<T> }>({ path: null, page: empty() });
  const [loading, setLoading] = useState(Boolean(path)); const [error, setError] = useState('');
  const epoch = useRef(0); const idRef = useRef(id); idRef.current = id;
  const readController = useRef<AbortController | null>(null);
  const { request, report } = access;
  const page = snapshot.path === path ? snapshot.page : empty<T>();
  useEffect(() => {
    const current = ++epoch.current; const controller = new AbortController(); readController.current = controller;
    setSnapshot(old => old.path === path ? old : { path, page: empty() }); setError(''); setLoading(Boolean(path));
    if (path) void request((token, signal) => assistantPage<T>(path, token, signal), controller.signal).then(value => {
      if (current === epoch.current) setSnapshot(old => {
        // Messages are append-only in this branch. Keep explicitly paged older
        // messages and their cursor when refreshing the latest page.
        const retainOlder = prepend && old.path === path && old.page.items.length > value.items.length;
        return { path, page: retainOlder ? { ...old.page, items: mergeItems(old.page.items, value.items, idRef.current) } : value };
      });
    }).catch(error => {
      if (current !== epoch.current || isAbortError(error)) return;
      if (error instanceof ApiError && [401, 403, 404, 410].includes(error.status)) setSnapshot({ path, page: empty() });
      setError(error instanceof Error ? error.message : '读取失败'); if (reportErrors) report(error);
    }).finally(() => { if (current === epoch.current) setLoading(false); });
    return () => { epoch.current = current + 1; controller.abort(); };
  }, [path, revision, request, report, keepItems, retry, reportErrors, prepend]);
  const more = async () => {
    if (!path || loading || !page.hasMore || !page.nextCursor) return; const current = epoch.current; setLoading(true); setError('');
    try {
      const value = await request((token, signal) => assistantPage<T>(path, token, signal, page.nextCursor), readController.current?.signal);
      if (current === epoch.current) setSnapshot(old => ({ path, page: { ...value, items: prepend ? mergeItems(value.items, old.page.items, idRef.current) : mergeItems(old.page.items, value.items, idRef.current) } }));
    } catch (error) {
      if (current === epoch.current && !isAbortError(error)) {
        if (error instanceof ApiError && [401, 403, 404, 410].includes(error.status)) setSnapshot({ path, page: empty() });
        setError(error instanceof Error ? error.message : '读取失败'); if (reportErrors) report(error);
      }
    } finally { if (current === epoch.current) setLoading(false); }
  };
  return { ...page, loading: loading || (!!path && snapshot.path !== path), error: snapshot.path === path ? error : '', more, retry: () => setRetry(value => value + 1) };
}
function LoadMore({ page, label }: { page: { hasMore: boolean; loading: boolean; error?: string; more: () => Promise<void>; retry?: () => void }; label: string }) {
  return <>{page.error ? <p role="alert" className={styles.error}>{page.error}{!page.hasMore && page.retry ? <button type="button" className={styles.small} onClick={page.retry}>重新读取</button> : null}</p> : null}{page.hasMore ? <button type="button" className={styles.small} disabled={page.loading} onClick={() => void page.more()}>{page.loading ? <><PendingIndicator /> 正在读取…</> : label}</button> : null}</>;
}
function EmptyConversation({ action }: { action?: () => void }) {
  return <div className={styles.emptyConversation}><span className={styles.seal} aria-hidden>画</span><span className={styles.eyebrow}>ARTLIVE · 国画助手</span><h1>落笔之前，一起想想</h1><p>从一幅画、一个念头开始。<br />聊笔墨、构图与设色，让灵感慢慢成形。</p>{action ? <button className="button button-primary" onClick={action}>开始新的对话</button> : <p className={styles.meta}>写下画题，或选用平台作品、附上自己的图片。</p>}<small>对话与图片归当前账号所有，登录后可继续查看。</small></div>;
}
function Dialog({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; const prior = document.activeElement as HTMLElement | null; element?.showModal(); return () => { element?.close(); prior?.focus(); }; }, []);
  return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={event => { event.preventDefault(); close(); }}><h2>{title}</h2>{children}</dialog>;
}
export function AssistantScreen() {
  const { sessionIdentity } = useSession();
  return <AssistantAccount key={sessionIdentity.generation} />;
}
function AssistantAccount() {
  const { user } = useSession(); const [error, setError] = useState(''); const access = useAssistantAccess(setError); const [status, setStatus] = useState<AssistantStatus | null>(null); const [registry, setRegistry] = useState<Registry | null>(null); const [unavailable, setUnavailable] = useState(false); const [revision, setRevision] = useState(0); const [selected, setSelected] = useState<string | null>(null); const [dialog, setDialog] = useState(false); const [title, setTitle] = useState('新的国画对话'); const [busy, setBusy] = useState(false); const opBusy = useRef(false);
  const [generationChecking, setGenerationChecking] = useState(true);
  const [generationReady, setGenerationReady] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const fit = () => { const element = pageRef.current; if (!element) return; const height = viewport?.height || window.innerHeight; element.style.setProperty('--assistant-height', `${height}px`); element.dataset.compactViewport = String(height < 580); };
    fit(); viewport?.addEventListener('resize', fit); window.addEventListener('resize', fit);
    return () => { viewport?.removeEventListener('resize', fit); window.removeEventListener('resize', fit); };
  }, []);
  const [ledger] = useState(() => new OperationLedger(typeof window !== 'undefined' ? window.sessionStorage : undefined, `assistant.operation:${user?.id}`));
  const { request, report } = access;
  const sessions = usePage<AssistantSession>(status?.enabled ? '/sessions/page' : null, access, row => row.id, revision);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('session'); if (id && /^[0-9a-f-]{36}$/i.test(id)) setSelected(id);
  }, []);
  useEffect(() => {
    let alive = true; setUnavailable(false); setError(''); setGenerationReady(false); setGenerationChecking(true);
    void request((token, signal) => assistantRequest<AssistantStatus>('/status', token, signal)).then(async value => {
      if (!alive) return; setStatus(value);
      if (value.executionAvailable) {
        try { const models = await request((token, signal) => assistantRequest<Registry>('/models', token, signal)); if (alive) { setRegistry(models); setGenerationReady(true); } }
        catch (error) { if (alive) report(error); }
      }
    }).catch(error => { if (alive) { setUnavailable(true); report(error); } }).finally(() => { if (alive) setGenerationChecking(false); });
    return () => { alive = false; };
  }, [request, report, revision]);
  useEffect(() => {
    if (!status?.enabled) return; let alive = true;
    const pending = ledger.entries().find(([scope]) => scope === 'CREATE_SESSION');
    if (pending) void request((token, signal) => assistantRequest<{ status: string; resultId?: string }>('/requests/resolve', token, signal, 'POST', { operation: 'CREATE_SESSION', requestKey: pending[1].key })).then(result => {
      if (!alive || result.status !== 'FOUND' || !result.resultId) return;
      ledger.resolved('CREATE_SESSION'); setSelected(result.resultId); setRevision(value => value + 1);
      const url = new URL(window.location.href); url.searchParams.set('session', result.resultId); window.history.replaceState(null, '', url);
    }).catch(error => { if (alive) report(error); });
    return () => { alive = false; };
  }, [status?.enabled, ledger, request, report]);
  const select = (id: string | null) => { setSessionsOpen(false); setError(''); setSelected(id); const url = new URL(window.location.href); if (id) url.searchParams.set('session', id); else url.searchParams.delete('session'); window.history.replaceState(null, '', url); };
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (opBusy.current) return; opBusy.current = true; setBusy(true); setError('');
    try { const payload = { title }; const key = await ledger.key('CREATE_SESSION', payload); const value = await request((token, signal) => assistantRequest<AssistantSession>('/sessions', token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved('CREATE_SESSION'); setDialog(false); select(value.id); setRevision(value => value + 1); }
    catch (error) { report(error); } finally { opBusy.current = false; setBusy(false); }
  };
  const newSession = () => { setSessionsOpen(false); setTitle('新的国画对话'); setDialog(true); };
  const sessionList = <><div className={styles.sidebarHeading}><span className={styles.eyebrow}>ARTLIVE ASSISTANT</span><h2>国画助手</h2></div><button className={styles.newSession} onClick={newSession}><span aria-hidden>＋</span> 新建对话</button><p className={styles.meta}>我的对话</p>
    {sessions.loading && !sessions.items.length ? <LoadingSection label="正在读取会话" onRetry={sessions.retry}><SkeletonRows lines={5} /></LoadingSection> : !sessions.error && !sessions.items.length ? <p>还没有对话，从一次提问开始。</p> : null}
    <ul>{sessions.items.map(session => <li key={session.id}><button className={styles.session} data-testid="assistant-session" aria-current={selected === session.id} onClick={() => select(session.id)}><strong>{session.title}</strong><time>{assistantDate(session.createdAt).toLocaleDateString('zh-CN')}</time></button></li>)}</ul><LoadMore page={sessions} label="更多会话" /><p className={styles.sidebarNote}>私有会话 · 随账号保存</p></>;
  return <div ref={pageRef} className={styles.page} data-navigation-page="">
    {process.env.NEXT_PUBLIC_ASSISTANT_SIMULATED === 'true' ? <span className={styles.previewBadge}>隔离预览 · 模拟模型与资料</span> : null}
    {error ? <div className={`${styles.notice} ${styles.error}`} role="alert">{error}<button className={styles.small} onClick={() => { setError(''); setRevision(value => value + 1); }}>刷新记录</button></div> : null}
    {!status && !unavailable ? <AssistantLoading embedded /> : unavailable && !status ? <StatePanel kind="unavailable" title="助手暂不可用" description="其他 ArtLIVE 页面仍可使用。" actionLabel="重新连接" onAction={() => setRevision(value => value + 1)} /> : !status?.enabled ? <StatePanel kind="unavailable" title="助手尚未启用" description="当前服务未开放助手；不会发起模型请求。" /> : <>
      {status.executionAvailable && !generationReady ? <div className={styles.notice}>{generationChecking ? <LoadingStatus label="正在确认生成能力，已保存内容仍可浏览" /> : <><span>生成能力未确认，暂不能发送。</span><button className={styles.small} onClick={() => setRevision(value => value + 1)}>重新核对能力</button></>}</div> : null}
      {!status.executionAvailable ? <p className={styles.notice}>当前为历史模式：可以浏览、导出与管理已保存记录；新对话生成暂不可用。</p> : !assistantGenerationAvailable(status) ? <p className={styles.notice} role="status">{assistantGenerationNotice(status.generationState)}<button className={styles.small} onClick={() => setRevision(value => value + 1)}>刷新生成状态</button></p> : null}
      <div className={styles.layout}><aside className={styles.sidebar} aria-label="会话列表">{sessionList}</aside><main className={styles.main}>
        <div className={styles.mobileSessions}><button className={styles.small} onClick={() => setSessionsOpen(true)} aria-haspopup="dialog">☰ 我的对话</button><span>国画助手</span><button className={styles.small} onClick={newSession} aria-label="新建会话">＋</button></div>
        {selected ? <SessionWorkspace key={selected} id={selected} status={status} registry={registry} generationReady={generationReady} ledger={ledger} onChanged={() => setRevision(value => value + 1)} onDeleted={() => { select(null); setRevision(value => value + 1); }} /> : <EmptyConversation action={newSession} />}
      </main></div>
      {sessionsOpen ? <AssistantPanel title="我的对话" eyebrow="SESSIONS" close={() => setSessionsOpen(false)}><div className={styles.sessionDrawer}>{sessionList}</div></AssistantPanel> : null}
    </>}
    {dialog ? <Dialog title="新建会话" close={() => setDialog(false)}><form onSubmit={event => void create(event)}>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<label>会话名称<input autoFocus value={title} maxLength={160} required onChange={event => setTitle(event.target.value)} /></label><footer><button type="button" className="button" onClick={() => setDialog(false)}>返回</button><button className="button button-primary" disabled={busy}>创建会话</button></footer></form></Dialog> : null}
  </div>;
}
function SessionWorkspace({ id, status, registry, generationReady, ledger, onChanged, onDeleted }: { id: string; status: AssistantStatus; registry: Registry | null; generationReady: boolean; ledger: OperationLedger; onChanged: () => void; onDeleted: () => void }) {
  const [error, setError] = useState(''); const access = useAssistantAccess(setError); const { request, report } = access;
  const deletedRef = useRef(onDeleted); deletedRef.current = onDeleted;
  const [session, setSession] = useState<AssistantSession | null>(null); const [branchId, setBranchId] = useState<string | null>(null); const [revision, setRevision] = useState(0); const [busy, setBusy] = useState(false); const opBusy = useRef(false);
  const downloads = useRef(new Set<string>());
  useEffect(() => { const urls = downloads.current; return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); }; }, []);
  const [managementOpen, setManagementOpen] = useState(false);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null); const [title, setTitle] = useState(''); const [exportHistory, setExportHistory] = useState(false);
  const branches = usePage<Branch>(`/sessions/${enc(id)}/branches/page`, access, row => row.id, revision);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => { let alive = true; void request((token, signal) => assistantRequest<AssistantSession>(`/sessions/${enc(id)}`, token, signal)).then(value => { if (alive) { setSession(value); setBranchId(current => current || value.activeBranchId); } }).catch(error => { if (alive) { if (error instanceof ApiError && [403, 404, 410].includes(error.status)) deletedRef.current(); else report(error); } }); return () => { alive = false; }; }, [id, revision, request, report]);
  const update = async (payload: object) => { if (!session) return; const current = await request((token, signal) => assistantRequest<AssistantSession>(`/sessions/${enc(id)}`, token, signal)); const result = await request((token, signal) => assistantRequest<AssistantSession>(`/sessions/${enc(id)}`, token, signal, 'PATCH', { expectedVersion: current.version, ...payload })); setSession(result); onChanged(); };
  const switchBranch = async (next: string) => { if (opBusy.current) return; opBusy.current = true; setBusy(true); try { await update({ activeBranchId: next }); setBranchId(next); reload(); } catch (error) { report(error); } finally { opBusy.current = false; setBusy(false); } };
  const mutate = async (event: React.FormEvent) => {
    event.preventDefault(); if (opBusy.current) return; opBusy.current = true; setBusy(true);
    try { if (dialog === 'delete') { await request((token, signal) => assistantRequest(`/sessions/${enc(id)}`, token, signal, 'DELETE')); setDialog(null); onDeleted(); } else { await update({ title }); setDialog(null); } }
    catch (error) { report(error); } finally { opBusy.current = false; setBusy(false); }
  };
  const download = async (format: 'json' | 'csv') => { try { const blob = await request((token, signal) => exportAssistant(id, format, exportHistory, token, signal)); const url = URL.createObjectURL(blob); downloads.current.add(url); const link = document.createElement('a'); link.href = url; link.download = `assistant-${id}.${format}`; link.click(); setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 1000); } catch (error) { report(error); } };
  return <>
    {error ? <div role="alert" className={`${styles.notice} ${styles.error}`}>{error}<button className={styles.small} onClick={() => { setError(''); reload(); }}>刷新会话</button></div> : null}
    {session ? <><header className={styles.conversationHeader}><div><span className={styles.eyebrow}>对话 · 当前分支</span><h2>{session.title}</h2></div><button className={styles.small} aria-haspopup="dialog" onClick={() => setManagementOpen(true)}>会话与分支</button></header>
      {branchId ? <BranchWorkspace key={branchId} id={id} branchId={branchId} status={status} registry={registry} generationReady={generationReady} session={session} ledger={ledger} revision={revision} reload={reload} onBranch={next => { setBranchId(next); reload(); onChanged(); }} onAuto={async value => { await update({ summaryAutoEnabled: value }); reload(); }} onRevoked={() => deletedRef.current()} /> : null}
      {managementOpen ? <AssistantPanel title="会话与分支" eyebrow="CONVERSATION" close={() => setManagementOpen(false)}><div className={styles.inline}><button className="button" onClick={() => { setTitle(session.title); setDialog('rename'); }}>重命名</button><button className="button" onClick={reload}>刷新会话</button><button className="button" onClick={() => setDialog('delete')}>删除会话</button></div>
      <div className={styles.tools}><label className={styles.inline}>分支<select aria-label="分支" value={branchId || session.activeBranchId} disabled={busy} onChange={event => void switchBranch(event.target.value)}>{!branches.items.some(branch => branch.id === branchId) && branchId ? <option value={branchId}>当前分支</option> : null}{branches.items.map((branch, index) => <option key={branch.id} value={branch.id}>{branch.parentBranchId ? `编辑分支 ${index + 1}` : '原始分支'} · {branch.id.slice(0, 6)}</option>)}</select></label><LoadMore page={branches} label="更多分支" /><span className={styles.meta}>切换只读取历史，不发起生成。</span></div>
      <details className={`glass-panel ${styles.tools}`}><summary>导出与保存说明</summary><p>对话和原图保存在当前账号的私有记录中。默认导出当前分支；阶段标签是规则或用户分类，不是对实际作画行为的证明。导出文件不包含登录令牌或图片字节。</p><label className={styles.inline}><input type="checkbox" checked={exportHistory} onChange={event => setExportHistory(event.target.checked)} />包含历史分支</label><div className={styles.inline}><button className="button" onClick={() => void download('json')}>JSON导出</button><button className="button" onClick={() => void download('csv')}>CSV导出</button></div><p className={styles.meta}>超出服务端导出上限时会明确拒绝，不会悄悄截断。主动删除立即撤销应用访问；备份与上游已处理内容不承诺同步抹除。</p></details>
      </AssistantPanel> : null}
    </> : error ? null : <ConversationLoading />}
    {dialog ? <Dialog title={dialog === 'delete' ? '删除会话' : '重命名会话'} close={() => setDialog(null)}><form onSubmit={event => void mutate(event)}>{error ? <p role="alert" className={styles.error}>{error}</p> : null}{dialog === 'delete' ? <p>删除「{session?.title}」后，对话、分支及私有图片立即不可访问。此操作不能从页面撤销。</p> : <label>会话名称<input autoFocus value={title} maxLength={160} required onChange={event => setTitle(event.target.value)} /></label>}<footer><button className="button" type="button" onClick={() => setDialog(null)}>返回</button><button className="button button-primary" disabled={busy}>{dialog === 'delete' ? '确认删除' : '保存名称'}</button></footer></form></Dialog> : null}
  </>;
}
function BranchWorkspace({ id, branchId, status, registry, generationReady, session, ledger, revision, reload, onBranch, onAuto, onRevoked }: { id: string; branchId: string; status: AssistantStatus; registry: Registry | null; generationReady: boolean; session: AssistantSession; ledger: OperationLedger; revision: number; reload: () => void; onBranch: (id: string) => void; onAuto: (value: boolean) => Promise<void>; onRevoked: () => void }) {
  const [error, setError] = useState(''); const access = useAssistantAccess(setError); const { request, report, token, sessionIdentity, isCurrentSession, signOutIfCurrent } = access;
  const revokedRef = useRef(onRevoked); revokedRef.current = onRevoked;
  const branchRef = useRef(onBranch); branchRef.current = onBranch;
  const [activityTick, setActivityTick] = useState(0);
  useEffect(() => { if (!status.executionAvailable) return; const timer = setInterval(() => setActivityTick(value => value + 1), 2500); return () => clearInterval(timer); }, [status.executionAvailable]);
  const [selectedArtworks, setSelectedArtworks] = useState<ArtworkReference[]>([]);
  const [panel, setPanel] = useState<'history' | 'sources' | 'artworks' | 'tools' | null>(null);
  const [sourceRun, setSourceRun] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageScroll = useRef<HTMLElement>(null);
  const followBottom = useRef(true);
  const priorScroll = useRef({ first: '', last: '', height: 0, top: 0 });
  const [branch, setBranch] = useState<Branch | null>(null); const [text, setText] = useState(''); const [model, setModel] = useState(''); const [ragflow, setRagflow] = useState(false); const [webSearch, setWebSearch] = useState(false); const [busy, setBusy] = useState(false); const busyRef = useRef(false); const composing = useRef(false); const [connection, setConnection] = useState('');
  const [live, setLive] = useState<Run | null>(null); const [editing, setEditing] = useState<Message | null>(null); const [editText, setEditText] = useState(''); const [notice, setNotice] = useState(''); const [timelineOpen, setTimelineOpen] = useState(false); const [summaryOpen, setSummaryOpen] = useState(false);
  const draft = useAssistantAttachments(id, revision, ledger, access); const attachments = draft.attachments;
  const messages = usePage<Message>(`/sessions/${enc(id)}/messages/page?branchId=${enc(branchId)}`, access, row => row.id, revision, true);
  const runs = usePage<Run>(status.executionAvailable ? `/sessions/${enc(id)}/runs/page?branchId=${enc(branchId)}` : null, access, row => row.id, revision);
  const active = usePage<Run>(status.executionAvailable ? `/sessions/${enc(id)}/runs/page?activeOnly=true` : null, access, row => row.id, revision + activityTick, false, true);
  const summaries = usePage<Summary>(status.executionAvailable && summaryOpen ? `/sessions/${enc(id)}/summaries/page?branchId=${enc(branchId)}` : null, access, row => row.id, revision, false, false, false);
  const timeline = usePage<Timeline>(status.executionAvailable && timelineOpen ? `/sessions/${enc(id)}/timeline/page?branchId=${enc(branchId)}` : null, access, row => row.messageId, revision, true);
  const speech = useBrowserSpeech(value => setText(current => `${current}${current ? '\n' : ''}${value}`), setError);
  const selectedModel = registry?.models.find(item => item.id === model);
  const generationAvailable = generationReady && assistantGenerationAvailable(status);
  const requireGeneration = () => { if (!generationAvailable) throw new Error(generationReady ? assistantGenerationNotice(status.generationState) : '正在确认生成能力，请稍候。'); };
  useEffect(() => { if (!model && registry?.models.length) setModel(registry.models.find(item => item.enabled && item.configured && item.capabilities.streaming)?.id || ''); }, [registry, model]);
  useEffect(() => { let alive = true; void request((token, signal) => assistantRequest<Branch>(`/sessions/${enc(id)}/branches/${enc(branchId)}`, token, signal)).then(value => { if (alive) setBranch(value); }).catch(error => { if (alive) report(error); }); return () => { alive = false; }; }, [id, branchId, revision, request, report]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      let recovered = false;
      for (const [scope, record] of ledger.entries()) {
        const [operation, sessionId] = scope.split(':'); if (sessionId !== id || operation === 'UPLOAD_ATTACHMENT') continue;
        const result = await request((token, signal) => assistantRequest<{ status: string; resultType?: string; resultId?: string }>('/requests/resolve', token, signal, 'POST', { operation, requestKey: record.key, sessionId: id }));
        if (!alive) return;
        if (result.status === 'FOUND') {
          if (result.resultType === 'BRANCH' && result.resultId) branchRef.current(result.resultId);
          if (result.resultType === 'RUN' && result.resultId) {
            const recoveredRun = await request((token, signal) => assistantRequest<Run>(`/runs/${enc(result.resultId!)}`, token, signal));
            if (!alive) return; setLive(recoveredRun); if (recoveredRun.branchId !== branchId) branchRef.current(recoveredRun.branchId);
          }
          ledger.resolved(scope); recovered = true;
        }
      }
      if (alive && recovered) { setNotice('已找回上次请求的持久记录；没有再次发起生成。'); reload(); }
    })().catch(error => { if (alive) report(error); });
    return () => { alive = false; };
  }, [id, branchId, ledger, request, report, reload, revision]);
  useEffect(() => {
    if (!activityTick) return; let alive = true;
    void request((token, signal) => assistantRequest<AssistantSession>(`/sessions/${enc(id)}`, token, signal)).then(current => { if (alive && current.version !== session.version) reload(); }).catch(error => {
      if (alive && error instanceof ApiError && [404, 410].includes(error.status)) revokedRef.current();
    });
    return () => { alive = false; };
  }, [activityTick, id, request, session.version, reload]);
  const running = active.items.find(item => !terminal(item.status)); const pendingChat = active.items.find(item => item.kind === 'CHAT' && !terminal(item.status)); const runningId = running?.id;
  useEffect(() => {
    if (!runningId || !token) return;
    const controller = new AbortController(); const identity = sessionIdentity; let current: Run | null = null;
    const currentAccount = () => !controller.signal.aborted && isCurrentSession(identity);
    const delay = (milliseconds: number) => new Promise<void>(resolve => { const timeout = setTimeout(resolve, milliseconds); controller.signal.addEventListener('abort', () => { clearTimeout(timeout); resolve(); }, { once: true }); });
    void (async () => {
      while (currentAccount()) {
        try {
          current = await assistantRequest<Run>(`/runs/${enc(runningId)}`, token, controller.signal);
          if (!currentAccount()) return; setLive(current);
          if (terminal(current.status)) { setConnection(''); reload(); return; }
          setConnection('正在接收已保存的回复');
          current = await subscribeAssistant(current, token, controller.signal, value => { if (currentAccount()) setLive(value); });
          if (!currentAccount()) return;
          // The next loop always confirms the saved server state, including after EOF.
          setConnection('正在确认服务端状态…'); await delay(350);
        } catch (error) {
          if (!currentAccount() || isAbortError(error)) return;
          if (error instanceof ApiError && error.status === 401) { signOutIfCurrent(identity); return; }
          if (error instanceof ApiError && [403, 404, 410].includes(error.status)) { setLive(null); revokedRef.current(); return; }
          setConnection('连接中断，正在恢复已保存状态；没有重新提交生成。'); await delay(1500);
        }
      }
    })();
    return () => controller.abort();
  }, [runningId, token, sessionIdentity, isCurrentSession, signOutIfCurrent, reload]);
  const act = async (action: () => Promise<void>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); try { await action(); } catch (error) { report(error); } finally { busyRef.current = false; setBusy(false); } };
  const command = (value: string, ids: string[]) => ({ branchId, expectedVersion: branch?.version, text: value, attachmentIds: ids, modelKey: model, retrieval: assistantRetrievalRequest(registry, selectedArtworks.length > 0, ragflow, webSearch), artworkRefs: selectedArtworkReferences(selectedArtworks) });
  const submitCommand = async (path: string, payload: ReturnType<typeof command>, scope: string, operation: string) => {
    const requestKey = await ledger.key(scope, payload);
    try {
      const result = await request((token, signal) => assistantRequest<{ run: Run; replay: boolean }>(path, token, signal, 'POST', { ...payload, requestKey }));
      setNotice('');
      return result;
    } catch (error) {
      const reconciled = await reconcileRejectedArtworkSubmission(error, ledger, scope, requestKey, () => request((token, signal) => assistantRequest<{ status: string }>('/requests/resolve', token, signal, 'POST', { operation, requestKey, sessionId: id })));
      if (reconciled) setNotice('作品校验未通过；已核对这次请求未创建执行。可调整作品选择后主动发送，不会自动重试。');
      throw error;
    }
  };
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault(); if (!generationAvailable || (!text.trim() && !attachments.length) || !branch || !selectedModel || pendingChat || busyRef.current || messages.loading || messages.error || draft.loading || draft.error || draft.hasMore || attachments.length > 4) return;
    await act(async () => { const payload = command(text, attachments.map(image => image.id)); const scope = `CHAT_EXECUTION:${id}`; const result = await submitCommand(`/sessions/${enc(id)}/runs`, payload, scope, 'CHAT_EXECUTION'); ledger.resolved(scope); setLive(result.run); setText(''); setSelectedArtworks([]); reload(); });
  };
  const upload = async (file: File | undefined) => { if (file) await act(() => draft.upload(file)); };
  const cancel = async (run: Run) => act(async () => { const value = await request((token, signal) => assistantRequest<Run>(`/runs/${enc(run.id)}/cancel`, token, signal, 'POST')); setLive(value); reload(); });
  const retry = async (run: Run) => act(async () => { requireGeneration(); if (!branch) return; const scope = `RETRY_EXECUTION:${id}:${run.id}`; const payload = { expectedVersion: branch.version, acknowledgePossiblePriorCharge: true }; const key = await ledger.key(scope, payload); const result = await request((token, signal) => assistantRequest<{ run: Run }>(`/runs/${enc(run.id)}/retry`, token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved(scope); onBranch(result.run.branchId); setLive(result.run); reload(); });
  const choose = async (run: Run, cardId: string, optionId: string) => act(async () => { requireGeneration(); if (!branch) return; const payload = { branchId, expectedVersion: branch.version, modelKey: model, cardId, optionId }; const scope = `CHAT_EXECUTION:${id}`; const key = await ledger.key(scope, payload); const result = await request((token, signal) => assistantRequest<{ run: Run }>(`/runs/${enc(run.id)}/choices`, token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved(scope); setLive(result.run); reload(); });
  const saveEdit = async (event: React.FormEvent) => { event.preventDefault(); await act(async () => { if (!editing || !branch) return; const payload = { branchId, expectedVersion: branch.version, text: editText }; const scope = `REVISE_MESSAGE:${id}:${editing.id}`; const key = await ledger.key(scope, payload); const next = await request((token, signal) => assistantRequest<Branch>(`/sessions/${enc(id)}/messages/${enc(editing.id)}/revisions`, token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved(scope); setEditing(null); onBranch(next.id); }); };
  const editedHead = messages.items.find(message => message.id === branch?.headMessageId && message.role === 'USER' && message.supersedesId && !message.runId);
  const executeEdit = async () => act(async () => { requireGeneration(); if (!editedHead) return; const payload = command(editedHead.body, []); const scope = `EDITED_EXECUTION:${id}`; const result = await submitCommand(`/sessions/${enc(id)}/edited-runs`, payload, scope, 'EDITED_EXECUTION'); ledger.resolved(scope); setLive(result.run); reload(); });
  const summary = async () => act(async () => { requireGeneration(); const payload = { branchId }; const scope = `SUMMARY_EXECUTION:${id}`; const key = await ledger.key(scope, payload); const run = await request((token, signal) => assistantRequest<Run>(`/sessions/${enc(id)}/summaries`, token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved(scope); setLive(run); setSummaryOpen(true); reload(); });
  const classify = async (row: Timeline, label: string) => act(async () => { const payload = { expectedVersion: row.classificationVersion, label }; const scope = `CLASSIFY_MESSAGE:${id}:${row.messageId}`; const key = await ledger.key(scope, payload); await request((token, signal) => assistantRequest(`/sessions/${enc(id)}/messages/${enc(row.messageId)}/classification`, token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved(scope); reload(); });
  const currentLive = live && live.branchId === branchId ? live : null;
  const sourceRows = messages.items.flatMap((message, index) => {
    if (message.role !== 'ASSISTANT' || !message.runId) return [];
    const question = messages.items.slice(0, index).reverse().find(item => item.role === 'USER')?.body || '助手回复';
    const turn = messages.items.slice(0, index + 1).filter(item => item.role === 'USER').length;
    return [{ message, question, turn }];
  }).reverse();
  const knowledgeSearchAvailable = ragflowAvailable(registry);
  const onlineSearchAvailable = webSearchAvailable(registry);
  useLayoutEffect(() => {
    const area = textareaRef.current; if (!area) return;
    area.style.height = 'auto'; area.style.height = `${Math.min(area.scrollHeight, 124)}px`;
  }, [text]);
  useLayoutEffect(() => {
    const area = messageScroll.current; if (!area) return;
    const first = messages.items[0]?.id || '', last = messages.items.at(-1)?.id || '';
    const old = priorScroll.current;
    if (old.first && old.first !== first && old.last === last) area.scrollTop = old.top + area.scrollHeight - old.height;
    else if (followBottom.current) area.scrollTop = area.scrollHeight;
    priorScroll.current = { first, last, height: area.scrollHeight, top: area.scrollTop };
  }, [messages.items, currentLive?.checkpoint]);
  useEffect(() => {
    const area = messageScroll.current; if (!area) return;
    const observer = new ResizeObserver(() => { if (followBottom.current) area.scrollTop = area.scrollHeight; });
    observer.observe(area); if (area.firstElementChild) observer.observe(area.firstElementChild);
    return () => observer.disconnect();
  }, []);
  const showSources = (runId?: string) => { setSourceRun(runId || null); setPanel('sources'); };

  return <div className={styles.branchWorkspace}>
    <nav className={styles.drawerTabs} aria-label="对话辅助面板">
      <button className={styles.pill} aria-haspopup="dialog" onClick={() => setSummaryOpen(true)}>☷ <span>会话纪要</span></button>
      <button className={styles.pill} aria-haspopup="dialog" onClick={() => setPanel('history')}>↳ <span>输入历史</span></button>
      <button className={styles.pill} aria-haspopup="dialog" onClick={() => showSources()}>▤ <span>资料来源</span></button>

      {!status.executionAvailable ? <button className={styles.pill} onClick={() => setPanel('tools')}>图片存储与说明</button> : null}
    </nav>
    {error ? <div role="alert" className={`${styles.notice} ${styles.error}`}>{error}<button className={styles.small} onClick={() => { setError(''); reload(); }}>重新读取</button></div> : null}
    {notice ? <p role="status" className={styles.notice}>{notice}<button className={styles.small} onClick={() => setNotice('')} aria-label="收起提示">×</button></p> : null}
    <section ref={messageScroll} data-page-scroll tabIndex={0} aria-label="对话历史" className={styles.messages} onScroll={event => { const area = event.currentTarget; followBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80; priorScroll.current = { ...priorScroll.current, height: area.scrollHeight, top: area.scrollTop }; }}>
      <div className={styles.messageColumn}>
      <LoadMore page={messages} label="加载更早消息" />
      {messages.error ? <StatePanel compact kind="error" title="历史暂未读取成功" description="这不表示会话为空，已保存的消息和图片尚未核对。" actionLabel="重新读取历史" onAction={messages.retry} /> : messages.loading && !messages.items.length ? <LoadingSection label="正在读取历史" onRetry={messages.retry}><SkeletonRows lines={5} /></LoadingSection> : !messages.items.length ? <EmptyConversation /> : null}
      {messages.items.map(message => <article className={styles.message} data-role={message.role} data-testid="assistant-message" data-message-id={message.id} key={message.id}>
        <header><strong>{message.role === 'USER' ? '我' : '国画助手'}</strong><span>{stateLabel(message.state)} · {assistantDate(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></header>
        {message.role === 'ASSISTANT' ? <AssistantMarkdown>{message.body}</AssistantMarkdown> : <p className={styles.body}>{message.body}</p>}
        {message.attachmentIds.map(image => <PrivateAttachment key={image} id={image} />)}
        <div className={styles.messageActions}>{message.role === 'USER' && status.executionAvailable ? <button disabled={busy || !!running} onClick={() => { setEditing(message); setEditText(message.body); }}>编辑为新分支</button> : null}{speech.readable && message.body ? <button onClick={() => speech.read(message.body)}>朗读消息</button> : null}{message.runId && message.role === 'ASSISTANT' ? <button onClick={() => showSources(message.runId!)}>查看本条来源</button> : null}</div>
        {message.runId && message.role === 'ASSISTANT' && status.executionAvailable ? <RunDetails key={`${message.runId}:${revision}`} id={message.runId} known={runs.items.find(run => run.id === message.runId)} access={access} choose={choose} retry={retry} disabled={busy || !!pendingChat || !model || !generationAvailable} /> : null}
      </article>)}
      {currentLive && !messages.items.some(message => message.role === 'ASSISTANT' && message.runId === currentLive.id) ? <article className={styles.message} data-testid="assistant-live"><header><strong>{currentLive.kind === 'SUMMARY' ? '摘要' : '国画助手'}</strong><span role="status" data-testid="run-status">{stateLabel(currentLive.status)}</span></header><AssistantMarkdown>{currentLive.checkpoint || '请求已保存，等待回复…'}</AssistantMarkdown><p className={styles.meta} role="status">{connection}</p>{currentLive.executionUncertain ? <p>已保存部分内容；上游结果不确定，不会自动重新收费执行。</p> : null}</article> : null}
      </div>
    </section>
    {status.executionAvailable ? <form className={styles.composer} onSubmit={event => void submit(event)} aria-label="发送消息">
      <div className={styles.composerStatus} aria-label="附件与发送状态">{!generationReady ? <span className={styles.meta}>生成能力尚未确认，草稿保留。</span> : null}      {draft.loading ? <LoadingStatus label="正在核对待发送图片" /> : null}
      {draft.error ? <p role="alert" className={styles.error}>{draft.error}<button type="button" className={styles.small} onClick={() => void draft.refresh()}>核对上传状态</button></p> : null}
      {draft.notice ? <p role="status">{draft.notice}</p> : null}
      {draft.pending.map(item => <p key={item.scope} role="status">{item.state === 'uploading' ? '上次上传仍未完成。可核对状态，或明确移除后重新选择图片。' : '上次图片尚未获服务器确认。请重新选择原文件；若文件从未被接受，刷新后无法恢复本地字节。'}<button type="button" className={styles.small} disabled={busy || draft.loading} onClick={() => void draft.refresh()}>核对上传状态</button>{item.id ? <button type="button" className={styles.small} disabled={busy} onClick={() => void act(() => draft.remove(item.id!, item.scope))}>移除未完成上传</button> : null}</p>)}

      {attachments.map(image => <div className={styles.draftImage} key={image.id}><PrivateAttachment id={image.id} />{image.draftExpiresAt ? <small className={styles.meta}>未发送草稿有效期至 {assistantDate(image.draftExpiresAt).toLocaleString('zh-CN')}</small> : null}<button type="button" className={styles.small} disabled={busy || draft.loading} onClick={() => void act(() => draft.remove(image.id))}>移除待发送图片</button></div>)}
      {draft.hasMore ? <button type="button" className="button" disabled={draft.loading} onClick={() => void draft.more()}>加载更多待发送图片</button> : null}
      {attachments.length > 4 || draft.hasMore ? <p role="alert">当前会话有超过四张待发送图片。请读取并移除多余图片后再发送；不会静默遗漏或自动删除。</p> : null}
      {attachments.length && !selectedModel?.capabilities.images ? <p role="alert">所选模型不支持图片，请明确选择支持图片的模型；不会丢弃图片或自动切换模型。</p> : null}
      {editedHead ? <div className={styles.notice}>编辑已保存为新分支；原分支保留。<button type="button" className="button" disabled={busy || !!pendingChat || !model || !generationAvailable} onClick={() => void executeEdit()}>生成编辑后的回复</button></div> : null}
</div>
      {selectedArtworks.length ? <button type="button" className={styles.selectionChip} onClick={() => setPanel('artworks')}>已选 {selectedArtworks.length} 幅平台作品 · 查看 / 调整</button> : null}
      <div className={styles.inputRow}><textarea ref={textareaRef} aria-label="消息" rows={1} value={text} maxLength={32000} placeholder="聊聊你的画题…" onChange={event => setText(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); void submit(); } }} />
      {running ? <button type="button" className={styles.sendButton} disabled={busy} onClick={() => void cancel(pendingChat || running)} aria-label="取消生成">停止</button> : <button type="submit" className={styles.sendButton} disabled={busy || !generationAvailable || !model || !branch || messages.loading || !!messages.error || draft.loading || !!draft.error || draft.hasMore || attachments.length > 4 || (!text.trim() && !attachments.length) || (!!attachments.length && !selectedModel?.capabilities.images)} aria-label="发送消息">发送 <span aria-hidden>↑</span></button>}
      </div>
      <div className={styles.composerActions}>
        <AssistantModelPicker registry={registry} value={model} onChange={setModel} disabled={busy || !generationReady} />
        <div className={styles.inputTools}>
          <button type="button" className={styles.small} onClick={() => setPanel('artworks')} aria-haspopup="dialog">平台作品</button>
          <button type="button" className={`${styles.small} ${styles.retrievalToggle}`} aria-label="联网搜索" aria-pressed={webSearch} disabled={!onlineSearchAvailable || busy || !!pendingChat} title={onlineSearchAvailable ? '为下一条消息启用联网搜索' : '联网搜索尚未配置'} onClick={() => setWebSearch(value => !value)}>{webSearch ? '✓ ' : ''}联网搜索</button>
          <button type="button" className={`${styles.small} ${styles.retrievalToggle}`} aria-label="知识库检索" aria-pressed={ragflow} disabled={!knowledgeSearchAvailable || busy || !!pendingChat} title={knowledgeSearchAvailable ? '为下一条消息启用知识库检索' : '知识库接口已预留，RAGFlow 尚未配置'} onClick={() => setRagflow(value => !value)}>{ragflow ? '✓ ' : ''}知识库检索</button>
          <label className={styles.uploadButton}>＋ 图片<input type="file" aria-label="添加图片" accept="image/jpeg,image/png" disabled={busy || !generationReady || draft.loading || attachments.length >= 4 || draft.hasMore || !!pendingChat} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }} /></label>
          {speech.supported ? <button type="button" className={styles.small} onClick={speech.listen}>{speech.listening ? '停止语音' : '语音输入'}</button> : null}
          {speech.speaking ? <button type="button" className={styles.small} onClick={speech.stop}>停止朗读</button> : null}
          <button type="button" className={styles.small} onClick={() => setPanel('tools')} aria-haspopup="dialog" aria-label="更多工具与恢复">•••</button>
        </div>
      </div>
    </form> : null}
    {summaryOpen ? <AssistantPanel title="会话纪要" eyebrow="CONVERSATION SUMMARY" close={() => setSummaryOpen(false)} footer={status.executionAvailable ? <><button className="button" disabled={busy || !!running || !generationAvailable} onClick={() => void summary()}>生成新纪要</button><button className="button" disabled={!summaries.items.some(item => item.body)} onClick={() => { void Promise.resolve().then(() => navigator.clipboard.writeText(summaries.items.map(item => item.body).filter(Boolean).join('\n\n---\n\n'))).then(() => setCopyStatus('已复制载入的纪要。')).catch(() => setCopyStatus('复制失败，请选择纪要文字手动复制。')); }}>复制已载入纪要</button><small>生成新纪要会调用模型；自动摘要默认关闭。</small></> : undefined}>
      {copyStatus ? <p role="status">{copyStatus}</p> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}{status.executionAvailable ? <><p className={styles.meta}>这里是当前分支已保存的纪要。打开面板只读取记录，不会调用模型。</p><div className={styles.summaryRecords}>{summaries.items.map(item => <article key={item.id}><strong>{stateLabel(item.status)}{item.stale ? ' · 历史摘要（已过时）' : ''}</strong><AssistantMarkdown>{item.body || '暂无已保存摘要内容'}</AssistantMarkdown><span className={styles.meta}>模型 {item.model_id} · 摘要独立记录调用与用量</span></article>)}{!summaries.error && !summaries.loading && !summaries.items.length ? <p>当前分支暂无摘要。</p> : null}{summaries.loading ? <LoadingSection label="正在读取已保存摘要" onRetry={summaries.retry}><SkeletonRows /></LoadingSection> : null}<LoadMore page={summaries} label="更多摘要" /></div><details className={styles.summaryPolicy}><summary>自动摘要与调用说明</summary><p>摘要继承本分支最近成功对话的模型。同一上下文会去重。</p><label className={styles.inline}><input type="checkbox" checked={session.summaryAutoEnabled} disabled={busy || !status.automaticSummaryAvailable || !generationAvailable} onChange={event => void act(() => onAuto(event.target.checked))} />自动摘要</label><p className={styles.meta}>{status.automaticSummaryAvailable ? `新增 ${status.summaryTurnThreshold} 轮、空闲 ${status.summaryIdleSeconds} 秒，每小时最多 ${status.maxSummaryPerHour} 次；仅此会话主动开启后生效。` : '服务器未开放自动摘要；会话设置不会绕过全局限制。'}</p></details></> : <p>当前为历史模式，摘要读取接口暂不可用；未发起生成。</p>}
    </AssistantPanel> : null}
    {panel === 'history' ? <AssistantPanel title="输入历史" eyebrow="INPUT HISTORY" close={() => setPanel(null)}>
      <p className={styles.meta}>当前分支 · 已载入 {messages.items.filter(message => message.role === 'USER').length} 条用户输入{messages.hasMore ? ' · 更早记录尚未载入' : ''}。编辑会保留原分支。</p>
      {messages.loading ? <LoadingSection label="正在读取历史" onRetry={messages.retry}><SkeletonRows lines={5} /></LoadingSection> : null}<LoadMore page={messages} label="加载更早输入记录" />
      {!messages.loading && !messages.error && !messages.items.some(message => message.role === 'USER') ? <p>已载入的记录中暂无用户输入。</p> : null}
      {messages.items.filter(message => message.role === 'USER').map(message => <article key={message.id} className={styles.historyCard} data-message-id={message.id}><time>{assistantDate(message.createdAt).toLocaleString('zh-CN')}</time><p className={styles.body}>{message.body || '图片输入'}</p>{message.attachmentIds.map(image => <PrivateAttachment key={image} id={image} />)}<button className={styles.small} onClick={() => { setPanel(null); requestAnimationFrame(() => { const node = document.querySelector(`[data-testid="assistant-message"][data-message-id="${message.id}"]`) as HTMLElement | null; if (node) { node.tabIndex = -1; node.focus({ preventScroll: true }); node.scrollIntoView({ block: 'center' }); } }); }}>定位原消息</button></article>)}
    </AssistantPanel> : null}
    {panel === 'sources' ? <AssistantPanel title="资料来源" eyebrow="SOURCES & REFERENCES" close={() => setPanel(null)}>
      <p className={styles.meta}>按对话轮次查看已保存的平台作品、知识库、文献与联网检索结果。</p>
      {messages.loading ? <p role="status">正在读取回复记录…</p> : null}<LoadMore page={messages} label="加载更早回复与来源" />
      {!messages.loading && !messages.error && !messages.items.some(message => message.role === 'ASSISTANT' && message.runId) ? <p>已载入的记录中暂无可关联的回复执行。</p> : null}
      {sourceRows.map(row => <SourceRecord key={row.message.id} {...row} access={access} expanded={sourceRun === row.message.runId} onToggle={open => setSourceRun(open ? row.message.runId : null)} available={status.executionAvailable} />)}
    </AssistantPanel> : null}
    {panel === 'artworks' ? <AssistantPanel title="平台作品参考" eyebrow="ARTWORKS" close={() => setPanel(null)}><ArtworkSelection selected={selectedArtworks} onChange={setSelectedArtworks} disabled={busy || !!pendingChat} /></AssistantPanel> : null}
    {panel === 'tools' ? <AssistantPanel title="工具与恢复" eyebrow="TOOLS & STORAGE" close={() => setPanel(null)}>
      <p>Enter 发送，Shift + Enter 换行。语音转写先进入输入框，由你编辑确认；浏览器可能使用在线语音服务。{!speech.supported ? '当前浏览器不支持语音输入。' : ''}图片仅支持 JPEG／PNG，最多 4 张。离开页面不会取消已受理的生成。</p>
      <AssistantStorage access={access} revision={revision + draft.storageRevision} />
            <details className={`glass-panel ${styles.tools}`} open={timelineOpen} onToggle={event => setTimelineOpen(event.currentTarget.open)}><summary>创作记录</summary><p>仅记录助手中的交流；阶段分类不代表平台工作坊或现实创作行为。</p>{timeline.loading ? <p role="status">正在读取创作记录…</p> : null}<LoadMore page={timeline} label="加载更早记录" />{timeline.items.map(row => <article key={row.messageId}><span className={styles.meta}>{assistantDate(row.createdAt).toLocaleString('zh-CN')} · {row.role === 'USER' ? '我' : '助手'} · {stateLabel(row.state)}</span><p className={styles.body}>{row.body}</p><label>阶段分类<select aria-label={`阶段分类 ${row.messageId}`} value={row.classification || ''} disabled={busy} onChange={event => void classify(row, event.target.value)}><option value="" disabled>未分类</option>{stageLabels.map(label => <option key={label}>{label}</option>)}</select></label><small>来源：{row.classificationSource === 'USER' ? '用户分类' : '规则分类'} · 版本 {row.classificationVersion}</small></article>)}{!timeline.error && !timeline.loading && !timeline.items.length ? <p>当前分支暂无创作记录。</p> : null}</details>
      <details className={`glass-panel ${styles.tools}`}><summary>执行状态与恢复</summary><p>刷新与重连只读取同一任务。结果不确定时不会自动重新执行；明确重试使用该执行的原模型与配置，是新的尝试；上一次仍可能产生费用。</p>{runs.items.map(run => <article key={run.id}><p>{run.kind} · {stateLabel(run.status)} · 尝试 {run.attempt} · {run.modelKey}</p>{run.errorCode ? <p>{run.errorCode}</p> : null}{['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(run.status) ? <button className="button" disabled={busy || !!running || !generationAvailable} onClick={() => void retry(run)}>明确重试</button> : null}</article>)}<LoadMore page={runs} label="更多执行记录" /></details>

    </AssistantPanel> : null}
    {editing ? <Dialog title="编辑消息并保留原分支" close={() => setEditing(null)}><form onSubmit={event => void saveEdit(event)}>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<label>新的消息内容<textarea autoFocus aria-label="新的消息内容" required value={editText} maxLength={32000} onChange={event => setEditText(event.target.value)} /></label><p>保存只创建历史分支，不自动生成回复。</p><footer><button type="button" className="button" onClick={() => setEditing(null)}>返回</button><button className="button button-primary" disabled={busy}>保存为新分支</button></footer></form></Dialog> : null}
  </div>;
}

function SourceRecord({ message, question, turn, access, expanded, onToggle, available }: { message: Message; question: string; turn: number; access: Access; expanded: boolean; onToggle: (value: boolean) => void; available: boolean }) {
  return <section className={styles.sourceCard} data-source-run={message.runId}>
    <button className={styles.sourceHeading} aria-expanded={expanded} onClick={() => onToggle(!expanded)}><span><small>第 {turn} 轮 · {assistantDate(message.createdAt).toLocaleString('zh-CN')}</small><strong>{question.slice(0, 72)}</strong></span><span className={styles.sourceCount} aria-label={expanded ? '收起来源' : '展开来源'}>{expanded ? '−' : '＋'}</span></button>
    {expanded ? available ? <SourceDetails key={message.runId} message={message} access={access} /> : <p>当前为历史模式，来源读取接口暂不可用，不能据此判断没有来源。</p> : null}
  </section>;
}
function SourceDetails({ message, access }: { message: Message; access: Access }) {
  const [data, setData] = useState<{ run: Run; citations: Citation[] } | null>(null);
  const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const { request } = access;
  useEffect(() => {
    let alive = true; setError(''); setData(null);
    void request(async (token, signal) => {
      const [run, citations] = await Promise.all([assistantRequest<Run>(`/runs/${enc(message.runId!)}`, token, signal), assistantRequest<Citation[]>(`/runs/${enc(message.runId!)}/citations`, token, signal)]);
      assertAssistantSources({ runId: message.runId, sessionId: message.sessionId }, run, citations);
      return { run, citations };
    }).then(value => { if (alive) setData(value); }).catch(error => { if (alive && !isAbortError(error)) setError(error instanceof Error ? error.message : '来源读取失败'); });
    return () => { alive = false; };
  }, [message.runId, message.sessionId, request, revision]);
  if (error) return <p role="alert">{error}<button className={styles.small} onClick={() => setRevision(value => value + 1)}>重新读取本条来源</button></p>;
  if (!data) return <LoadingSection label="正在读取本条回复的来源" onRetry={() => setRevision(value => value + 1)}><SkeletonRows lines={5} /></LoadingSection>;
  const artworks = data.citations.filter(citation => citation.sourceType === 'PLATFORM_ARTWORK');
  const knowledge = data.citations.filter(citation => citation.sourceType === 'RAGFLOW_DOCUMENT');
  const web = data.citations.filter(citation => citation.sourceType === 'WEB_RESULT');
  return <div className={styles.sourceBody}>
    {artworks.length ? <SourceGroup title="平台作品" subtitle="来自 ArtLIVE 公开作品库" citations={artworks} empty="本次未使用平台作品" /> : null}
    <SourceGroup title="知识库结果" subtitle="来自项目知识库" citations={knowledge} empty="本次检索暂无知识库结果" />
    <SourceGroup title="文献结果" subtitle="来自文献库" citations={[]} empty="本次检索暂无文献结果" />
    <SourceGroup title="网络结果" subtitle="联网检索结果" citations={web} empty="本次检索暂无网络结果" />
  </div>;
}

function SourceGroup({ title, subtitle, citations, empty }: { title: string; subtitle: string; citations: Citation[]; empty: string }) {
  const [page, setPage] = useState(0); const pageSize = 4; const pageCount = Math.max(1, Math.ceil(citations.length / pageSize)); const current = Math.min(page, pageCount - 1);
  const visible = citations.slice(current * pageSize, (current + 1) * pageSize);
  return <section className={styles.sourceGroup} data-testid={`source-group-${title}`}><header><span><h3>{title}</h3><small>{subtitle}</small></span><b>共 {citations.length} 项结果</b></header>
    <div className={styles.sourceResults}>{visible.length ? visible.map(citation => <CitationView key={citation.id} citation={citation} />) : <p className={styles.sourceEmpty}>{empty}</p>}</div>
    <footer><button type="button" className={styles.small} disabled={current === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>上一页</button><span>{current + 1} / {pageCount}</span><button type="button" className={styles.small} disabled={current + 1 >= pageCount} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))}>下一页</button></footer>
  </section>;
}

function RunDetails({ id, known, access, choose, retry, disabled }: { id: string; known?: Run; access: Access; choose: (run: Run, card: string, option: string) => Promise<void>; retry: (run: Run) => Promise<void>; disabled: boolean }) {
  const [data, setData] = useState<{ run: Run; choices: Choice[] } | null>(null); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0); const { request, report } = access;
  useEffect(() => { let alive = true; void request(async (token, signal) => { const [run, choices] = await Promise.all([known ? Promise.resolve(known) : assistantRequest<Run>(`/runs/${enc(id)}`, token, signal), assistantRequest<Choice[]>(`/runs/${enc(id)}/choices`, token, signal)]); return { run, choices }; }).then(value => { if (alive) setData(value); }).catch(error => { if (alive && !isAbortError(error)) { setError('执行记录或选择卡未能读取。'); report(error); } }); return () => { alive = false; }; }, [id, known, request, report, attempt]);
  if (error) return <p>{error}<button className={styles.small} onClick={() => { setError(''); setAttempt(value => value + 1); }}>重新读取执行记录</button></p>;
  if (!data) return <LoadingStatus label="正在读取执行记录" />;
  return <>
    <p className={styles.meta}>模型 {data.run.modelKey} · 尝试 {data.run.attempt}</p>
    {artworkRunFailureNotice(data.run.errorCode) ? <p className={styles.notice} role="alert">{artworkRunFailureNotice(data.run.errorCode)}</p> : null}
    {data.choices.map(card => <section key={card.id} className={styles.choices} data-testid="choice-card"><h4>{card.title}</h4><p className={styles.meta}>选择卡使用当前模型继续对话，不附加输入框中的图片或重新检索。</p><div className={styles.inline}>{card.options.map(option => <button key={option.id} className="button" disabled={disabled} onClick={() => void choose(data.run, card.id, option.id)}>{option.label}</button>)}</div></section>)}
    {['FAILED', 'INTERRUPTED', 'CANCELLED'].includes(data.run.status) ? <div className={styles.notice}><p>{stateLabel(data.run.status)}。已保存的部分回复仍保留；明确重试使用原模型，可能产生新的费用。</p><button className="button" disabled={disabled} onClick={() => void retry(data.run)}>明确重试</button></div> : null}
  </>;
}
function CitationView({ citation }: { citation: Citation }) {
  const artworkId = citation.provenance.artworkId;
  const deliveryObserved = citation.provenance.deliveryEvidence === 'MODEL_STREAM_OBSERVED';
  const safeArtwork = citation.sourceType === 'PLATFORM_ARTWORK' && typeof artworkId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artworkId);
  const fields = citation.sourceType === 'PLATFORM_ARTWORK' ? platformCitationFields(citation.excerpt) : null;
  const title = typeof citation.provenance.title === 'string' ? citation.provenance.title : fields?.find(field => field.label === '作品名')?.value;
  const url = typeof citation.provenance.url === 'string' ? assistantMarkdownLink(citation.provenance.url) : null;
  return <article className={styles.citation}><header><strong>{title || (citation.sourceType === 'PLATFORM_ARTWORK' ? '平台作品' : citation.sourceType === 'WEB_RESULT' ? '网络资料' : '知识库资料')}</strong>{url ? <a href={url} target="_blank" rel="noopener noreferrer nofollow">在线阅读 ↗</a> : null}</header>
    {fields?.length ? fields.map((field, index) => <p key={index}>{field.label}：{field.value} <small>（{field.uncertainty || '未独立核验'}）{field.raw ? `原始文本：${field.raw}` : ''}</small></p>) : <p className={styles.body}>{citation.excerpt}</p>}
    {safeArtwork ? <Link href={`/gallery/${artworkId}`}>查看当前受控作品详情</Link> : null}
    {deliveryObserved ? <small>已用于本轮回复</small> : null}
  </article>;
}

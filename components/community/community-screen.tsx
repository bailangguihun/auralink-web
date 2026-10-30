"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingSection, LoadingStatus, PendingIndicator, SkeletonRows } from "@/components/loading";
import { useReadResource } from "@/components/use-read-resource";
import { useSession } from "@/components/session-provider";
import { StatePanel } from "@/components/state-panel";
import { api, ApiError, errorMessage } from "@/lib/api";
import { readCache } from "@/lib/read-cache";
import { communityApi, definiteWriteFailure, operationStorageKey, readOperation,
  type CommunityPost, type GalleryReference, type OperationHandle, type OperationResult } from "@/lib/community";
import { CommunityLoading } from "./community-loading";
import "./community.css";

type Write = (path: string, method: string, body: object, kind: string) => Promise<OperationResult | null>;
function Reference({ value }: { value: GalleryReference }) {
  if (value.state !== "AVAILABLE") return <div className="community-reference">
    <span>引用的画廊作品</span><p>{value.state === "UNAVAILABLE" ? "原作已不可查看，引用关系保留。" : "暂时无法核实原作，请稍后重新读取。"}</p>
  </div>;
  return <div className="community-reference"><span>画廊原作</span>
    <Link href={"/gallery/" + value.paintingId}>{value.title || "无题"}</Link>
    <p>{[value.authorName, value.period].filter(Boolean).join(" · ") || "作者资料暂缺"}</p>
  </div>;
}
function PostCard({ post, detail, busy, write }: { post: CommunityPost; detail?: boolean; busy: boolean; write: Write }) {
  return <article className="community-card glass-panel content-reveal" data-testid="community-post">
    <header className="community-author"><span aria-hidden="true" className="community-avatar">{post.author.displayName.slice(0, 1)}</span>
      <div><strong>{post.author.displayName}</strong><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString("zh-CN")}</time></div>
    </header>
    <p className="community-content">{post.content}</p>
    {post.galleryReference ? <Reference value={post.galleryReference} /> : null}
    <footer className="community-actions">
      <button className="text-button" type="button" aria-pressed={post.liked} disabled={busy}
        onClick={() => void write("/posts/" + post.id + "/like", "PUT", { enabled: !post.liked }, "like")}>{post.liked ? "已赞" : "赞"} · {post.likeCount}</button>
      <button className="text-button" type="button" aria-pressed={post.favorited} disabled={busy}
        onClick={() => void write("/posts/" + post.id + "/favorite", "PUT", { enabled: !post.favorited }, "favorite")}>{post.favorited ? "已收藏" : "收藏帖子"}</button>
      {detail ? <span>{post.commentCount} 条评论</span> : <Link className="text-button" href={"/community/posts/" + post.id}>评论 · {post.commentCount}</Link>}
    </footer>
  </article>;
}
function GalleryPicker({ onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void }) {
  const { token } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const loader = useCallback((signal: AbortSignal) => api.paintings({ keyword: query, page, size: 6 }, token!, signal), [token, page, query]);
  const read = useReadResource("community-gallery:" + query + ":" + page, loader, Boolean(token));
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previouslyFocused?.focus();
  }, []);
  return <dialog ref={dialog} className="community-picker" aria-labelledby="community-picker-title" onCancel={onClose}>
    <header><h2 id="community-picker-title">选择画廊国画</h2><button type="button" className="text-button" onClick={onClose}>关闭</button></header>
    <form className="community-search" onSubmit={event => { event.preventDefault(); setQuery(input.trim()); setPage(0); }}>
      <label htmlFor="community-gallery-query">作品或作者</label>
      <div><input id="community-gallery-query" value={input} onChange={e => setInput(e.target.value)} maxLength={100} /><button className="button" type="submit">搜索</button></div>
    </form>
    {read.error ? <StatePanel compact kind="error" title="画廊读取失败" description={read.error} actionLabel="重新读取画廊" onAction={read.retry} /> : null}
    {read.loading ? <LoadingSection label="正在读取画廊"><SkeletonRows lines={5} /></LoadingSection> : null}
    {!read.loading && read.data ? <div className="community-painting-list">
      {read.data.items.length ? read.data.items.map(painting => <button className="community-painting-choice" type="button"
        key={painting.paintingId} disabled={!painting.imageAvailable} onClick={() => onSelect(painting.paintingId)}>
        <strong>{painting.title || "无题"}</strong><span>{painting.authorName || "作者待考"}{!painting.imageAvailable ? " · 图片不可用" : ""}</span>
      </button>) : <p>没有找到符合条件的画作。</p>}
    </div> : null}
    <nav className="pagination" aria-label="选画分页">
      <button type="button" className="button" disabled={!page || read.loading} onClick={() => setPage(p => p - 1)}>上一页</button>
      <span>第 {page + 1} 页</span><button type="button" className="button" disabled={read.loading || !read.data?.hasNext} onClick={() => setPage(p => p + 1)}>下一页</button>
    </nav>
  </dialog>;
}
function Comments({ postId, token, revision, completedComment, busy, write }: { postId: string; token: string; revision: number; completedComment: string | null; busy: boolean; write: Write }) {
  const [page, setPage] = useState(0), [draft, setDraft] = useState("");
  useEffect(() => { if (completedComment) setDraft(""); }, [completedComment]);
  const loader = useCallback((signal: AbortSignal) => { void revision; return communityApi.comments(token, postId, page, signal); }, [token, postId, page, revision]);
  const read = useReadResource("community-comments:" + postId + ":" + page, loader);
  return <section className="community-card glass-panel" aria-labelledby="community-comments-title">
    <h2 id="community-comments-title">一起聊聊</h2>
    <form onSubmit={async event => { event.preventDefault(); const result = await write("/posts/" + postId + "/comments", "POST", { content: draft }, "comment"); if (result) setDraft(""); }}>
      <label htmlFor="community-comment">写下评论</label><textarea id="community-comment" maxLength={1000} rows={3} value={draft} onChange={e => setDraft(e.target.value)} disabled={busy} />
      <button className="button button-primary" disabled={busy || !draft.trim()} type="submit">发表评论</button>
    </form>
    {read.error ? <StatePanel compact kind="error" title="评论读取失败" description={read.error} actionLabel="重新读取评论" onAction={read.retry} /> : null}
    {read.loading ? <LoadingStatus label="正在读取评论" /> : null}
    {read.data?.items.map(comment => <article className="community-comment" key={comment.id}><strong>{comment.author.displayName}</strong>
      <p className="community-content">{comment.content}</p><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("zh-CN")}</time></article>)}
    {!read.loading && !read.error && read.data?.items.length === 0 ? <p className="community-muted">还没有评论，分享你的第一眼感受吧。</p> : null}
    <nav className="pagination" aria-label="评论分页"><button className="button" type="button" disabled={busy || !page || read.loading} onClick={() => setPage(p => p - 1)}>上一页</button>
      <span>第 {page + 1} 页</span><button className="button" type="button" disabled={busy || read.loading || !read.data?.hasNext} onClick={() => setPage(p => p + 1)}>下一页</button></nav>
  </section>;
}

export function CommunityScreen({ postId, initialPaintingId = null }: { postId?: string; initialPaintingId?: string | null }) {
  const { token, user, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const router = useRouter();
  const [draft, setDraft] = useState(""), [sourceId, setSourceId] = useState(initialPaintingId), [picker, setPicker] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(Boolean(initialPaintingId));
  const [view, setView] = useState("all"), [page, setPage] = useState(0), [revision, setRevision] = useState(0);
  const [message, setMessage] = useState(""), [pending, setPending] = useState<OperationHandle | null>(null), [sending, setSending] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [lastResult, setLastResult] = useState<OperationResult | null>(null);
  const activeOperation = useRef<OperationHandle | null>(null);
  const lock = useRef(false), mounted = useRef(true);
  const actorId = String(user?.id || ""), storageKey = operationStorageKey(actorId);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    try {
      const saved = readOperation(sessionStorage.getItem(storageKey), actorId);
      activeOperation.current = saved; setPending(saved); lock.current = Boolean(saved); setStorageReady(true);
    } catch (error) { setMessage(errorMessage(error)); setStorageReady(false); }
  }, [actorId, storageKey]);
  const capabilityLoader = useCallback((signal: AbortSignal) => communityApi.capabilities(token!, signal), [token]);
  const capability = useReadResource("community-capabilities", capabilityLoader, Boolean(token));
  const enabled = capability.data?.posts === true && capability.data.actor.id === actorId && !capability.loading && !capability.error;
  const listLoader = useCallback((signal: AbortSignal) => { void revision; return communityApi.posts(token!, page, view, signal); }, [token, page, view, revision]);
  const list = useReadResource("community-posts:" + view + ":" + page, listLoader, enabled && !postId, 30_000);
  const detailLoader = useCallback((signal: AbortSignal) => { void revision; return communityApi.post(token!, postId!, signal); }, [token, postId, revision]);
  const detail = useReadResource("community-post:" + postId, detailLoader, enabled && Boolean(postId), 30_000);
  const referenceLoader = useCallback((signal: AbortSignal) => communityApi.reference(token!, sourceId!, signal), [token, sourceId]);
  const reference = useReadResource("community-reference:" + sourceId, referenceLoader, enabled && Boolean(sourceId) && !postId);
  const busy = !enabled || !storageReady || Boolean(pending) || sending;
  const committed = useCallback((handle: OperationHandle, result: OperationResult) => {
    if (activeOperation.current?.requestId !== handle.requestId) return;
    if (result.kind !== handle.kind) throw new Error("操作返回身份不一致，请保留记录并继续核对。");
    readCache.invalidate(sessionIdentity.generation, "community-post");
    sessionStorage.removeItem(storageKey);
    activeOperation.current = null; setLastResult(result);
    lock.current = false; setPending(null); setSending(false);
    setRevision(value => value + 1); setMessage("操作已保存。");
    if (handle.kind === "post") { setDraft(""); setSourceId(null); router.push("/community/posts/" + result.postId); }
  }, [router, sessionIdentity.generation, storageKey]);
  const check = useCallback(async () => {
    if (!pending || !token || sending) return;
    const identity = sessionIdentity;
    try {
      const outcome = await communityApi.outcome(token, pending.requestId);
      if (!mounted.current || !isCurrentSession(identity) || activeOperation.current?.requestId !== pending.requestId) return;
      if (outcome.state === "COMMITTED" && outcome.result) committed(pending, outcome.result);
      else setMessage("暂未查到已提交记录，结果仍待确认。请稍后再核对，不要重复发布。");
    } catch (error) {
      if (!mounted.current || !isCurrentSession(identity) || activeOperation.current?.requestId !== pending.requestId) return;
      setMessage(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) signOutIfCurrent(identity);
    }
  }, [pending, token, sending, sessionIdentity, isCurrentSession, signOutIfCurrent, committed]);
  // Reload recovery reads the operation journal; never replay a saved command.
  useEffect(() => { if (pending && !sending) void check(); }, [pending, sending, check]);
  const write: Write = async (path, method, payload, kind) => {
    if (!token || busy || lock.current) return null;
    const identity = sessionIdentity;
    const handle = { requestId: crypto.randomUUID(), actorId, kind };
    lock.current = true;
    try { sessionStorage.setItem(storageKey, JSON.stringify(handle)); }
    catch { lock.current = false; setMessage("浏览器无法保存本次操作标识，请检查存储权限后再提交。"); return null; }
    activeOperation.current = handle; setPending(handle); setSending(true); setMessage("");
    // A pending or ambiguous write must not leave reusable pre-write snapshots.
    readCache.invalidate(identity.generation, "community-post");
    try {
      const outcome = await communityApi.write(token, path, method, { ...payload, requestId: handle.requestId });
      if (!mounted.current || !isCurrentSession(identity) || activeOperation.current?.requestId !== handle.requestId) return null;
      if (!outcome.result || outcome.state !== "COMMITTED") throw new Error("操作结果尚未确认。");
      committed(handle, outcome.result); return outcome.result;
    } catch (error) {
      if (!mounted.current || !isCurrentSession(identity) || activeOperation.current?.requestId !== handle.requestId) return null;
      setSending(false);
      if (definiteWriteFailure(error)) {
        sessionStorage.removeItem(storageKey); activeOperation.current = null; lock.current = false; setPending(null);
        if (error instanceof ApiError && error.status === 401) signOutIfCurrent(identity);
      }
      setMessage(errorMessage(error)); return null;
    } finally {
      // A newer visit may have cached a read while this old page's write settled.
      if (!mounted.current && isCurrentSession(identity)) readCache.invalidate(identity.generation, "community-post");
    }
  };
  return <>
    {postId ? <header className="community-heading"><span className="knowledge-eyebrow">ARTLIVE · COMMUNITY</span><h1>画里相逢</h1><p>分享一幅画，也分享你看见的世界。</p></header> : null}
    {message ? <p role="status" className="community-notice">{message}</p> : null}
    {pending ? <div className="community-notice">{sending ? <span><PendingIndicator />正在提交，请稍候。</span> :
      <><span>有一项操作需要核对结果。</span><button className="text-button" type="button" onClick={() => void check()}>核对操作结果</button></>}</div> : null}
    {capability.loading ? <CommunityLoading /> : capability.error ? <StatePanel kind="unavailable" title="社区暂时不可用" description={capability.error} actionLabel="重新连接社区" onAction={capability.retry} /> : !enabled ?
      <StatePanel kind="unavailable" title="社区暂未开放" description="暂时无法确认当前账号的社区访问能力。" /> : postId ?
      <div className="community-detail"><Link className="text-button" href="/community">← 返回社区</Link>
        {detail.error ? <StatePanel kind="error" title="帖子读取失败" description={detail.error} actionLabel="重新读取帖子" onAction={detail.retry} /> : null}
        {detail.loading && !detail.data ? <CommunityLoading /> : detail.data ? <><PostCard post={detail.data} detail busy={busy} write={write} />
          <Comments key={postId} postId={postId} token={token!} revision={revision}
            completedComment={lastResult?.kind === "comment" && lastResult.postId === postId ? lastResult.commentId || null : null} busy={busy} write={write} /></> : null}
      </div> :
      <div className="community-layout"><aside className={"community-composer glass-panel" + (composerExpanded ? " is-expanded" : "")}>
        <span className="knowledge-eyebrow">落笔分享</span><div className="community-compose-heading"><h2>写下此刻所见</h2>
          <button className="text-button community-compose-toggle" type="button" aria-expanded={composerExpanded} aria-controls="community-compose-form"
            onClick={() => setComposerExpanded(value => !value)}>{composerExpanded ? "收起编辑" : "写一条分享"}</button></div>
        <form id="community-compose-form" onSubmit={async event => { event.preventDefault(); await write("/posts", "POST", { content: draft, galleryArtworkId: sourceId }, "post"); }}>
          <label htmlFor="community-draft">分享你的观画感受</label>
          <textarea id="community-draft" rows={7} maxLength={5000} placeholder="一处留白，一笔山色，或一个想与大家讨论的问题……"
            value={draft} onChange={e => setDraft(e.target.value)} disabled={Boolean(pending)} />
          <div className="community-compose-meta"><span>{[...draft].length} / 5000</span><button className="text-button" type="button" disabled={busy} onClick={() => setPicker(true)}>选择画廊国画</button></div>
          {sourceId ? <div className="community-source">{reference.loading ? <LoadingStatus label="正在确认作品来源" /> : reference.error ?
            <StatePanel compact kind="error" title="原作暂不可引用" description={reference.error} actionLabel="重新核对原作" onAction={reference.retry} /> :
            reference.data ? <Reference value={reference.data} /> : null}
            <button className="text-button" type="button" disabled={busy} onClick={() => setSourceId(null)}>移除引用</button></div> : null}
          <button className="button button-primary button-wide" type="submit"
            disabled={busy || !draft.trim() || Boolean(sourceId && (reference.loading || reference.error || reference.data?.state !== "AVAILABLE"))}>
            {sending ? <PendingIndicator /> : null}发布帖子</button>
        </form>
      </aside><section aria-label="社区帖子">
        <div className="community-feed-toolbar"><div className="community-tabs" role="group" aria-label="帖子筛选">
          {([["all", "最新分享"], ["mine", "我的帖子"], ["favorites", "我的收藏"]] as const).map(([key, label]) =>
            <button key={key} type="button" aria-pressed={view === key} disabled={Boolean(pending)} onClick={() => { setView(key); setPage(0); }}>{label}</button>)}
        </div><button className="text-button" type="button" onClick={list.retry} disabled={list.loading}>刷新</button></div>
        {list.error ? <StatePanel compact kind="error" title="帖子读取失败" description={list.error} actionLabel="重新读取帖子" onAction={list.retry} /> : null}
        {list.loading ? list.data ? <LoadingStatus label="正在更新帖子，暂保留本页内容" /> : <CommunityLoading /> : null}
        <div className="community-feed">{list.data?.items.map(post => <PostCard key={post.id} post={post} busy={busy || list.loading} write={write} />)}</div>
        {!list.loading && !list.error && list.data?.items.length === 0 ? <StatePanel kind="empty" title={view === "favorites" ? "还没有收藏的帖子" : "这里等待你的第一笔"}
          description={view === "favorites" ? "遇见喜欢的分享，点击收藏后便能在这里找到。" : "选一幅喜欢的国画，分享你的观察与感受。"} /> : null}
        <nav className="pagination" aria-label="帖子分页"><button className="button" type="button" disabled={Boolean(pending) || !page || list.loading} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span>第 {page + 1} 页</span><button className="button" type="button" disabled={Boolean(pending) || list.loading || !list.data?.hasNext} onClick={() => setPage(p => p + 1)}>下一页</button></nav>
      </section></div>}
    {picker ? <GalleryPicker onClose={() => setPicker(false)} onSelect={id => { setSourceId(id); setPicker(false); }} /> : null}
  </>;
}

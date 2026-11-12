"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";
import { useReadResource } from "@/components/use-read-resource";
import { LoadingStatus } from "@/components/loading";
import { StatePanel } from "@/components/state-panel";
import { communityApi, critiqueDimensions, type CommunityCapabilities, type CommunityGrowth, type CommunityPost } from "@/lib/community";
import { saveCommunityHandoff } from "@/lib/community-draft";
import { communityReturnKey, readCommunityReturn } from "@/lib/community-filters";
import { CommunityDialog } from "./community-media";
import { CommunityPostCard } from "./community-post";
import { CommunityGrowthPanel } from "./community-growth";
import { CommunityLoading } from "./community-loading";
import type { CommunityActions } from "./use-community-actions";

function Editor({ post, actions, close }: { post: CommunityPost; actions: CommunityActions; close: () => void }) {
  const [content, setContent] = useState(post.content), [title, setTitle] = useState(post.title), [tags, setTags] = useState(post.tags.join("，")), [goal, setGoal] = useState(post.creationGoal), [deleting, setDeleting] = useState(false);
  return <CommunityDialog title="编辑你的分享" close={close}><form onSubmit={event => { event.preventDefault(); void actions.write(`/posts/${post.id}`, "PUT", { content, title, tags: tags.split(/[,，#\s]+/).filter(Boolean), creationGoal: goal }, "edit").then(result => { if (result) close(); }); }}><label className="community-field">标题<input aria-label="标题" value={title} maxLength={100} required={post.kind === "artwork"} disabled={actions.busy} onChange={event => setTitle(event.target.value)} /></label><label className="community-field">正文<textarea aria-label="正文" value={content} rows={7} maxLength={5000} required disabled={actions.busy} onChange={event => setContent(event.target.value)} /></label><label className="community-field">话题标签<input aria-label="话题标签" value={tags} maxLength={200} disabled={actions.busy} onChange={event => setTags(event.target.value)} /></label>{post.kind === "artwork" ? <label className="community-field">创作目标<textarea aria-label="创作目标" value={goal} rows={2} maxLength={1000} disabled={actions.busy} onChange={event => setGoal(event.target.value)} /></label> : null}<p className="community-field-hint">图片和历史版本继续保留，修改说明会更新到当前帖子。</p><div className="community-dialog-actions"><button type="button" className="text-button community-danger" disabled={actions.busy} onClick={() => setDeleting(true)}>删除帖子</button><button className="button button-primary" disabled={actions.busy || !content.trim() || post.kind === "artwork" && !title.trim()}>保存修改</button></div></form>{deleting ? <div className="community-delete-confirm"><p>确认删除这条分享？删除后将从社区和公开成长案例中隐藏。</p><button className="button" type="button" disabled={actions.busy} onClick={() => setDeleting(false)}>保留帖子</button><button type="button" className="button community-danger" disabled={actions.busy} onClick={() => void actions.write(`/posts/${post.id}`, "DELETE", {}, "delete")}>确认删除帖子</button></div> : null}</CommunityDialog>;
}
function Comments({ post, growth, actions, enabled }: { post: CommunityPost; growth: CommunityGrowth | null; actions: CommunityActions; enabled: boolean }) {
  const { token } = useSession();
  const [page, setPage] = useState(0), [draft, setDraft] = useState(""), [dimension, setDimension] = useState("综合"), [suggestion, setSuggestion] = useState("");
  const [critique, setCritique] = useState(post.kind === "artwork"), [reply, setReply] = useState<{ id: string; name: string } | null>(null), [version, setVersion] = useState("");
  const revision = actions.revision, completed = actions.lastResult?.kind === "comment" && actions.lastResult.postId === post.id ? actions.lastResult.commentId : undefined;
  const lastCleared = useRef<string | null>(null);
  useEffect(() => { if (completed && lastCleared.current !== completed) { lastCleared.current = completed; setDraft(""); setSuggestion(""); setReply(null); } }, [completed]);
  const loader = useCallback((signal: AbortSignal) => { void revision; return communityApi.comments(token!, post.id, page, signal); }, [token, post.id, page, revision]);
  const read = useReadResource("community-comments:" + post.id + ":" + page, loader);
  const structured = enabled && critique && post.kind === "artwork" && !reply;
  return <section className="community-card community-comments glass-panel" aria-labelledby="community-comments-title"><div className="community-section-top"><div><span className="community-eyebrow">CONVERSATION</span><h2 id="community-comments-title">一起聊聊，下一笔。</h2></div><span>{post.commentCount} 条回应</span></div>
    {post.kind === "artwork" && enabled ? <div className="community-compose-modes" aria-label="回应类型"><button type="button" aria-pressed={critique} onClick={() => { setCritique(true); setReply(null); }}>作品点评</button><button type="button" aria-pressed={!critique} onClick={() => setCritique(false)}>交流评论</button></div> : null}
    <form onSubmit={event => { event.preventDefault(); void actions.write(`/posts/${post.id}/comments`, "POST", enabled ? { content: draft, parentId: reply?.id || null, dimension: structured ? dimension : "", suggestion: structured ? suggestion : "", revisionId: structured && version ? version : null } : { content: draft }, "comment"); }}>
      {reply ? <div className="community-reply-target">回复 {reply.name}<button className="text-button" type="button" onClick={() => setReply(null)}>取消回复 ×</button></div> : null}
      {structured ? <div className="community-critique-controls"><label className="community-field">点评维度<select aria-label="点评维度" value={dimension} disabled={actions.busy} onChange={event => setDimension(event.target.value)}>{critiqueDimensions.map(value => <option key={value}>{value}</option>)}</select></label><label className="community-field">对应版本<select aria-label="对应版本" value={version} disabled={actions.busy} onChange={event => setVersion(event.target.value)}><option value="">第 1 版 · 原始作品</option>{growth?.revisions.map(value => <option key={value.id} value={value.id}>第 {value.versionNumber} 版</option>)}</select></label></div> : null}
      <label className="community-field" htmlFor="community-comment">{structured ? "你的观察" : "写下评论"}</label><textarea id="community-comment" maxLength={1000} rows={3} value={draft} placeholder={structured ? "具体说说你在画面里看见了什么。" : "分享你的第一眼感受……"} disabled={actions.busy} onChange={event => setDraft(event.target.value)} />
      {structured ? <label className="community-field">可以动手尝试的建议<textarea aria-label="修改建议" value={suggestion} rows={3} maxLength={1000} placeholder="例如：减弱右侧近景墨色，让水面留白更连贯。" disabled={actions.busy} onChange={event => setSuggestion(event.target.value)} /></label> : null}
      <button className="button button-primary" disabled={actions.busy || !draft.trim() || structured && !suggestion.trim()} type="submit">{structured ? "发表作品点评" : "发表评论"}</button>
    </form>
    {read.error ? <StatePanel compact kind="error" title="评论读取失败" description={read.error} actionLabel="重新读取评论" onAction={read.retry} /> : null}{read.loading ? <LoadingStatus label="正在读取评论" /> : null}
    {read.data?.items.map(comment => <article className={`community-comment${comment.dimension ? " is-critique" : ""}`} key={comment.id} id={`comment-${comment.id}`}><header><span className="community-avatar" aria-hidden>{comment.author.displayName.slice(0, 1)}</span><div><strong>{comment.author.displayName}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("zh-CN")}</time></div>{comment.dimension ? <span className="community-status-badge">{comment.dimension}{comment.revisionNumber ? ` · V${comment.revisionNumber}` : " · V1"}</span> : null}</header>
      {comment.replyName ? <p className="community-field-hint">回复 {comment.replyName}</p> : null}<p className="community-content">{comment.content}</p>{comment.suggestion ? <blockquote><span>可以试试</span>{comment.suggestion}</blockquote> : null}
      <div className="community-inline-actions">{enabled ? <button type="button" className="text-button" disabled={actions.busy} onClick={() => { setReply({ id: comment.id, name: comment.author.displayName }); document.getElementById("community-comment")?.focus(); }}>回复</button> : null}{comment.adopted ? <span className="community-adopted">✓ 作者已采纳</span> : null}{enabled && post.canEdit && comment.dimension ? <button type="button" className="text-button" aria-pressed={comment.adopted} disabled={actions.busy} onClick={() => void actions.write(`/comments/${comment.id}/adopt`, "PUT", { enabled: !comment.adopted }, "adopt")}>{comment.adopted ? "取消采纳" : "采纳这条点评"}</button> : null}</div>
    </article>)}
    {!read.loading && !read.error && !read.data?.items.length ? <p className="community-muted">还没有评论，分享你的第一眼感受吧。</p> : null}
    <nav className="pagination" aria-label="评论分页"><button className="button" type="button" disabled={!page || read.loading || actions.busy} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page + 1} 页</span><button className="button" type="button" disabled={!read.data?.hasNext || read.loading || actions.busy} onClick={() => setPage(value => value + 1)}>下一页</button></nav>
  </section>;
}
export function CommunityDetail({ postId, actions, capabilities }: { postId: string; actions: CommunityActions; capabilities: CommunityCapabilities }) {
  const { token, user } = useSession(); const router = useRouter(); const [editing, setEditing] = useState(false), [back, setBack] = useState("/community");
  const revision = actions.revision;
  const deleted = actions.lastResult?.kind === "delete" && actions.lastResult.postId === postId;
  const loader = useCallback((signal: AbortSignal) => { void revision; return communityApi.post(token!, postId, signal); }, [token, postId, revision]);
  const read = useReadResource("community-post:" + postId, loader, !deleted, 30_000);
  const growthLoader = useCallback((signal: AbortSignal) => { void revision; return communityApi.growth(token!, postId, signal); }, [token, postId, revision]);
  const growth = useReadResource("community-growth:" + postId, growthLoader, !deleted && capabilities.growth && read.data?.kind === "artwork");
  useEffect(() => { setBack(readCommunityReturn(sessionStorage.getItem(communityReturnKey(String(user?.id))))?.href || "/community"); }, [user?.id]);
  useEffect(() => { if (deleted) router.replace(back); }, [deleted, router, back]);
  const toAssistant = () => {
    const post = read.data; if (!post) return;
    try {
      saveCommunityHandoff(sessionStorage, String(user?.id), { target: "assistant", postId: post.id, title: post.title,
        text: `请结合这幅社区作品，围绕${post.helpTopics.join("、") || "构图、笔墨、设色与意境"}给出具体建议。\n\n${post.title ? `作品：${post.title}\n` : ""}${post.creationGoal ? `创作目标：${post.creationGoal}\n` : ""}作者说明：${post.content}`,
        imageIds: post.images.map(image => image.id), galleryPaintingId: post.galleryReference?.state === "AVAILABLE" ? post.galleryReference.paintingId : null });
      router.push("/assistant?from=community");
    } catch { actions.setMessage("浏览器暂时无法准备助手草稿，请稍后重试。"); }
  };
  return <div className="community-detail"><div className="community-detail-top"><Link className="text-button" href={back} prefetch={false}>← 返回社区</Link>{read.data && capabilities.growth ? <button className="text-button" type="button" onClick={toAssistant}>带到国画助手分析 ↗</button> : null}</div>
    {read.error ? <StatePanel kind="error" title="帖子读取失败" description={read.error} actionLabel="重新读取帖子" onAction={read.retry} /> : null}
    {read.loading && !read.data ? <CommunityLoading /> : read.data ? <><CommunityPostCard post={read.data} actions={actions} detail onEdit={capabilities.growth ? () => setEditing(true) : undefined} />
      {capabilities.growth && read.data.kind === "artwork" ? growth.error ? <StatePanel compact kind="error" title="成长档案读取失败" description={growth.error} actionLabel="重新读取档案" onAction={growth.retry} /> : growth.data ? <CommunityGrowthPanel post={read.data} growth={growth.data} actions={actions} /> : <CommunityLoading /> : null}
      <Comments post={read.data} growth={growth.data} actions={actions} enabled={capabilities.growth} />
      {editing ? <Editor post={read.data} actions={actions} close={() => setEditing(false)} /> : null}
    </> : null}
  </div>;
}

"use client";

import Link from "next/link";
import { CommunityImages } from "./community-media";
import { CommunityReference } from "./community-reference";
import type { CommunityPost } from "@/lib/community";
import type { CommunityActions } from "./use-community-actions";

export const workflowLabels: Record<string, string> = { sharing: "自由交流", seeking_feedback: "待点评", revising: "修改中", completed: "已完成复盘" };
export function CommunityPostCard({ post, actions, detail = false, onTag, onOpen, onEdit }: { post: CommunityPost; actions: CommunityActions; detail?: boolean; onTag?: (tag: string) => void; onOpen?: () => void; onEdit?: () => void }) {
  return <article className="community-card glass-panel content-reveal" data-testid="community-post" data-post-id={post.id}>
    <header className="community-author"><span aria-hidden className="community-avatar">{post.author.displayName.slice(0, 1)}</span><div><strong>{post.author.displayName}</strong><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div><span className={`community-kind${post.kind === "artwork" ? " is-artwork" : ""}`}>{workflowLabels[post.workflowStatus] || "自由交流"}</span></header>
    {post.title ? detail ? <h2 className="community-post-title">{post.title}</h2> : <h2 className="community-post-title"><Link href={`/community/posts/${post.id}`} prefetch={false} onClick={onOpen}>{post.title}</Link></h2> : null}
    {post.kind === "artwork" ? <div className="community-work-meta">{post.creationStage ? <span>{post.creationStage}</span> : null}{post.helpTopics.map(topic => <span key={topic}>{topic}</span>)}</div> : null}
    {post.creationGoal && post.kind === "artwork" ? <p className="community-creation-goal"><span>这次想改善</span>{post.creationGoal}</p> : null}
    <p className="community-content">{post.content}</p><CommunityImages images={post.images} title={post.title || "社区分享"} />
    {post.galleryReference ? <CommunityReference value={post.galleryReference} /> : null}
    {post.tags.length ? <div className="community-post-tags">{post.tags.map(tag => onTag ? <button type="button" key={tag} onClick={() => onTag(tag)}>#{tag}</button> : <Link key={tag} prefetch={false} href={`/community?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>)}</div> : null}
    <footer className="community-actions"><button type="button" className="text-button" aria-pressed={post.liked} disabled={actions.busy} onClick={() => void actions.write(`/posts/${post.id}/like`, "PUT", { enabled: !post.liked }, "like")}><span aria-hidden>♡</span> {post.liked ? "已赞" : "赞"} · {post.likeCount}</button>
      {detail ? <span>评论 · {post.commentCount}</span> : <Link className="text-button" href={`/community/posts/${post.id}`} prefetch={false} onClick={onOpen}>评论 · {post.commentCount}</Link>}
      <button className="text-button" type="button" aria-pressed={post.favorited} disabled={actions.busy} onClick={() => void actions.write(`/posts/${post.id}/favorite`, "PUT", { enabled: !post.favorited }, "favorite")}><span aria-hidden>☆ </span>{post.favorited ? "已收藏" : "收藏帖子"}</button>
      {!detail ? <Link className="community-read-post" href={`/community/posts/${post.id}`} prefetch={false} onClick={onOpen}>阅读全文 ↗</Link> : post.canEdit && onEdit ? <button className="text-button community-read-post" disabled={actions.busy} onClick={onEdit}>编辑帖子</button> : null}
    </footer>
  </article>;
}

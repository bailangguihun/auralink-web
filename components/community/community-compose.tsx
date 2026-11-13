"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";
import { useReadResource } from "@/components/use-read-resource";
import { LoadingStatus, PendingIndicator } from "@/components/loading";
import { StatePanel } from "@/components/state-panel";
import { communityApi, critiqueDimensions, type CommunityCapabilities, type CommunityImage } from "@/lib/community";
import { communityDraftKey, communityHandoffKey, emptyCommunityDraft, readCommunityDraft, readCommunityHandoff, saveCommunityDraft, type CommunityDraft, type CommunityHandoff } from "@/lib/community-draft";
import { CommunityUploader } from "./community-media";
import { CommunityGalleryPicker, CommunityReference } from "./community-reference";
import type { CommunityActions } from "./use-community-actions";

export function CommunityComposer({ capabilities, actions, initialPaintingId }: { capabilities: CommunityCapabilities; actions: CommunityActions; initialPaintingId: string | null }) {
  const { token, user } = useSession(); const actorId = String(user?.id || ""), router = useRouter();
  const [draft, setDraft] = useState<CommunityDraft>(() => ({ ...emptyCommunityDraft(), paintingId: initialPaintingId }));
  const [ready, setReady] = useState(false), [draftStatus, setDraftStatus] = useState(""), [expanded, setExpanded] = useState(Boolean(initialPaintingId));
  const [picker, setPicker] = useState(false), [incoming, setIncoming] = useState<CommunityHandoff | null>(null);
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    try {
      const saved = readCommunityDraft(sessionStorage.getItem(communityDraftKey(actorId)), actorId);
      if (saved && (saved.content || saved.title || saved.goal || saved.images.length || saved.paintingId)) { setDraft({ ...saved, paintingId: initialPaintingId || saved.paintingId }); setDraftStatus("已恢复当前账号的文字与图片草稿。"); setExpanded(true); }
      const handoff = readCommunityHandoff(sessionStorage.getItem(communityHandoffKey(actorId)), actorId);
      if (handoff?.target === "community") { setIncoming(handoff); setExpanded(true); }
    } catch { setDraftStatus("浏览器无法恢复草稿；请保留当前页面。"); }
    setReady(true);
  }, [actorId, initialPaintingId]);
  useEffect(() => {
    if (!ready || actions.pending) return;
    if (!draft.content && !draft.title && !draft.goal && !draft.images.length && !draft.paintingId && !draft.tags) {
      try { sessionStorage.removeItem(communityDraftKey(actorId)); } catch { /* No private draft to retain. */ }
      setDraftStatus("输入内容后，会按账号暂存于当前标签页。"); return;
    }
    const timer = window.setTimeout(() => {
      try { saveCommunityDraft(sessionStorage, actorId, draft); setDraftStatus("草稿已暂存于当前标签页，保留 24 小时。"); }
      catch { setDraftStatus("草稿暂存失败，请保留当前页面。"); }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, actorId, ready, actions.pending]);
  const completedPost = actions.lastResult?.kind === "post" ? actions.lastResult.postId : undefined;
  useEffect(() => {
    if (!completedPost || consumed.current === completedPost) return;
    consumed.current = completedPost; sessionStorage.removeItem(communityDraftKey(actorId)); setDraft(emptyCommunityDraft());
    router.push("/community/posts/" + completedPost);
  }, [completedPost, actorId, router]);
  const referenceLoader = useCallback((signal: AbortSignal) => communityApi.reference(token!, draft.paintingId!, signal), [token, draft.paintingId]);
  const reference = useReadResource("community-reference:" + draft.paintingId, referenceLoader, Boolean(token && draft.paintingId));
  const updateImages = useCallback((images: CommunityImage[]) => setDraft(value => ({ ...value, images })), []);
  const length = [...draft.content].length;
  const invalidSource = Boolean(draft.paintingId && (reference.loading || reference.error || reference.data?.state !== "AVAILABLE"));
  const disabled = actions.busy || !ready || !draft.content.trim() || length > 5000 || invalidSource ||
    capabilities.growth && draft.kind === "artwork" && (!draft.title.trim() || !draft.images.length);
  const field = <K extends keyof CommunityDraft>(key: K, value: CommunityDraft[K]) => setDraft(old => ({ ...old, [key]: value }));
  const importHandoff = () => {
    if (!incoming) return;
    setDraft({ ...emptyCommunityDraft(), content: incoming.text, title: incoming.title || "", source: "来自国画助手 · 经本人编辑发布" });
    sessionStorage.removeItem(communityHandoffKey(actorId)); setIncoming(null);
  };
  return <aside className={`community-composer glass-panel${expanded ? " is-expanded" : ""}`}>
    <div className="community-compose-heading"><div><span className="community-eyebrow">LEAVE A TRACE</span><h2>把笔墨，带到这里。</h2></div><button className="community-compose-toggle text-button" type="button" aria-expanded={expanded} aria-controls="community-compose-form" onClick={() => setExpanded(value => !value)}>{expanded ? "收起编辑" : "写一条分享"}</button></div>
    <p className="community-composer-intro">一处留白，一笔山色，<br />或一个想和大家聊聊的问题。</p>
    <form id="community-compose-form" onSubmit={event => { event.preventDefault(); if (disabled) return; void actions.write("/posts", "POST", capabilities.growth ? {
      content: draft.content, galleryArtworkId: draft.paintingId, title: draft.title, kind: draft.kind, creationStage: draft.stage,
      creationGoal: draft.goal, helpTopics: draft.topics, tags: draft.tags.split(/[,，#\s]+/).filter(Boolean), imageIds: draft.images.map(image => image.id),
    } : { content: draft.content, galleryArtworkId: draft.paintingId }, "post"); }}>
      {incoming ? <div className="community-notice"><p>助手内容已准备好，载入后可以继续编辑。</p><button className="text-button" type="button" disabled={actions.busy} onClick={importHandoff}>载入助手草稿{draft.content ? "并替换当前内容" : ""}</button><button className="text-button" type="button" onClick={() => { sessionStorage.removeItem(communityHandoffKey(actorId)); setIncoming(null); }}>保留当前草稿</button></div> : null}
      {capabilities.growth ? <div className="community-compose-modes" aria-label="发布类型">{([["discussion", "自由交流"], ["artwork", "作品求助"]] as const).map(([kind, label]) => <button key={kind} type="button" aria-pressed={draft.kind === kind} disabled={actions.busy} onClick={() => field("kind", kind)}>{label}</button>)}</div> : null}
      {capabilities.growth ? <label className="community-field">{draft.kind === "artwork" ? "作品名称" : "标题（选填）"}<input value={draft.title} maxLength={100} placeholder={draft.kind === "artwork" ? "给这一次练习起个名字" : "为这条分享写一个标题"} disabled={actions.busy} onChange={event => field("title", event.target.value)} /></label> : null}
      <label className="community-field" htmlFor="community-draft">{draft.kind === "artwork" ? "作品背景与想请教的问题" : "分享你的观画感受"}</label><textarea id="community-draft" rows={6} maxLength={5000} placeholder="写下你看见的、想到的，或正在尝试的……" value={draft.content} disabled={actions.busy} onChange={event => field("content", event.target.value)} />
      <div className="community-compose-meta"><span className={length > 5000 ? "community-error" : ""}>{length} / 5000{length > 5000 ? " · 请精简后发布" : ""}</span></div>
      {capabilities.growth && draft.kind === "artwork" ? <section className="community-work-brief"><label className="community-field">创作阶段<select aria-label="创作阶段" value={draft.stage} disabled={actions.busy} onChange={event => field("stage", event.target.value)}>{["创作", "临摹", "写生", "修改"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="community-field">这次想改善什么？<textarea rows={2} maxLength={1000} value={draft.goal} placeholder="例如：让主体更突出，调整近景与留白的关系。" disabled={actions.busy} onChange={event => field("goal", event.target.value)} /></label>
        <fieldset className="community-topics"><legend>希望获得哪方面的点评？</legend>{critiqueDimensions.slice(0, 6).map(topic => <label key={topic}><input type="checkbox" checked={draft.topics.includes(topic)} disabled={actions.busy} onChange={event => field("topics", event.target.checked ? [...draft.topics, topic] : draft.topics.filter(value => value !== topic))} /><span>{topic}</span></label>)}</fieldset>
      </section> : null}
      {capabilities.uploads ? <CommunityUploader images={draft.images} onChange={updateImages} actions={actions} /> : null}
      {capabilities.growth && draft.kind === "artwork" && !draft.images.length ? <p className="community-field-hint">作品求助需要至少一张自己的作品图片。</p> : null}
      {capabilities.search ? <label className="community-field">话题标签<input maxLength={200} value={draft.tags} placeholder="山水，笔墨，创作日常（最多 5 个）" disabled={actions.busy} onChange={event => field("tags", event.target.value)} /></label> : null}
      <div className="community-reference-toolbar"><button className="text-button" type="button" disabled={actions.busy} onClick={() => setPicker(true)}><span aria-hidden>＋ </span>选择画廊国画</button><span>作为参考来源</span></div>
      {draft.paintingId ? <div className="community-source">{reference.loading ? <LoadingStatus label="正在核对原作" /> : reference.error ? <StatePanel compact kind="error" title="原作暂不可引用" description={reference.error} actionLabel="重新核对原作" onAction={reference.retry} /> : reference.data ? <CommunityReference value={reference.data} /> : null}<button className="text-button" type="button" disabled={actions.busy} onClick={() => field("paintingId", null)}>移除引用</button></div> : null}
      {draft.source ? <p className="community-field-hint">{draft.source}</p> : null}
      <button className="button button-primary button-wide" type="submit" disabled={disabled}>{actions.sending ? <PendingIndicator /> : null}{draft.kind === "artwork" && capabilities.growth ? "发布作品求助" : "发布帖子"}<span aria-hidden> ↗</span></button>
      <div className="community-draft-status"><small role="status">{draftStatus}</small><button className="text-button" type="button" disabled={actions.busy} onClick={() => { setDraft(emptyCommunityDraft()); sessionStorage.removeItem(communityDraftKey(actorId)); }}>清空草稿</button></div>
    </form>{picker ? <CommunityGalleryPicker onClose={() => setPicker(false)} onSelect={id => { field("paintingId", id); setPicker(false); }} /> : null}
  </aside>;
}

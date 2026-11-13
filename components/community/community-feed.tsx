"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReadResource } from "@/components/use-read-resource";
import { useSession } from "@/components/session-provider";
import { LoadingStatus } from "@/components/loading";
import { StatePanel } from "@/components/state-panel";
import { communityApi, critiqueDimensions, type CommunityCapabilities, type CommunityFilters } from "@/lib/community";
import { communityHref, communityReturnKey, readCommunityReturn } from "@/lib/community-filters";
import { CommunityPostCard } from "./community-post";
import { CommunityLoading } from "./community-loading";
import type { CommunityActions } from "./use-community-actions";

type Props = { capabilities: CommunityCapabilities; actions: CommunityActions; filters: CommunityFilters; update: (value: Partial<CommunityFilters>) => void };
export function CommunitySidebar({ filters, update, capabilities }: Pick<Props, "filters" | "update" | "capabilities">) {
  const rows = [{ label: "社区动态", symbol: "◌", view: "all", tab: "feed" }, { label: "我的帖子", symbol: "笔", view: "mine", tab: "feed" }, { label: "我的收藏", symbol: "藏", view: "favorites", tab: "feed" },
    ...(capabilities.notifications ? [{ label: "消息通知", symbol: "信", view: "all", tab: "notifications" }] : []), ...(capabilities.cases ? [{ label: "成长案例", symbol: "册", view: "all", tab: "cases" }] : [])];
  const { token } = useSession();
  const tagLoader = useCallback((signal: AbortSignal) => communityApi.tags(token!, signal), [token]);
  const tags = useReadResource("community-tags", tagLoader, capabilities.search && Boolean(token));
  return <aside className="community-sidebar"><div className="community-sidebar-mark"><span aria-hidden>同<br />行</span><p>在笔墨之间，<br />遇见同路的人。</p></div><nav aria-label="社区导航">{rows.map(row => <button key={row.label} type="button" aria-current={filters.view === row.view && filters.tab === row.tab ? "page" : undefined} onClick={() => update({ tab: row.tab, view: row.view, page: 0, q: "", tag: "", workflow: "" })}><span aria-hidden>{row.symbol}</span>{row.label}</button>)}</nav>
    {tags.data?.length ? <section className="community-sidebar-tags"><h2>正在聊</h2>{tags.data.map(item => <button key={item.tag} type="button" onClick={() => update({ tag: item.tag, tab: "feed", page: 0 })}>#{item.tag}<small>{item.count}</small></button>)}</section> : null}
    <p className="community-sidebar-note">看见一笔的变化，<br />也看见彼此的成长。</p>
  </aside>;
}
function Pagination({ page, hasNext, busy, update }: { page: number; hasNext: boolean; busy: boolean; update: (page: number) => void }) {
  return <nav className="pagination community-pagination" aria-label="帖子分页"><button className="button" type="button" disabled={!page || busy} onClick={() => update(page - 1)}>上一页</button><span>第 {page + 1} 页</span><button className="button" type="button" disabled={!hasNext || busy} onClick={() => update(page + 1)}>下一页</button></nav>;
}
export function CommunityFeed(props: Props) {
  const { filters, capabilities, actions, update } = props; const { token, user } = useSession();
  const [input, setInput] = useState(filters.q), restored = useRef(false);
  useEffect(() => setInput(filters.q), [filters.q]);
  const query = communityHref(filters), revision = actions.revision;
  const loader = useCallback((signal: AbortSignal) => { void revision; return communityApi.posts(token!, filters.page, filters.view, signal, capabilities.search ? filters : undefined); }, [token, filters, capabilities.search, revision]);
  const read = useReadResource("community-posts:" + query, loader, Boolean(token), 30_000);
  useEffect(() => {
    if (read.loading || !read.data || restored.current) return;
    restored.current = true;
    const saved = readCommunityReturn(sessionStorage.getItem(communityReturnKey(String(user?.id))));
    if (saved?.href !== query) return;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: saved.scrollY, behavior: "instant" }));
    return () => cancelAnimationFrame(frame);
  }, [read.loading, read.data, query, user?.id]);
  const savePosition = () => { try { sessionStorage.setItem(communityReturnKey(String(user?.id)), JSON.stringify({ href: query, scrollY: window.scrollY })); } catch { /* Navigation remains available. */ } };
  return <section className="community-feed-area" aria-label="社区帖子">
    {capabilities.growth ? <div className="community-stream-tabs" role="group" aria-label="社区内容类型">{([["", "全部分享", "相遇于笔墨之间"], ["discussion", "自由交流", "观画、灵感与创作日常"], ["artwork", "作品成长", "从一次点评，到下一笔"]] as const).map(([kind, title, subtitle]) => <button key={kind} type="button" aria-pressed={filters.kind === kind} onClick={() => update({ kind, workflow: "", page: 0 })}><strong>{title}</strong><small>{subtitle}</small></button>)}</div> : null}
    <div className="community-feed-toolbar"><div><span className="community-eyebrow">THE COMMUNITY JOURNAL</span><h2>{filters.view === "mine" ? "我的笔墨记录" : filters.view === "favorites" ? "收藏的回响" : filters.kind === "artwork" ? "让作品，慢慢长大。" : "分享此刻所见。"}</h2></div><button className="text-button" type="button" onClick={read.retry} disabled={read.loading}>刷新</button></div>
    {capabilities.search ? <form className="community-feed-search" role="search" onSubmit={event => { event.preventDefault(); update({ q: input.trim(), page: 0 }); }}><input aria-label="搜索社区" placeholder="搜索作品、作者或分享内容" maxLength={100} value={input} onChange={event => setInput(event.target.value)} /><button type="submit" className="button">搜索</button><select aria-label="帖子排序" value={filters.sort} onChange={event => update({ sort: event.target.value, page: 0 })}><option value="latest">最新分享</option><option value="popular">最多点赞</option></select></form> : null}
    {filters.kind === "artwork" ? <div className="community-workflow-tabs" role="group" aria-label="作品成长状态">{[["", "全部"], ["seeking_feedback", "待点评"], ["revising", "修改中"], ["completed", "已复盘"]].map(([workflow, label]) => <button key={workflow} type="button" aria-pressed={filters.workflow === workflow} onClick={() => update({ workflow, page: 0 })}>{label}</button>)}</div> : null}
    {filters.tag || filters.q ? <div className="community-filter-summary"><span>{filters.tag ? `#${filters.tag}` : `“${filters.q}” 的搜索结果`}</span><button type="button" className="text-button" onClick={() => update({ tag: "", q: "", page: 0 })}>清除筛选 ×</button></div> : null}
    {read.error ? <StatePanel compact kind="error" title="帖子读取失败" description={read.error} actionLabel="重新读取帖子" onAction={read.retry} /> : null}
    {read.loading ? read.data ? <LoadingStatus label="正在更新帖子，暂保留本页内容" /> : <CommunityLoading /> : null}
    <div className="community-feed">{read.data?.items.map(post => <CommunityPostCard key={post.id} post={post} actions={actions} onOpen={savePosition} onTag={tag => update({ tag, page: 0 })} />)}</div>
    {!read.loading && !read.error && !read.data?.items.length ? <div className="community-empty"><span aria-hidden>墨</span><h3>{filters.view === "favorites" ? "把喜欢的分享，留在这里。" : filters.q || filters.tag ? "暂时没有找到相关分享" : "这里，等待你的第一笔。"}</h3><p>{filters.view === "favorites" ? "点击帖子下方的收藏，下次相遇就更容易。" : filters.kind === "artwork" ? "带上一幅自己的作品，分享创作目标，邀请同伴给出具体建议。" : "写下一次观画的感受，分享创作日常，或选择一幅画廊原作开始聊聊。"}</p></div> : null}
    <Pagination page={filters.page} hasNext={read.data?.hasNext || false} busy={read.loading || actions.busy} update={page => update({ page })} />
  </section>;
}
const noticeLabels: Record<string, string> = { comment: "评论了你的分享", reply: "回复了你的评论", like: "赞了你的分享", adopt: "采纳了你的点评", review_request: "邀请你为新版本复评", review_complete: "为你的新版本留下了复评" };
export function CommunityNotifications({ actions, filters, update }: Props) {
  const { token } = useSession(), revision = actions.revision;
  const loader = useCallback((signal: AbortSignal) => { void revision; return communityApi.notifications(token!, filters.page, signal); }, [token, filters.page, revision]);
  const read = useReadResource("community-notifications:" + filters.page, loader);
  return <section className="community-feed-area"><header className="community-section-heading"><span className="community-eyebrow">LETTERS & ECHOES</span><h2>每一次回应，都在这里。</h2><p>{read.data?.unread ? `${read.data.unread} 条未读消息` : "来自同伴的点评、回复与邀请。"}</p></header>
    {read.loading ? <CommunityLoading /> : null}{read.error ? <StatePanel compact kind="error" title="通知读取失败" description={read.error} actionLabel="重新读取" onAction={read.retry} /> : null}
    <div className="community-notice-list">{read.data?.items.map(notice => <article className={`community-notification glass-panel${notice.read ? "" : " is-unread"}`} key={notice.id}><span className="community-avatar" aria-hidden>{notice.actorName.slice(0, 1)}</span><div><p><strong>{notice.actorName}</strong> {noticeLabels[notice.kind] || "回应了你的分享"}</p><Link prefetch={false} href={`/community/posts/${notice.postId}`}>{notice.postTitle || "查看原帖"} ↗</Link><time dateTime={notice.createdAt}>{new Date(notice.createdAt).toLocaleString("zh-CN")}</time></div>{!notice.read ? <button type="button" className="text-button" disabled={actions.busy} onClick={() => void actions.write(`/notifications/${notice.id}/read`, "PUT", {}, "read")}>标为已读</button> : null}</article>)}</div>
    {!read.loading && !read.error && !read.data?.items.length ? <StatePanel kind="empty" title="还没有新的回响" description="收到点评、回复或复评邀请后，会在这里提醒你。" /> : null}
    <Pagination page={filters.page} hasNext={read.data?.hasNext || false} busy={read.loading || actions.busy} update={page => update({ page })} />
  </section>;
}
export function CommunityCases({ filters, update }: Props) {
  const { token } = useSession(); const [query, setQuery] = useState(filters.q);
  useEffect(() => setQuery(filters.q), [filters.q]);
  const loader = useCallback((signal: AbortSignal) => communityApi.cases(token!, filters.page, filters.q, filters.tag, signal), [token, filters.page, filters.q, filters.tag]);
  const read = useReadResource("community-cases:" + communityHref(filters), loader);
  return <section className="community-feed-area"><header className="community-section-heading"><span className="community-eyebrow">A NOTEBOOK OF GROWTH</span><h2>把一次成长，留给后来的人。</h2><p>从真实点评、修改版本和作者复盘中整理，由作者确认发布。</p></header>
    <form className="community-feed-search" onSubmit={event => { event.preventDefault(); update({ q: query.trim(), page: 0 }); }}><input aria-label="搜索成长案例" placeholder="搜索作品或修改经验" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} /><button className="button">搜索</button><select aria-label="案例问题维度" value={filters.tag} onChange={event => update({ tag: event.target.value, page: 0 })}><option value="">全部维度</option>{critiqueDimensions.map(value => <option key={value}>{value}</option>)}</select></form>
    {read.loading ? <CommunityLoading /> : null}{read.error ? <StatePanel compact kind="error" title="案例读取失败" description={read.error} actionLabel="重新读取" onAction={read.retry} /> : null}
    <div className="community-case-grid">{read.data?.items.map((item, index) => <article className="community-case-card glass-panel" key={item.id}><span className="community-case-number">{String(filters.page * 12 + index + 1).padStart(2, "0")}</span><div className="community-work-meta">{item.dimensions.map(value => <span key={value}>{value}</span>)}</div><h3><Link href={`/community/posts/${item.postId}`} prefetch={false}>{item.title}</Link></h3><p>{item.summary}</p><footer><span>真实记录 · 作者发布</span><Link href={`/community/posts/${item.postId}`} prefetch={false}>查看成长档案 ↗</Link></footer></article>)}</div>
    {!read.loading && !read.error && !read.data?.items.length ? <StatePanel kind="empty" title="第一本成长笔记，正在路上" description="作品完成点评与修改后，作者可以整理并发布成长案例。" /> : null}
    <Pagination page={filters.page} hasNext={read.data?.hasNext || false} busy={read.loading} update={page => update({ page })} />
  </section>;
}

"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useSession } from "@/components/session-provider";
import { useReadResource } from "@/components/use-read-resource";
import { MediaImage } from "@/components/media-image";
import { LoadingStatus } from "@/components/loading";
import { StatePanel } from "@/components/state-panel";
import { api } from "@/lib/api";
import type { GalleryReference } from "@/lib/community";
import { CommunityDialog } from "./community-media";

export function CommunityReference({ value }: { value: GalleryReference }) {
  if (value.state !== "AVAILABLE") return <div className="community-reference"><span>画廊参考</span><p>{value.state === "UNAVAILABLE" ? "原作已不可查看，引用关系保留。" : "暂时无法核实原作，请稍后重新读取。"}</p></div>;
  const title = value.title || "无题", href = "/gallery/" + value.paintingId;
  return <div className="community-reference" data-artwork-source={value.paintingId} data-artwork-title={title} data-artwork-author={value.authorName} data-artwork-period={value.period}>
    <span>画廊参考 · 原作</span><Link className="community-reference-media" href={href} prefetch={false} data-artwork-link={value.paintingId} aria-label={`查看《${title}》的画廊原作`}><MediaImage image={value.image ?? null} alt={title} loading="lazy" /></Link>
    <div className="community-reference-caption"><div><Link className="community-reference-title" href={href} prefetch={false} data-artwork-link={value.paintingId}>{title}</Link><p>{[value.authorName, value.period].filter(Boolean).join(" · ") || "作者资料暂缺"}</p></div><Link className="community-reference-open" href={href} prefetch={false} data-artwork-link={value.paintingId}>查看画廊原作 ↗</Link></div>
  </div>;
}
export function CommunityGalleryPicker({ onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void }) {
  const { token } = useSession(); const [input, setInput] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const loader = useCallback((signal: AbortSignal) => api.paintings({ keyword: query, page, size: 6 }, token!, signal), [token, page, query]);
  const read = useReadResource("community-gallery:" + query + ":" + page, loader, Boolean(token));
  return <CommunityDialog title="选择画廊参考" close={onClose}><form className="community-search" onSubmit={event => { event.preventDefault(); setQuery(input.trim()); setPage(0); }}><label htmlFor="community-gallery-search">搜索画作或作者</label><div><input id="community-gallery-search" value={input} onChange={event => setInput(event.target.value)} /><button className="button" type="submit">搜索</button></div></form>
    {read.loading ? <LoadingStatus label="正在读取画廊作品" /> : null}{read.error ? <StatePanel compact kind="error" title="画廊暂不可用" description={read.error} actionLabel="重新读取" onAction={read.retry} /> : null}
    <div className="community-painting-list">{read.data?.items.map(painting => <button key={painting.paintingId} className="community-painting-choice" type="button" onClick={() => onSelect(painting.paintingId)}><strong>{painting.title}</strong><span>{painting.authorName} · {painting.creationDynastyNormalized || painting.creationDynastyRaw}</span></button>)}</div>
    <nav className="pagination" aria-label="画廊选择分页"><button className="button" disabled={page === 0 || read.loading} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page + 1} 页</span><button className="button" disabled={!read.data?.hasNext || read.loading} onClick={() => setPage(value => value + 1)}>下一页</button></nav>
  </CommunityDialog>;
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { LoadingStatus } from '@/components/loading';
import Link from 'next/link';
import { isAbortError } from '@/lib/api';
import { assistantRequest } from '@/lib/assistant-api';
import { artworkDisplay, type ArtworkReference } from '@/lib/assistant-contracts';
import { ARTWORK_SELECTION_LIMIT, artworkErrorMessage, artworkFilters, artworkSearchPath, emptyArtworkQuery, type ArtworkPage, type ArtworkQuery } from '@/lib/assistant-artworks';
import { useAssistantAccess } from './use-assistant-access';
import styles from './assistant.module.css';

function ArtworkFacts({ artwork, compact = false }: { artwork: ArtworkReference; compact?: boolean }) {
  const fields = artworkDisplay(artwork);
  const title = fields.find(field => field.label === '作品名')?.value || '作品名未提供';
  const heading = fields.filter(field => ['作者名称', '朝代', '分类'].includes(field.label));
  return <>
    <h4>{title}</h4>
    {heading.slice(0, 4).map((field, index) => <p key={index}>{field.label}：{field.value} <small>（{field.uncertainty || '未独立核验'}）</small></p>)}
    <small className={styles.meta}>作品 ID：{artwork.artworkId} · 修订 {artwork.revision}</small>
    {Number.isSafeInteger(artwork.fieldTextLimit) && Number(artwork.fieldTextLimit) > 0 ? <small className={styles.meta}>公开字段预览每项最多 {artwork.fieldTextLimit} 字符；不能视为完整原始标注。</small> : null}
    {!compact ? <details><summary>公开文字资料</summary>{fields.length ? fields.map((field, index) => <p key={index}>{field.label}：{field.value} <small>（{field.uncertainty || '未独立核验'}）{field.raw ? `原始文本：${field.raw}` : ''}</small></p>) : <p>该作品尚无可用的公开文字字段；不会补造标注。</p>}</details> : null}
  </>;
}

/** Session-local selection only: no private history storage or implicit natural-language search. */
export function ArtworkSelection({ selected, onChange, disabled }: { selected: ArtworkReference[]; onChange: (items: ArtworkReference[]) => void; disabled: boolean }) {
  const [query, setQuery] = useState<ArtworkQuery>(emptyArtworkQuery);
  const [submittedQuery, setSubmittedQuery] = useState<ArtworkQuery | null>(null);
  const [page, setPage] = useState<ArtworkPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const access = useAssistantAccess(setError);
  useEffect(() => () => { sequence.current++; }, []);
  const search = async (target: ArtworkQuery, number = 0) => {
    const current = ++sequence.current; setLoading(true); setError('');
    try {
      const path = artworkSearchPath(target, number);
      const value = await access.request((token, signal) => assistantRequest<ArtworkPage>(path, token, signal));
      if (current !== sequence.current) return;
      setPage(value); setSubmittedQuery({ ...target });
    } catch (cause) {
      if (current === sequence.current && !isAbortError(cause)) setError(artworkErrorMessage(cause));
    } finally { if (current === sequence.current) setLoading(false); }
  };
  const toggle = (artwork: ArtworkReference) => {
    if (disabled || loading) return;
    const exists = selected.some(item => item.artworkId === artwork.artworkId);
    if (exists) onChange(selected.filter(item => item.artworkId !== artwork.artworkId));
    else if (selected.length < ARTWORK_SELECTION_LIMIT) onChange([...selected, artwork]);
  };
  const keySearch = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!loading && !disabled) void search(query); }
  };
  return <section className={styles.artworkSelector} aria-label="平台作品参考">
    <details className={styles.tools}>
      <summary>筛选并选用平台作品</summary>
      <p>先筛选、选用作品，再发送问题。系统核对当前公开修订后向模型提供文字资料；不会自动把你的问题当作数据库检索，也不会发送作品图片。</p>
      <div className={styles.artworkFilters}>
        <label>作品关键词<input aria-label="作品关键词" type="search" maxLength={200} value={query.keyword} onChange={event => setQuery(value => ({ ...value, keyword: event.target.value }))} onKeyDown={keySearch} /></label>
        {artworkFilters.map(([key, label]) => <label key={key}>{label}<input aria-label={`筛选${label}`} value={query[key] || ''} maxLength={512} onChange={event => setQuery(value => ({ ...value, [key]: event.target.value }))} onKeyDown={keySearch} /></label>)}
        <label>排序<select aria-label="作品排序" value={query.sort} onChange={event => setQuery(value => ({ ...value, sort: event.target.value as ArtworkQuery['sort'] }))}><option value="source">来源顺序</option><option value="title">作品名</option><option value="author">作者名称</option><option value="dynasty">朝代</option></select></label>
        <label>方向<select aria-label="作品排序方向" value={query.direction} onChange={event => setQuery(value => ({ ...value, direction: event.target.value as ArtworkQuery['direction'] }))}><option value="asc">升序</option><option value="desc">降序</option></select></label>
      </div>
      <p className={styles.meta}>关键词按作品名、作者、题材匹配；其他筛选项按平台已有值精确匹配。留空可浏览当前公开作品。同名作品请结合作者、作品 ID 与详情区分。</p>
      <div className={styles.inline}><button type="button" className="button" disabled={disabled || loading} onClick={() => void search(query)}>{loading ? '正在查找…' : '查找作品'}</button><button type="button" className="button" disabled={disabled || loading} onClick={() => setQuery(emptyArtworkQuery())}>清空筛选条件</button></div>
      {error ? <p role="alert" className={styles.error}>{error}{page ? ' 下方仍是上次成功查询的结果。' : ''}</p> : null}
      {loading ? <LoadingStatus label={page ? "正在读取新查询，以下仍是上次成功查询的结果" : "正在读取平台公开资料"} /> : null}
      {page ? <>
        <p role="status" data-testid="artwork-result-count">匹配 {page.totalElements} 幅 · 本页 {page.items.length} 幅 · 已选 {selected.length}/{ARTWORK_SELECTION_LIMIT} 幅</p>
        {!page.items.length ? <p>本页没有匹配的公开作品。可以调整筛选条件；未选作品时发送的是普通对话，不宣称已查询平台资料。</p> : null}
        <div className={styles.artworkResults}>{page.items.map(artwork => {
          const picked = selected.some(item => item.artworkId === artwork.artworkId);
          return <article className={styles.artworkCard} key={artwork.artworkId} data-testid="artwork-search-result"><ArtworkFacts artwork={artwork} /><div className={styles.inline}><button type="button" className="button" aria-pressed={picked} disabled={disabled || loading || (!picked && selected.length >= ARTWORK_SELECTION_LIMIT)} onClick={() => toggle(artwork)}>{picked ? '取消选用' : '选用此作品'}</button><Link href={`/gallery/${artwork.artworkId}`}>查看当前作品详情</Link></div></article>;
        })}</div>
        <nav className={styles.inline} aria-label="作品结果分页"><button type="button" className="button" disabled={disabled || loading || page.page === 0 || !submittedQuery} onClick={() => submittedQuery && void search(submittedQuery, page.page - 1)}>上一页</button><span>第 {page.totalPages ? page.page + 1 : 0} / {page.totalPages} 页</span><button type="button" className="button" disabled={disabled || loading || page.page + 1 >= page.totalPages || !submittedQuery} onClick={() => submittedQuery && void search(submittedQuery, page.page + 1)}>下一页</button></nav>
      </> : null}
    </details>
    <div className={styles.selectedArtworks} aria-label="本次选用的作品" data-testid="selected-artworks">
      <h3>本次选用的作品 · {selected.length}/{ARTWORK_SELECTION_LIMIT}</h3>
      {selected.length ? <><p>发送前核对作品是否仍公开及修订是否最新。选中作品不等于模型看过图片；分析、推测仍须与记录事实区分。</p>{selected.map(artwork => <article className={styles.artworkCard} key={artwork.artworkId}><ArtworkFacts artwork={artwork} compact /><div className={styles.inline}><button type="button" className={styles.small} disabled={disabled} onClick={() => onChange(selected.filter(item => item.artworkId !== artwork.artworkId))}>移除此作品</button><Link href={`/gallery/${artwork.artworkId}`}>查看当前作品详情</Link></div></article>)}<button type="button" className={styles.small} disabled={disabled} onClick={() => onChange([])}>清除作品参考</button></> : <p className={styles.meta}>尚未选用作品。本次问题不会自动查询平台作品。</p>}
    </div>
  </section>;
}

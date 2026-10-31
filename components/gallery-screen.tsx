"use client";

import { FormEvent, useCallback, useState } from "react";

import { DailyPainting } from "@/components/daily-painting";
import { ModuleHeader } from "@/components/module-header";
import { LoadingSection, LoadingStatus, PaintingGridSkeleton, PendingIndicator } from "@/components/loading";
import { useReadResource } from "@/components/use-read-resource";
import { SearchIcon } from "@/components/icons";
import { PaintingCard } from "@/components/painting-card";
import { GalleryRows, resetGalleryViewport } from "@/components/gallery-rows";
import { getGalleryFeedSnapshot, useGalleryFeed } from "@/components/use-gallery-feed";
import { useFavorites } from "@/components/favorite-provider";
import { useSession } from "@/components/session-provider";
import { StatePanel } from "@/components/state-panel";
import { api, ApiError, errorMessage } from "@/lib/api";
import { INITIAL_GALLERY_QUERY } from "@/lib/gallery-order";
import { galleryFeedKey } from "@/lib/gallery-feed";
import { DAILY_PAINTING_KEY, DAILY_PAINTING_TTL_MS } from "@/lib/navigation-data";
import type { PaintingQuery, PaintingSummary } from "@/lib/types";

export function GalleryScreen() {
  const { sessionIdentity } = useSession();
  return <GalleryContent key={sessionIdentity.generation} />;
}

function GalleryContent() {
  const { token, status, sessionIdentity, signOutIfCurrent, isCurrentSession } = useSession();
  const { isFavorited, isFavoriteBusy, toggleFavorite: toggleSessionFavorite } = useFavorites();
  const authenticated = status === "authenticated" && Boolean(token);
  const [query, setQuery] = useState<PaintingQuery>(() => getGalleryFeedSnapshot(sessionIdentity.generation)?.query || INITIAL_GALLERY_QUERY);
  const [actionError, setError] = useState<string | null>(null);
  const loadDaily = useCallback((signal: AbortSignal) => api.dailyPainting(token, signal), [token]);
  const ready = status !== "loading";
  const catalog = useGalleryFeed(query, token, ready, sessionIdentity.generation);
  const recommendation = useReadResource(DAILY_PAINTING_KEY, loadDaily, ready, DAILY_PAINTING_TTL_MS);
  const { page, error: readError } = catalog;
  const loading = !ready || catalog.loading;
  const { data: daily, error: dailyError } = recommendation;
  const dailyLoading = !ready || recommendation.loading;
  const error = readError;
  const queryKey = galleryFeedKey(query);
  const viewKey = `${sessionIdentity.generation}:${queryKey}:${page?.orderDate || ""}`;
  const [presentation, setPresentation] = useState({ key: "", count: 0 });
  const onPrepared = useCallback((count: number) => setPresentation({ key: viewKey, count }), [viewKey]);
  const fetchedCount = catalog.batches.reduce((sum, batch) => sum + batch.length, 0);
  const displayedCount = presentation.key === viewKey ? Math.min(presentation.count, fetchedCount) : 0;
  const preparing = displayedCount < fetchedCount;
  const busy = loading || catalog.loadingMore || preparing;

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetGalleryViewport();
    const form = new FormData(event.currentTarget);
    setQuery({
      keyword: String(form.get("keyword") || "").trim(),
      dynasty: String(form.get("dynasty") || "").trim(),
      category: String(form.get("category") || "").trim(),
      author: String(form.get("author") || "").trim(),
      subject: String(form.get("subject") || "").trim(),
      sort: form.get("sort") as PaintingQuery["sort"],
      direction: form.get("direction") as PaintingQuery["direction"],
      page: 0,
      size: 12,
    });
  };

  const clearFilters = (form: HTMLFormElement) => {
    resetGalleryViewport();
    form.reset();
    setQuery({ ...INITIAL_GALLERY_QUERY });
  };

  const toggleFavorite = async (painting: PaintingSummary) => {
    if (!token) return;
    const requestIdentity = sessionIdentity;
    try {
      await toggleSessionFavorite(painting.paintingId, painting.favorited);
    } catch (caught) {
      if (!isCurrentSession(requestIdentity)) return;
      if (caught instanceof ApiError && caught.kind === "unauthorized") {
        signOutIfCurrent(requestIdentity);
        return;
      }
      setError(errorMessage(caught));
    }
  };

  return (
    <main className="page-shell module-page gallery-page">
      <ModuleHeader module="gallery">
        <span className="catalog-status">{page ? `${page.totalElements} 幅可浏览画作` : error ? "目录读取失败" : "正在读取目录"}</span>
      </ModuleHeader>

      <DailyPainting painting={daily} loading={dailyLoading} error={dailyError} onRetry={recommendation.retry} />

      <form key={queryKey} className="gallery-filters glass-panel" onSubmit={applyFilters}>
        <label className="filter-search"><span className="sr-only">关键词</span><SearchIcon /><input name="keyword" type="search" maxLength={200} placeholder="搜索作品、作者、风格或意境" defaultValue={query.keyword} /></label>
        <details>
          <summary>更多筛选</summary>
          <div className="filter-grid">
            <label><span>朝代</span><input name="dynasty" maxLength={512} defaultValue={query.dynasty} placeholder="输入朝代" /></label>
            <label><span>分类</span><input name="category" maxLength={512} defaultValue={query.category} placeholder="输入分类" /></label>
            <label><span>作者</span><input name="author" maxLength={512} defaultValue={query.author} placeholder="输入作者" /></label>
            <label><span>题材</span><input name="subject" maxLength={512} defaultValue={query.subject} placeholder="输入题材" /></label>
            <label><span>排序</span><select name="sort" defaultValue={query.sort}><option value="daily">每日换序</option><option value="source">目录顺序</option><option value="title">作品名</option><option value="author">作者</option><option value="dynasty">朝代</option></select></label>
            <label><span>方向</span><select name="direction" defaultValue={query.direction}><option value="asc">升序</option><option value="desc">降序</option></select></label>
          </div>
        </details>
        <div className="filter-actions"><button className="button button-primary" type="submit" aria-busy={loading}>{loading ? <PendingIndicator /> : null}检索画作</button><button className="button" type="button" onClick={(event) => clearFilters(event.currentTarget.form!)}>清除</button></div>
      </form>

      {actionError ? <p className="inline-error" role="alert">收藏操作未完成：{actionError} <button className="text-button" onClick={() => setError(null)}>关闭提示</button></p> : null}
      {loading ? page ? <LoadingStatus label="正在更新当前目录，暂保留已读取的结果" /> : <LoadingSection label="正在读取画作目录" onRetry={catalog.retry}><PaintingGridSkeleton count={6} rows /></LoadingSection> : null}
      {!loading && error ? <StatePanel kind="error" title="画作目录加载失败" description={`${error}${page ? " 当前保留同一查询上次成功读取的结果。" : ""}`} actionLabel="重新加载" onAction={() => { setError(null); catalog.retry(); }} /> : null}
      {!loading && !error && page && fetchedCount === 0 ? <StatePanel kind="empty" title="暂未找到匹配的作品" description="请尝试减少筛选条件或使用其他关键词。" /> : null}
      {catalog.notice ? <p className="gallery-notice" role="status">{catalog.notice}</p> : null}
      {fetchedCount ? (
          <GalleryRows key={viewKey} batches={catalog.batches} viewKey={viewKey} restoreReady={!dailyLoading} onPrepared={onPrepared}
            renderPainting={(painting, priority) => {
              const renderedPainting = { ...painting, favorited: isFavorited(painting.paintingId, painting.favorited) };
              return <PaintingCard painting={renderedPainting} authenticated={authenticated} favoriteBusy={isFavoriteBusy(painting.paintingId)} onFavorite={toggleFavorite} masonry priority={priority} />;
            }} />
      ) : null}
      {page && fetchedCount > 0 ? <section className="gallery-load-more" aria-label="画作加载" aria-busy={busy}>
        <p className="gallery-progress" role="status">已展示 {displayedCount} / {page.totalElements} 幅</p>
        {catalog.moreError ? <p className="inline-error" role="alert">{catalog.moreError} 已展示的画作仍保留。</p> : null}
        {page.hasNext ? <button className="button button-primary" type="button" disabled={busy} onClick={catalog.loadMore}>
          {busy ? <><PendingIndicator />正在加载…</> : catalog.moreError ? "重试加载" : <>加载更多画作 <span aria-hidden="true">↓</span></>}
        </button> : !busy ? <p className="gallery-end">已展示全部画作</p> : null}
      </section> : null}
    </main>
  );
}

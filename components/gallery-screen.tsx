"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";

import { DailyPaintingSkeleton, LoadingSection, LoadingStatus, PaintingGridSkeleton, PendingIndicator } from "@/components/loading";
import { useReadResource } from "@/components/use-read-resource";
import { ArrowIcon, SearchIcon } from "@/components/icons";
import { MediaImage } from "@/components/media-image";
import { PaintingCard } from "@/components/painting-card";
import { useFavorites } from "@/components/favorite-provider";
import { useSession } from "@/components/session-provider";
import { StatePanel } from "@/components/state-panel";
import { api, ApiError, errorMessage } from "@/lib/api";
import { INITIAL_GALLERY_QUERY, requireGalleryOrder, turnGalleryPage } from "@/lib/gallery-order";
import type { PaintingQuery, PaintingSummary } from "@/lib/types";

export function GalleryScreen() {
  const { sessionIdentity } = useSession();
  return <GalleryContent key={sessionIdentity.generation} />;
}

function GalleryContent() {
  const { token, status, sessionIdentity, signOutIfCurrent, isCurrentSession } = useSession();
  const { isFavorited, isFavoriteBusy, toggleFavorite: toggleSessionFavorite } = useFavorites();
  const authenticated = status === "authenticated" && Boolean(token);
  const [query, setQuery] = useState<PaintingQuery>(INITIAL_GALLERY_QUERY);
  const [actionError, setError] = useState<string | null>(null);
  const loadPage = useCallback(async (signal: AbortSignal) => {
    const result = await api.paintings(query, token, signal);
    requireGalleryOrder(query, result);
    return result;
  }, [query, token]);
  const loadDaily = useCallback((signal: AbortSignal) => api.dailyPainting(token, signal), [token]);
  const ready = status !== "loading";
  const catalog = useReadResource(JSON.stringify(query), loadPage, ready);
  const recommendation = useReadResource("daily", loadDaily, ready);
  const { data: page, error: readError } = catalog;
  const loading = !ready || catalog.loading;
  const { data: daily, error: dailyError } = recommendation;
  const dailyLoading = !ready || recommendation.loading;
  const error = readError;

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    form.reset();
    setQuery(INITIAL_GALLERY_QUERY);
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
    <main className="page-shell gallery-page">
      <header className="page-header glass-panel gallery-header">
        <div><h1>笔墨之间，自有天地</h1><p>从真实官方目录中检索作品、作者与画意</p></div>
        <span className="catalog-status">{page ? `${page.totalElements} 幅可浏览画作` : error ? "目录读取失败" : "正在读取目录"}</span>
      </header>

      <section className="daily-panel glass-panel" aria-labelledby="daily-title">
        <div className="daily-heading">
          <h2 id="daily-title">每日一画</h2><span aria-hidden="true">·</span>
          <time suppressHydrationWarning>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date())}</time>
        </div>
        {dailyLoading ? daily ? <LoadingStatus label="正在更新每日推荐，暂保留本次已读取的画作" /> : <LoadingSection label="正在选择今日画作" onRetry={recommendation.retry}><DailyPaintingSkeleton /></LoadingSection> : null}
        {!dailyLoading && dailyError ? <StatePanel compact kind="error" title="每日推荐暂不可用" description={`${dailyError}${daily ? " 当前保留上次成功读取的推荐。" : ""}`} actionLabel="重新读取推荐" onAction={recommendation.retry} /> : null}
        {daily ? (
          <Link className="daily-card content-reveal" href={`/gallery/${daily.paintingId}`}>
            <div className="daily-media"><MediaImage image={daily.image} alt={daily.title || "每日推荐画作"} /></div>
            <div className="daily-copy">
              <h3>{daily.title || "无题"}</h3>
              <p className="daily-meta">
                <span className="daily-author">{daily.authorName || "佚名"}</span><span aria-hidden="true">·</span>
                <span className="daily-dynasty">{daily.creationDynastyNormalized || daily.creationDynastyRaw || "年代未详"}</span>
              </p>
              {daily.artisticConception ? <p className="daily-description">{daily.artisticConception}</p> : null}
              <b>查看作品 <ArrowIcon /></b>
            </div>
          </Link>
        ) : null}
      </section>

      <form className="gallery-filters glass-panel" onSubmit={applyFilters}>
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
      {loading ? page ? <LoadingStatus label="正在更新当前目录，暂保留已读取的结果" /> : <LoadingSection label="正在读取画作目录" onRetry={catalog.retry}><PaintingGridSkeleton count={12} /></LoadingSection> : null}
      {!loading && error ? <StatePanel kind="error" title="画作目录加载失败" description={`${error}${page ? " 当前保留同一查询上次成功读取的结果。" : ""}`} actionLabel="重新加载" onAction={() => { setError(null); catalog.retry(); }} /> : null}
      {!loading && !error && page?.items.length === 0 ? <StatePanel kind="empty" title="暂未找到匹配的作品" description="请尝试减少筛选条件或使用其他关键词。" /> : null}
      {page?.items.length ? (
        <>
          <section className="painting-grid content-reveal" aria-label="画作目录">
            {page.items.map((painting) => {
              const renderedPainting = { ...painting, favorited: isFavorited(painting.paintingId, painting.favorited) };
              return <PaintingCard key={painting.paintingId} painting={renderedPainting} authenticated={authenticated} favoriteBusy={isFavoriteBusy(painting.paintingId)} onFavorite={toggleFavorite} />;
            })}
          </section>

        </>
      ) : null}
      <nav className="pagination" aria-label="画作分页">
        <button className="button" type="button" disabled={loading || !page || page.first} onClick={() => page && setQuery(current => turnGalleryPage(current, page, -1))}><ArrowIcon direction="left" /> 上一页</button>
        <span>{page ? `第 ${page.page + 1} / ${Math.max(page.totalPages, 1)} 页` : `第 ${(query.page || 0) + 1} 页${loading ? " · 读取中" : " · 暂不可用"}`}</span>
        <button className="button" type="button" disabled={loading || !page || page.last} onClick={() => page && setQuery(current => turnGalleryPage(current, page, 1))}>下一页 <ArrowIcon /></button>
      </nav>
    </main>
  );
}

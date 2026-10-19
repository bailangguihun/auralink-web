"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { ArrowIcon, SearchIcon } from "@/components/icons";
import { MediaImage } from "@/components/media-image";
import { PaintingCard } from "@/components/painting-card";
import { useFavorites } from "@/components/favorite-provider";
import { useSession } from "@/components/session-provider";
import { StatePanel } from "@/components/state-panel";
import { api, ApiError, errorMessage } from "@/lib/api";
import { INITIAL_GALLERY_QUERY, requireGalleryOrder, turnGalleryPage } from "@/lib/gallery-order";
import type { PaintingPage, PaintingQuery, PaintingSummary } from "@/lib/types";

export function GalleryScreen() {
  const { token, status, sessionIdentity, signOutIfCurrent, isCurrentSession } = useSession();
  const { isFavorited, isFavoriteBusy, toggleFavorite: toggleSessionFavorite } = useFavorites();
  const authenticated = status === "authenticated" && Boolean(token);
  const [query, setQuery] = useState<PaintingQuery>(INITIAL_GALLERY_QUERY);
  const [page, setPage] = useState<PaintingPage | null>(null);
  const [daily, setDaily] = useState<PaintingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dailyError, setDailyError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const requestIdentity = sessionIdentity;
    setLoading(true);
    setError(null);
    void api.paintings(query, token, controller.signal).then((result) => {
      if (!active || !isCurrentSession(requestIdentity)) return;
      requireGalleryOrder(query, result);
      setPage(result);
    }).catch((caught) => {
      if (active && isCurrentSession(requestIdentity)) setError(errorMessage(caught));
    }).finally(() => {
      if (active && isCurrentSession(requestIdentity)) setLoading(false);
    });
    return () => { active = false; controller.abort(); };
  }, [query, token, sessionIdentity, isCurrentSession]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const requestIdentity = sessionIdentity;
    setDailyLoading(true);
    setDailyError(null);
    void api.dailyPainting(token, controller.signal).then((result) => {
      if (active && isCurrentSession(requestIdentity)) setDaily(result);
    }).catch((caught) => {
      if (active && isCurrentSession(requestIdentity)) setDailyError(errorMessage(caught));
    }).finally(() => {
      if (active && isCurrentSession(requestIdentity)) setDailyLoading(false);
    });
    return () => { active = false; controller.abort(); };
  }, [token, sessionIdentity, isCurrentSession]);

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
      const favorited = await toggleSessionFavorite(painting.paintingId, painting.favorited);
      if (!isCurrentSession(requestIdentity)) return;
      const update = (item: PaintingSummary) => item.paintingId === painting.paintingId
        ? { ...item, favorited }
        : item;
      setPage((current) => current ? { ...current, items: current.items.map(update) } : current);
      setDaily((current) => current ? update(current) : current);
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
        <span className="catalog-status">{page ? `${page.totalElements} 幅可浏览画作` : "正在读取目录"}</span>
      </header>

      <section className="daily-panel glass-panel" aria-labelledby="daily-title">
        <div className="daily-heading"><div><span>今日画作</span><h2 id="daily-title">每日推荐</h2></div><time suppressHydrationWarning>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date())}</time></div>
        {dailyLoading ? <StatePanel compact kind="loading" title="正在选择今日画作" /> : null}
        {!dailyLoading && dailyError ? <StatePanel compact kind="error" title="每日推荐暂不可用" description={dailyError} /> : null}
        {!dailyLoading && daily ? (
          <Link className="daily-card" href={`/gallery/${daily.paintingId}`}>
            <div className="daily-media"><MediaImage image={daily.image} alt={daily.title || "每日推荐画作"} /></div>
            <div><span>{daily.creationDynastyNormalized || daily.creationDynastyRaw || "年代未详"}</span><h3>{daily.title || "无题"}</h3><p>{daily.authorName || "佚名"}{daily.artisticConception ? ` · ${daily.artisticConception}` : ""}</p><b>查看作品 <ArrowIcon /></b></div>
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
        <div className="filter-actions"><button className="button button-primary" type="submit">检索画作</button><button className="button" type="button" onClick={(event) => clearFilters(event.currentTarget.form!)}>清除</button></div>
      </form>

      {loading ? <StatePanel kind="loading" title="正在读取画作目录" /> : null}
      {!loading && error ? <StatePanel kind="error" title="画作目录加载失败" description={error} actionLabel="重新加载" onAction={() => setQuery({ ...query })} /> : null}
      {!loading && !error && page?.items.length === 0 ? <StatePanel kind="empty" title="暂未找到匹配的作品" description="请尝试减少筛选条件或使用其他关键词。" /> : null}
      {!loading && !error && page?.items.length ? (
        <>
          <section className="painting-grid" aria-label="画作目录">
            {page.items.map((painting) => {
              const renderedPainting = { ...painting, favorited: isFavorited(painting.paintingId, painting.favorited) };
              return <PaintingCard key={painting.paintingId} painting={renderedPainting} authenticated={authenticated} favoriteBusy={isFavoriteBusy(painting.paintingId)} onFavorite={toggleFavorite} />;
            })}
          </section>
          <nav className="pagination" aria-label="画作分页">
            <button className="button" type="button" disabled={page.first} onClick={() => setQuery((current) => turnGalleryPage(current, page, -1))}><ArrowIcon direction="left" /> 上一页</button>
            <span>第 {page.page + 1} / {Math.max(page.totalPages, 1)} 页</span>
            <button className="button" type="button" disabled={page.last} onClick={() => setQuery((current) => turnGalleryPage(current, page, 1))}>下一页 <ArrowIcon /></button>
          </nav>
        </>
      ) : null}
    </main>
  );
}

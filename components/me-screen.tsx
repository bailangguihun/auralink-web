"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { LoadingSection, LoadingStatus, PaintingGridSkeleton, Skeleton, SkeletonRows } from "@/components/loading";
import { useReadResource } from "@/components/use-read-resource";
import { useFavorites } from "@/components/favorite-provider";
import { PaintingCard } from "@/components/painting-card";
import { useSession } from "@/components/session-provider";
import { StatePanel } from "@/components/state-panel";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatProfileDate } from "@/lib/profile-contract";
import type { PaintingSummary } from "@/lib/types";

export function MeScreen() {
  const router = useRouter();
  const { token, user, profileVerified, sessionIdentity, signOut, signOutIfCurrent, isCurrentSession } = useSession();
  const { isFavorited, isFavoriteBusy, toggleFavorite } = useFavorites();
  const [pageNumber, setPageNumber] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const loadProfile = useCallback((signal: AbortSignal) => api.profile(token!, signal), [token]);
  const profileRead = useReadResource("profile", loadProfile, Boolean(token) && !profileVerified);
  const profile = profileVerified ? user : profileRead.data;
  const loadFavorites = useCallback((signal: AbortSignal) => api.favoritePaintings(pageNumber, 12, token!, signal), [pageNumber, token]);
  const favoriteRead = useReadResource(`favorites:${pageNumber}`, loadFavorites, Boolean(token));
  const favorites = favoriteRead.data;
  useEffect(() => {
    if (favorites && !favoriteRead.loading && favorites.items.length === 0 && pageNumber > 0) setPageNumber(value => value - 1);
  }, [favorites, favoriteRead.loading, pageNumber]);

  const handleError = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.kind === "unauthorized") signOutIfCurrent(sessionIdentity);
    setError(errorMessage(caught));
  }, [sessionIdentity, signOutIfCurrent]);

  const removeFavorite = async (painting: PaintingSummary) => {
    if (!token) return;
    const requestIdentity = sessionIdentity;
    setError(null);
    try {
      await toggleFavorite(painting.paintingId, isFavorited(painting.paintingId, painting.favorited));
      if (!isCurrentSession(requestIdentity)) return;
      favoriteRead.retry();
    } catch (caught) {
      if (!isCurrentSession(requestIdentity)) return;
      handleError(caught);
    }
  };

  const logout = () => {
    signOut();
    router.push("/");
  };

  const displayedFavorites = favorites?.items.filter(
    (painting) => isFavorited(painting.paintingId, painting.favorited),
  ) ?? [];

  return (
    <div className="me-layout">
      <aside className="me-sidebar glass-panel">
        {profile ? <><span className="me-avatar" aria-hidden="true">{(profile.fullName || profile.username).slice(0, 1)}</span>
        <h1>{profile.fullName || profile.username}</h1>
        <p>@{profile.username}</p>
        <dl>
          <div><dt>收藏</dt><dd>{favorites ? favorites.totalElements : favoriteRead.error ? "暂不可用" : "读取中"}</dd></div>
          <div><dt>账号 ID</dt><dd>{profile.id}</dd></div>
        </dl></> : profileRead.error ? <StatePanel compact kind="error" title="资料读取失败" description={profileRead.error} actionLabel="重新读取资料" onAction={profileRead.retry} /> : <LoadingSection label="正在读取个人资料" onRetry={profileRead.retry}><Skeleton className="skeleton-avatar" /><SkeletonRows /></LoadingSection>}
        <button className="button button-wide" type="button" onClick={logout}>退出登录</button>
      </aside>

      <div className="me-content">
        <section className="profile-panel glass-panel" aria-labelledby="profile-title">
          <div className="section-heading section-heading-left"><h2 id="profile-title">账号信息</h2><p>以下信息由当前登录用户接口返回。</p></div>
          {profile ? <dl className="profile-facts content-reveal">
            <div><dt>用户名</dt><dd>{profile.username}</dd></div>
            <div><dt>姓名</dt><dd>{profile.fullName || "未填写"}</dd></div>
            <div><dt>邮箱</dt><dd>{profile.email}</dd></div>
            {profile.createdAt ? <div><dt>注册时间</dt><dd>{formatProfileDate(profile.createdAt)}</dd></div> : null}
          </dl> : <SkeletonRows lines={4} />}
          <div className="profile-unavailable"><strong>资料与头像编辑</strong><span>暂未开放</span></div>
        </section>

        <section className="favorites-panel" aria-labelledby="favorites-title">
          <div className="section-heading section-heading-left"><h2 id="favorites-title">我的收藏</h2><p>取消收藏会立即调用真实后端并刷新列表。</p></div>
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
          {favoriteRead.error ? <StatePanel compact kind="error" title="收藏读取失败" description={`${favoriteRead.error}${favorites ? " 当前保留本页上次成功读取的收藏。" : ""}`} actionLabel="重新读取收藏" onAction={favoriteRead.retry} /> : null}
          {favoriteRead.loading ? favorites ? <LoadingStatus label="正在更新本页收藏，暂保留已读取内容" /> : <LoadingSection label="正在读取收藏" onRetry={favoriteRead.retry}><PaintingGridSkeleton personal count={6} /></LoadingSection> : null}
          {favorites && displayedFavorites.length ? (
            <>
              <div className="painting-grid me-painting-grid">
                {displayedFavorites
                  .map((painting) => <PaintingCard key={painting.paintingId} painting={{ ...painting, favorited: isFavorited(painting.paintingId, painting.favorited) }} authenticated favoriteBusy={isFavoriteBusy(painting.paintingId)} onFavorite={removeFavorite} />)}
              </div>

            </>
          ) : !favoriteRead.loading && !favoriteRead.error && favorites ? <StatePanel kind="empty" title="还没有收藏作品" description="去画廊发现喜欢的作品吧。" actionLabel="前往画廊" actionHref="/gallery" /> : null}
          <nav className="pagination" aria-label="收藏分页">
            <button className="button" disabled={favoriteRead.loading || !favorites || favorites.first} onClick={() => setPageNumber(value => Math.max(0, value - 1))}>上一页</button>
            <span>{favorites ? `第 ${favorites.page + 1} / ${Math.max(favorites.totalPages, 1)} 页` : `第 ${pageNumber + 1} 页 · ${favoriteRead.loading ? "读取中" : "暂不可用"}`}</span>
            <button className="button" disabled={favoriteRead.loading || !favorites || favorites.last} onClick={() => setPageNumber(value => value + 1)}>下一页</button>
          </nav>
        </section>

        <section className="me-unavailable-grid">
          <section className="me-creation-link glass-panel">
            <div><h2>我的作品</h2><p>真实 Creation 列表、状态与结果已在创作工坊接入。</p></div>
            <Link className="button" href="/studio">前往创作工坊</Link>
          </section>
          <StatePanel compact kind="unavailable" title="帖子与点赞" description="社区后端尚未开放。" />
        </section>
      </div>
    </div>
  );
}

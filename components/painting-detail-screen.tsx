"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ArtworkViewer } from "@/components/artwork-viewer";
import { DetailSkeleton, LoadingSection, Skeleton, SkeletonRows } from "@/components/loading";
import { ArrowIcon, HeartIcon } from "@/components/icons";
import { useFavorites } from "@/components/favorite-provider";
import { MediaImage } from "@/components/media-image";
import { PaintingInsights } from "@/components/painting-insights";
import { useSession } from "@/components/session-provider";
import { StatePanel } from "@/components/state-panel";
import { api, ApiError, errorMessage } from "@/lib/api";
import { getArtworkPreview, isArtworkFlightActive, waitForArtworkFlight, type ArtworkPreview } from "@/lib/artwork-flight";
import { resolveMediaUrl } from "@/lib/media";
import type { PaintingDetail, PaintingImage } from "@/lib/types";

/** Only reuse the public bitmap already displayed by this app, never a new media origin. */
function previewImage(preview: ArtworkPreview): PaintingImage | null {
  try {
    const path = new URL(preview.source).pathname;
    const match = /^\/api\/v1\/assets\/([0-9a-f-]{36})\/content$/i.exec(path);
    if (!match || resolveMediaUrl(path) !== preview.source) return null;
    return {
      assetId: match[1], mimeType: "", fileSize: null,
      width: preview.width, height: preview.height,
      contentUrl: path, downloadUrl: "",
    };
  } catch { return null; }
}

export function PaintingDetailScreen({ paintingId }: { paintingId: string }) {
  const { sessionIdentity } = useSession();
  return <PaintingDetailContent key={`${paintingId}:${sessionIdentity.generation}`} paintingId={paintingId} />;
}

function PaintingDetailContent({ paintingId }: { paintingId: string }) {
  const { token, sessionIdentity, signOutIfCurrent, isCurrentSession } = useSession();
  const { isFavorited, isFavoriteBusy, toggleFavorite: toggleSessionFavorite } = useFavorites();
  // This component is keyed by artwork and login generation. Keep its public
  // preview until the authoritative read settles, even after the flight ends.
  const [preview] = useState(() => {
    const value = getArtworkPreview(paintingId, sessionIdentity.generation);
    const image = value && previewImage(value);
    return value && image ? { ...value, image } : null;
  });
  const [painting, setPainting] = useState<PaintingDetail | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [textReady, setTextReady] = useState(() => !isArtworkFlightActive(`/gallery/${encodeURIComponent(paintingId)}`, sessionIdentity.generation));

  const handleAuthError = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.kind === "unauthorized") signOutIfCurrent(sessionIdentity);
  }, [sessionIdentity, signOutIfCurrent]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const request = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      await waitForArtworkFlight(`/gallery/${encodeURIComponent(paintingId)}`, sessionIdentity.generation, request.signal);
      if (!active || request.signal.aborted || !isCurrentSession(sessionIdentity)) return;
      setTextReady(true);
      const result = await api.painting(paintingId, token, request.signal);
      if (active && !request.signal.aborted && isCurrentSession(sessionIdentity)) setPainting(result);
    })().catch((caught) => {
      if (!active || request.signal.aborted || !isCurrentSession(sessionIdentity)) return;
      handleAuthError(caught);
      setError(errorMessage(caught));
    }).finally(() => {
      if (active && isCurrentSession(sessionIdentity)) setLoading(false);
    });
    return () => { active = false; request.abort(); };
  }, [attempt, handleAuthError, paintingId, token, isCurrentSession, sessionIdentity]);

  const toggleFavorite = async () => {
    if (!painting || !token) return;
    const requestIdentity = sessionIdentity;
    setError(null);
    try {
      const favorited = await toggleSessionFavorite(paintingId, isFavorited(paintingId, painting.favorited));
      if (isCurrentSession(requestIdentity)) setPainting((current) => current ? { ...current, favorited } : current);
    } catch (caught) {
      if (!isCurrentSession(requestIdentity)) return;
      if (caught instanceof ApiError && caught.kind === "unauthorized") {
        signOutIfCurrent(requestIdentity);
        return;
      }
      setError(errorMessage(caught));
    }
  };

  if (loading && !preview) return <div data-artwork-text-ready={String(textReady)} style={textReady ? undefined : { visibility: "hidden" }} aria-hidden={!textReady || undefined}><Link className="text-button" href="/gallery">返回画廊</Link><LoadingSection label="正在展开作品详情" onRetry={() => setAttempt(value => value + 1)}><DetailSkeleton /></LoadingSection></div>;
  if (!loading && error && !painting) return <><Link className="text-button" href="/gallery">返回画廊</Link><StatePanel kind="error" title="作品详情加载失败" description={error} actionLabel="重新读取作品" onAction={() => setAttempt(value => value + 1)} /></>;
  if (!painting && (!loading || !preview)) return <StatePanel kind="empty" title="作品不存在或当前不可用" actionLabel="返回画廊" actionHref="/gallery" />;

  const favorited = painting ? isFavorited(painting.paintingId, painting.favorited) : false;
  const title = painting ? painting.title || "无题" : preview!.title || "无题";
  const author = painting ? painting.authorName || "佚名" : preview!.author || "佚名";
  const period = painting ? painting.creationDynastyNormalized || painting.creationDynastyRaw || "年代未详" : preview!.period || "年代未详";
  const facts: Array<[string, string | null]> = painting ? [
    ["目录序号", painting.sourceSequence],
    ["图像标识", painting.imageStorageName],
    ["年代", painting.creationDynastyNormalized || painting.creationDynastyRaw],
    ["创作年代", painting.creationYear],
    ["作者生年", painting.authorBirthYear],
    ["作者籍贯", painting.authorBirthPlace],
    ["作者师承", painting.authorSchool],
    ["尺寸", painting.actualSize],
    ["馆藏", painting.collectionInstitution],
    ["分类", painting.category],
    ["题材", painting.subject],
    ["画派", painting.paintingSchool],
    ["风格", painting.style],
    ["材质", painting.paintingMaterial],
    ["设色", painting.color],
    ["构图", painting.composition],
    ["笔法", painting.brushwork],
    ["墨法", painting.inkMethod],
    ["颜料", painting.pigment],
    ["钤印", painting.seal],
    ["文化意象", painting.culturalSymbol],
    ["收藏平台", painting.collectionPlatform],
  ] : [];

  return (
    <div className="detail-layout" data-artwork-preview={!painting ? "true" : undefined} data-artwork-text-ready={String(textReady)}>
      <ArtworkViewer title={title} author={author} period={period} paintingId={paintingId} concealText={!textReady}
        image={<MediaImage image={painting ? painting.image : preview!.image} alt={title} />}
        error={painting ? error : null}
        actions={<>
          <Link className="button detail-back" data-artwork-return={paintingId} href="/gallery"><ArrowIcon direction="left" /> 返回画廊</Link>
          {painting ? <Link className="button" aria-label="引用作品发帖" href={"/community?paintingId=" + encodeURIComponent(painting.paintingId)}><span aria-hidden="true" className="detail-quote-mark">“</span>引用发帖</Link>
            : <button className="button" type="button" disabled aria-label="引用作品发帖"><span aria-hidden="true" className="detail-quote-mark">“</span>引用发帖</button>}
          <button className={`button detail-favorite${favorited ? " button-primary" : ""}`} type="button" aria-pressed={painting ? favorited : undefined} disabled={!painting || isFavoriteBusy(painting.paintingId)} onClick={toggleFavorite}><HeartIcon filled={favorited} /> {favorited ? "已收藏" : "收藏"}</button>
        </>} />

      <section className="detail-info glass-panel" aria-busy={!painting || undefined}>
        {painting ? <>
        <header><span>{painting.creationDynastyNormalized || painting.creationDynastyRaw || "年代未详"}</span><h1>{painting.title || "无题"}</h1><p>{painting.authorName || "佚名"}</p></header>
        {painting.generatedText ? <div className="detail-section"><h2>作品资料</h2><p>{painting.generatedText}</p></div> : null}
        <dl className="fact-grid">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "未详"}</dd></div>)}</dl>
        <PaintingInsights paintingId={painting.paintingId} imageAvailable={painting.imageAvailable && Boolean(painting.image)} />
        </> : <div style={textReady ? undefined : { visibility: "hidden" }} aria-hidden={!textReady || undefined}><LoadingSection label="正在读取作品资料" onRetry={() => setAttempt(value => value + 1)}><Skeleton className="skeleton-title" /><SkeletonRows lines={8} /></LoadingSection></div>}
      </section>
    </div>
  );
}

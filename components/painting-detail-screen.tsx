"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { DetailSkeleton, LoadingSection } from "@/components/loading";
import { ArrowIcon, HeartIcon } from "@/components/icons";
import { useFavorites } from "@/components/favorite-provider";
import { MediaImage } from "@/components/media-image";
import { PaintingInsights } from "@/components/painting-insights";
import { useSession } from "@/components/session-provider";
import { StatePanel } from "@/components/state-panel";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { PaintingDetail } from "@/lib/types";

export function PaintingDetailScreen({ paintingId }: { paintingId: string }) {
  const { sessionIdentity } = useSession();
  return <PaintingDetailContent key={`${paintingId}:${sessionIdentity.generation}`} paintingId={paintingId} />;
}

function PaintingDetailContent({ paintingId }: { paintingId: string }) {
  const { token, sessionIdentity, signOutIfCurrent, isCurrentSession } = useSession();
  const { isFavorited, isFavoriteBusy, toggleFavorite: toggleSessionFavorite } = useFavorites();
  const [painting, setPainting] = useState<PaintingDetail | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleAuthError = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.kind === "unauthorized") signOutIfCurrent(sessionIdentity);
  }, [sessionIdentity, signOutIfCurrent]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const request = new AbortController();
    setLoading(true);
    setError(null);
    void api.painting(paintingId, token, request.signal).then((result) => {
      if (active && isCurrentSession(sessionIdentity)) setPainting(result);
    }).catch((caught) => {
      if (!active) return;
      handleAuthError(caught);
      setError(errorMessage(caught));
    }).finally(() => {
      if (active) setLoading(false);
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

  if (loading) return <><Link className="text-button" href="/gallery">返回画廊</Link><LoadingSection label="正在展开作品详情" onRetry={() => setAttempt(value => value + 1)}><DetailSkeleton /></LoadingSection></>;
  if (error && !painting) return <StatePanel kind="error" title="作品详情加载失败" description={error} actionLabel="重新读取作品" onAction={() => setAttempt(value => value + 1)} />;
  if (!painting) return <StatePanel kind="empty" title="作品不存在或当前不可用" actionLabel="返回画廊" actionHref="/gallery" />;

  const favorited = isFavorited(painting.paintingId, painting.favorited);
  const facts: Array<[string, string | null]> = [
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
  ];

  return (
    <div className="detail-layout">
      <section className="detail-artwork">
        <div className="detail-media glass-panel"><MediaImage image={painting.image} alt={painting.title || "无题画作"} /></div>
        <div className="detail-actions">
          <Link className="button" href="/gallery"><ArrowIcon direction="left" /> 返回画廊</Link>
          <Link className="button" href={"/community?paintingId=" + encodeURIComponent(painting.paintingId)}>引用作品发帖</Link>
          <button className={`button${favorited ? " button-primary" : ""}`} type="button" disabled={isFavoriteBusy(painting.paintingId)} onClick={toggleFavorite}><HeartIcon filled={favorited} /> {favorited ? "已收藏" : "收藏"}</button>
        </div>
        {error ? <p className="inline-error" role="alert">{error}</p> : null}
      </section>

      <section className="detail-info glass-panel">
        <header><span>{painting.creationDynastyNormalized || painting.creationDynastyRaw || "年代未详"}</span><h1>{painting.title || "无题"}</h1><p>{painting.authorName || "佚名"}</p></header>
        {painting.generatedText ? <div className="detail-section"><h2>作品资料</h2><p>{painting.generatedText}</p></div> : null}
        <dl className="fact-grid">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "未详"}</dd></div>)}</dl>
        <PaintingInsights paintingId={painting.paintingId} imageAvailable={painting.imageAvailable && Boolean(painting.image)} />
      </section>
    </div>
  );
}

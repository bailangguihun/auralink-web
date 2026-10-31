"use client";

import Link from "next/link";

import { ArrowIcon } from "@/components/icons";
import { DailyPaintingSkeleton, LoadingSection, LoadingStatus } from "@/components/loading";
import { MediaImage } from "@/components/media-image";
import type { PaintingSummary } from "@/lib/types";

type DailyPaintingProps = {
  painting: PaintingSummary | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" });

function DailyHeading() {
  return <div className="daily-heading">
    <h2>每日一画</h2><span aria-hidden="true">·</span>
    <time suppressHydrationWarning>{dateFormatter.format(new Date())}</time>
  </div>;
}

/** Presentation only: the gallery retains ownership of the independent daily request. */
export function DailyPainting({ painting, loading, error, onRetry }: DailyPaintingProps) {
  const title = painting?.title || "无题";

  return <section className="daily-panel glass-panel" aria-label="每日一画">
    {painting ? (
      <Link className="daily-card content-reveal" href={`/gallery/${painting.paintingId}`} prefetch={false} aria-label={`查看${title}详情`}>
        <div className="daily-media"><MediaImage image={painting.image} alt={title} loading="eager" /></div>
        <div className="daily-copy">
          <DailyHeading />
          <h3 title={title}>{title}</h3>
          <p className="daily-meta">
            <span className="daily-author">{painting.authorName || "佚名"}</span><span aria-hidden="true">·</span>
            <span className="daily-dynasty">{painting.creationDynastyNormalized || painting.creationDynastyRaw || "年代未详"}</span>
          </p>
          {painting.artisticConception ? <p className="daily-description">{painting.artisticConception}</p> : null}
          <b className="daily-action">查看作品 <ArrowIcon /></b>
        </div>
      </Link>
    ) : loading ? (
      <LoadingSection label="正在选择今日画作" onRetry={onRetry}><DailyPaintingSkeleton /></LoadingSection>
    ) : (
      <div className="daily-card">
        <div className="daily-media" aria-hidden="true"><div className="media-fallback"><span>画</span></div></div>
        <div className="daily-copy daily-state-copy">
          <DailyHeading />
          <h3>{error ? "每日推荐暂不可用" : "暂未读取到今日画作"}</h3>
          {error ? <p className="daily-error" role="alert">{error}</p> : null}
          {onRetry ? <button className="button daily-retry" type="button" onClick={onRetry}>重新读取推荐</button> : null}
        </div>
      </div>
    )}
    {painting && loading ? <div className="daily-notice"><LoadingStatus label="正在更新每日推荐，暂保留本次已读取的画作" onRetry={onRetry} /></div> : null}
    {painting && !loading && error ? <div className="daily-notice">
      <p role="alert">{error} 当前保留上次成功读取的推荐。</p>
      {onRetry ? <button className="button" type="button" onClick={onRetry}>重新读取推荐</button> : null}
    </div> : null}
  </section>;
}

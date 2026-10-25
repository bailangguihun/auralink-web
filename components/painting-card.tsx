import Link from "next/link";

import { PendingIndicator } from "@/components/loading";
import { HeartIcon } from "@/components/icons";
import { MediaImage } from "@/components/media-image";
import type { PaintingSummary } from "@/lib/types";

type PaintingCardProps = {
  painting: PaintingSummary;
  authenticated: boolean;
  favoriteBusy?: boolean;
  onFavorite?: (painting: PaintingSummary) => void;
};

export function PaintingCard({ painting, authenticated, favoriteBusy, onFavorite }: PaintingCardProps) {
  const detailPath = `/gallery/${painting.paintingId}`;
  return (
    <article className="painting-card glass-panel">
      <Link className="painting-media" href={detailPath} aria-label={`查看${painting.title || "无题"}详情`}>
        <MediaImage image={painting.image} alt={painting.title || "无题画作"} />
      </Link>
      <div className="painting-copy">
        <div>
          <Link href={detailPath}><h3>{painting.title || "无题"}</h3></Link>
          <p>{painting.authorName || "佚名"} · {painting.creationDynastyNormalized || painting.creationDynastyRaw || "年代未详"}</p>
        </div>
        {authenticated && onFavorite ? (
          <button
            className={`favorite-button${painting.favorited ? " is-favorited" : ""}`}
            type="button"
            aria-label={painting.favorited ? `取消收藏${painting.title || "画作"}` : `收藏${painting.title || "画作"}`}
            aria-pressed={painting.favorited}
            disabled={favoriteBusy}
            aria-busy={favoriteBusy}
            onClick={() => onFavorite(painting)}
          >
            {favoriteBusy ? <PendingIndicator /> : <HeartIcon filled={painting.favorited} />}
          </button>
        ) : (
          <Link className="favorite-button" href={`/login?next=${encodeURIComponent(detailPath)}`} aria-label="登录后收藏"><HeartIcon /></Link>
        )}
      </div>
      <div className="painting-meta">
        {painting.category ? <span>{painting.category}</span> : null}
        {painting.subject ? <span>{painting.subject}</span> : null}
        {painting.style ? <span>{painting.style}</span> : null}
      </div>
    </article>
  );
}

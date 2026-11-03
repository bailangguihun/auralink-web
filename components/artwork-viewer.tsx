import type { ReactNode } from "react";

export type ArtworkViewerProps = {
  title: string;
  author: string;
  period: string;
  paintingId?: string;
  image: ReactNode;
  actions: ReactNode;
  error?: string | null;
};

/** Presentation only: the real detail and its transition measurement share geometry. */
export function ArtworkViewer({ title, author, period, paintingId, image, actions, error }: ArtworkViewerProps) {
  return (
    <section className="detail-artwork" aria-label="作品观赏与操作">
      <header className="detail-viewer-heading">
        <h2 title={title}>{title}</h2>
        <p title={[author, period].join(" · ")}>
          {author}<span aria-hidden="true"> · </span>{period}
        </p>
      </header>
      <div className="detail-media" data-artwork-target={paintingId}>{image}</div>
      <div className="detail-actions">{actions}</div>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
    </section>
  );
}

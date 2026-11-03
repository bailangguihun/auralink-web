import type { ReactNode } from "react";

export type ArtworkViewerProps = {
  title: string;
  author: string;
  period: string;
  paintingId?: string;
  image: ReactNode;
  actions: ReactNode;
  error?: string | null;
  concealText?: boolean;
};

/** Presentation only: the real detail and its transition measurement share geometry. */
export function ArtworkViewer({ title, author, period, paintingId, image, actions, error, concealText = false }: ArtworkViewerProps) {
  const textStyle = concealText ? { visibility: "hidden" as const } : undefined;
  return (
    <section className="detail-artwork" aria-label="作品观赏与操作">
      <header className="detail-viewer-heading" style={textStyle} aria-hidden={concealText || undefined}>
        <h2 title={title}>{title}</h2>
        <p title={[author, period].join(" · ")}>
          {author}<span aria-hidden="true"> · </span>{period}
        </p>
      </header>
      <div className="detail-media" data-artwork-target={paintingId}>{image}</div>
      <div className="detail-actions" style={textStyle} aria-hidden={concealText || undefined}>{actions}</div>
      {error ? <p className="inline-error" role="alert" style={textStyle} aria-hidden={concealText || undefined}>{error}</p> : null}
    </section>
  );
}

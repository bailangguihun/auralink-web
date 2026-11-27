"use client";

import { useState, type CSSProperties } from "react";

import { resolveCatalogThumbnailUrl, resolveMediaUrl, resolveResponsiveCatalogThumbnail } from "@/lib/media";
import { artworkAspectRatio } from "@/lib/masonry-layout";
import type { PaintingImage } from "@/lib/types";

type MediaImageProps = {
  image: PaintingImage | null;
  alt: string;
  className?: string;
  layout?: "fixed" | "artwork";
  loading?: "eager" | "lazy";
  thumbnailOnly?: boolean;
  highPriority?: boolean;
  retryThumbnail?: boolean;
  previewSizes?: string;
  onFailure?: () => void;
};

export function MediaImage({ image, alt, className, layout = "fixed", loading, thumbnailOnly = false, highPriority = false, retryThumbnail = false, previewSizes, onFailure }: MediaImageProps) {
  const [failedCompact, setFailedCompact] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [readySource, setReadySource] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ source: string; width: number; height: number } | null>(null);
  const originalSource = resolveMediaUrl(image?.contentUrl);
  const source = thumbnailOnly ? resolveCatalogThumbnailUrl(image) : originalSource;
  const responsive = thumbnailOnly && previewSizes ? resolveResponsiveCatalogThumbnail(image) : null;
  const srcSet = responsive && responsive.small !== failedCompact ? responsive.srcSet : undefined;
  const failed = !source || failedSource === source;
  const size = dimensions?.source === source ? dimensions : image;
  const naturalRatio = size?.width && size.height && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
    ? size.width / size.height : 4 / 3;
  const content = failed ? (
    <div className={`media-fallback${className ? ` ${className}` : ""}`}>
      <span role="img" aria-label={`${alt}：图像暂不可用`}>画</span>
      <small>图像暂不可用</small>
      {thumbnailOnly && retryThumbnail && source ? <button type="button" className="text-button media-retry" onClick={() => setFailedSource(null)}>重试缩略图</button> : null}
    </div>
  ) : (
  // The backend returns public logical MediaAsset URLs. A native image element
  // keeps the API origin dynamic without allowing arbitrary remote hosts.
    <img key={source} className={`${className || ""} ${readySource === source ? "content-reveal" : "media-loading"}`} sizes={srcSet ? previewSizes : undefined} srcSet={srcSet} src={source} data-artwork-original={thumbnailOnly ? originalSource ?? undefined : undefined} width={image?.width || undefined} height={image?.height || undefined} alt={alt} loading={loading} fetchPriority={highPriority ? "high" : undefined} decoding="async" onLoad={event => {
      setReadySource(source);
      if (layout === "artwork") setDimensions({ source, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
    }} onError={event => {
      if (responsive && srcSet && event.currentTarget.currentSrc === responsive.small) {
        setFailedCompact(responsive.small);
        return;
      }
      setFailedSource(source);
      onFailure?.();
    }} />
  );

  return layout === "artwork" ? <div className="artwork-preview" style={{ "--artwork-aspect-ratio": artworkAspectRatio(size?.width, size?.height), "--artwork-natural-ratio": naturalRatio } as CSSProperties} data-image-state={failed ? "failed" : readySource === source ? "ready" : "loading"}>
    {failed ? content : <div className="artwork-image-crop">{content}</div>}
  </div> : content;
}

/** The current detail owns this eager request. Keep the existing preview visible until decode completes. */
export function ArtworkDetailImage({ image, preview, alt }: {
  image: PaintingImage | null;
  preview?: PaintingImage;
  alt: string;
}) {
  const [original, setOriginal] = useState<{ source: string; state: "ready" | "failed" } | null>(null);
  const source = resolveMediaUrl(image?.contentUrl);
  const thumbnail = preview && preview.assetId === (image ?? preview).assetId && resolveCatalogThumbnailUrl(preview)
    ? preview : resolveCatalogThumbnailUrl(image) ? image : null;
  const state = original?.source === source ? original?.state : undefined;
  const showPreview = thumbnail !== null && state !== "ready";
  return <>
    {showPreview || !source || state === "failed" ? <MediaImage key="preview" image={thumbnail} thumbnailOnly alt={alt} /> : null}
    {source && state === "failed" ? <div className="detail-image-retry">
      <span role="status">高清图暂不可用</span>
      <button type="button" className="text-button" onClick={() => setOriginal(null)}>重试高清图</button>
    </div> : source ? <img key={source} src={source} alt={alt} decoding="async" fetchPriority="high"
      hidden={showPreview} onLoad={event => {
        const image = event.currentTarget;
        void image.decode().then(() => {
          if (image.isConnected) setOriginal({ source, state: "ready" });
        }, () => {
          if (image.isConnected) setOriginal({ source, state: "failed" });
        });
      }} onError={() => setOriginal({ source, state: "failed" })} /> : null}
  </>;
}

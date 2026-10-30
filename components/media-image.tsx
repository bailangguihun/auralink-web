"use client";

import { useState, type CSSProperties } from "react";

import { resolveMediaUrl } from "@/lib/media";
import { artworkAspectRatio } from "@/lib/masonry-layout";
import type { PaintingImage } from "@/lib/types";

type MediaImageProps = {
  image: PaintingImage | null;
  alt: string;
  className?: string;
  layout?: "fixed" | "artwork";
  loading?: "eager" | "lazy";
};

export function MediaImage({ image, alt, className, layout = "fixed", loading }: MediaImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [readySource, setReadySource] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ source: string; width: number; height: number } | null>(null);
  const source = resolveMediaUrl(image?.contentUrl);
  const failed = !source || failedSource === source;
  const size = dimensions?.source === source ? dimensions : image;
  const naturalRatio = size?.width && size.height && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
    ? size.width / size.height : 4 / 3;
  const content = failed ? (
      <div className={`media-fallback${className ? ` ${className}` : ""}`} role="img" aria-label={`${alt}：图像暂不可用`}>
        <span aria-hidden="true">画</span>
        <small>图像暂不可用</small>
      </div>
    ) : (
  // The backend returns public logical MediaAsset URLs. A native image element
  // keeps the API origin dynamic without allowing arbitrary remote hosts.
    <img key={source} className={`${className || ""} ${readySource === source ? "content-reveal" : "media-loading"}`} src={source} width={image?.width || undefined} height={image?.height || undefined} alt={alt} loading={loading} decoding="async" onLoad={event => {
      setReadySource(source);
      if (layout === "artwork") setDimensions({ source, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
    }} onError={() => setFailedSource(source)} />
  );

  return layout === "artwork" ? <div className="artwork-preview" style={{ "--artwork-aspect-ratio": artworkAspectRatio(size?.width, size?.height), "--artwork-natural-ratio": naturalRatio } as CSSProperties} data-image-state={failed ? "failed" : readySource === source ? "ready" : "loading"}>
    {failed ? content : <div className="artwork-image-crop">{content}</div>}
  </div> : content;
}

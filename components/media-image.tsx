"use client";

import { useState } from "react";

import { resolveMediaUrl } from "@/lib/media";
import type { PaintingImage } from "@/lib/types";

type MediaImageProps = {
  image: PaintingImage | null;
  alt: string;
  className?: string;
};

export function MediaImage({ image, alt, className }: MediaImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [readySource, setReadySource] = useState<string | null>(null);
  const source = resolveMediaUrl(image?.contentUrl);


  if (!source || failedSource === source) {
    return (
      <div className={`media-fallback${className ? ` ${className}` : ""}`} role="img" aria-label={`${alt}：图像暂不可用`}>
        <span aria-hidden="true">画</span>
        <small>图像暂不可用</small>
      </div>
    );
  }

  // The backend returns public logical MediaAsset URLs. A native image element
  // keeps the API origin dynamic without allowing arbitrary remote hosts.
  return <img key={source} className={`${className || ""} ${readySource === source ? "content-reveal" : "media-loading"}`} src={source} width={image?.width || undefined} height={image?.height || undefined} alt={alt} decoding="async" onLoad={() => setReadySource(source)} onError={() => setFailedSource(source)} />;
}

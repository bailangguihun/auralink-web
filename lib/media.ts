import { API_BASE_URL } from "./config.ts";
import type { PaintingImage } from "./types.ts";

const ASSISTANT_MEDIA_PATH = /^\/api\/v1\/assistant\/attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/content$/i;

const LOGICAL_MEDIA_PATH = /^\/api\/v1\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(content|download)$/i;

export function resolveMediaUrl(value: string | null | undefined): string | null {
  if (!value || (!LOGICAL_MEDIA_PATH.test(value) && !ASSISTANT_MEDIA_PATH.test(value))) {
    return null;
  }

  return `${API_BASE_URL}${value}`;
}

const CATALOG_THUMBNAIL_PATH = /^\/api\/v1\/assets\/public-catalog-thumbnails\/v1\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{64}\.jpg$/;

export function resolveCatalogThumbnailUrl(image: Pick<PaintingImage, "assetId" | "contentUrl" | "thumbnailUrl"> | null | undefined): string | null {
  if (!image?.thumbnailUrl) return null;
  const match = CATALOG_THUMBNAIL_PATH.exec(image.thumbnailUrl);
  if (!match || match[1] !== image.assetId || image.contentUrl !== `/api/v1/assets/${image.assetId}/content`) return null;
  return `${API_BASE_URL}${image.thumbnailUrl}`;
}

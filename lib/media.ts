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

const CATALOG_THUMBNAIL_PATH = /^\/api\/v1\/assets\/public-catalog-thumbnails\/(v1|v2|v2\/480)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{64})\.jpg$/;

export function resolveCatalogThumbnailUrl(image: Pick<PaintingImage, "assetId" | "contentUrl" | "thumbnailUrl" | "previewUrl"> | null | undefined): string | null {
  if (!image || image.contentUrl !== `/api/v1/assets/${image.assetId}/content`) return null;
  const path = [image.previewUrl, image.thumbnailUrl].find(candidate =>
    candidate && CATALOG_THUMBNAIL_PATH.exec(candidate)?.[2] === image.assetId);
  return path ? `${API_BASE_URL}${path}` : null;
}

export function resolveResponsiveCatalogThumbnail(image: Pick<PaintingImage, "assetId" | "contentUrl" | "previewUrl" | "smallPreviewUrl" | "width" | "height"> | null) {
  if (!image || image.contentUrl !== `/api/v1/assets/${image.assetId}/content`) return null;
  const { width, height, previewUrl, smallPreviewUrl } = image;
  if (!width || !height || width < 0 || height < 0 || !Number.isInteger(width) || !Number.isInteger(height) || !previewUrl || !smallPreviewUrl) return null;
  const standard = CATALOG_THUMBNAIL_PATH.exec(previewUrl);
  const compact = CATALOG_THUMBNAIL_PATH.exec(smallPreviewUrl);
  if (standard?.[1] !== "v2" || compact?.[1] !== "v2/480" ||
      standard[2] !== image.assetId || compact[2] !== image.assetId || standard[3] !== compact[3]) return null;

  // Width descriptors are the encoded widths. The service caps the longest side.
  const longSide = Math.max(width, height);
  const compactWidth = Math.max(1, Math.round(width * Math.min(1, 480 / longSide)));
  const standardWidth = Math.max(1, Math.round(width * Math.min(1, 720 / longSide)));
  if (compactWidth === standardWidth) return null;
  const small = `${API_BASE_URL}${smallPreviewUrl}`;
  return { small, srcSet: `${small} ${compactWidth}w, ${API_BASE_URL}${previewUrl} ${standardWidth}w` };
}

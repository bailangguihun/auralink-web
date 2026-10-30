/** Full artwork previews, with bounded frames for exceptionally long scrolls. */
export function artworkAspectRatio(width?: number | null, height?: number | null): number {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 4 / 3;
  return Math.max(1 / 2.2, Math.min(2.5, width / height));
}

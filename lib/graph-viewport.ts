export type GraphPoint = readonly [number, number];

/** Fit node centers with room for symbols; never derive zoom from label counts. */
export function graphViewportFit(points: readonly GraphPoint[], width: number, height: number, zoom: number) {
  if (width < 80 || height < 80 || !points.length || !Number.isFinite(zoom) || zoom <= 0) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (!Number.isFinite(left)) return null;
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
  const factor = Math.min((width - 80) / Math.max(1, right - left), (height - 80) / Math.max(1, bottom - top));
  const nextZoom = Math.min(8, Math.max(0.01, zoom * factor));
  return { factor: nextZoom / zoom, centerX, centerY, dx: width / 2 - centerX, dy: height / 2 - centerY };
}

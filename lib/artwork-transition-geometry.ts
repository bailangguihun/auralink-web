export type ArtworkRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ArtworkMotionPose = { transform: string; clipPath: string };
export type ArtworkMotionPlan = {
  width: number;
  height: number;
  from: ArtworkMotionPose;
  to: ArtworkMotionPose;
};

function isUsableRect(rect: ArtworkRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0 &&
    Number.isFinite(rect.left + rect.width) &&
    Number.isFinite(rect.top + rect.height)
  );
}

/** The bitmap's painted bounds within an image box with centered object-position. */
export function fitArtworkRect(
  box: ArtworkRect,
  naturalWidth: number,
  naturalHeight: number,
  fit: "contain" | "cover" | "fill",
): ArtworkRect | null {
  if (
    !isUsableRect(box) ||
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }

  if (fit === "fill") {
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  }

  const scale = fit === "cover"
    ? Math.max(box.width / naturalWidth, box.height / naturalHeight)
    : Math.min(box.width / naturalWidth, box.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const painted = {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };

  return isUsableRect(painted) ? painted : null;
}

/** Clips a painted image to all of its visible ancestor and viewport bounds. */
export function intersectArtworkRects(rects: readonly ArtworkRect[]): ArtworkRect | null {
  if (!rects.length || rects.some((rect) => !isUsableRect(rect))) return null;

  let left = rects[0].left;
  let top = rects[0].top;
  let right = rects[0].left + rects[0].width;
  let bottom = rects[0].top + rects[0].height;

  for (const rect of rects.slice(1)) {
    left = Math.max(left, rect.left);
    top = Math.max(top, rect.top);
    right = Math.min(right, rect.left + rect.width);
    bottom = Math.min(bottom, rect.top + rect.height);
  }

  const intersection = { left, top, width: right - left, height: bottom - top };
  return isUsableRect(intersection) ? intersection : null;
}

/** A fixed-size bitmap plane moved and cropped without per-frame layout changes.
 * The larger endpoint is the raster basis in either direction. Only uniform
 * scaling is allowed; tiny measured-ratio differences may arise from rounding.
 */
export function artworkMotionPlan(
  fromBitmap: ArtworkRect,
  fromFrame: ArtworkRect,
  toBitmap: ArtworkRect,
  toFrame: ArtworkRect,
): ArtworkMotionPlan | null {
  if (![fromBitmap, fromFrame, toBitmap, toFrame].every(isUsableRect)) return null;
  const fromRatio = fromBitmap.width / fromBitmap.height;
  const toRatio = toBitmap.width / toBitmap.height;
  if (!Number.isFinite(fromRatio) || !Number.isFinite(toRatio) || fromRatio <= 0 || toRatio <= 0
    || Math.abs(fromRatio - toRatio) / Math.max(fromRatio, toRatio) > .001) return null;

  const basis = fromBitmap.width >= toBitmap.width ? fromBitmap : toBitmap;
  const width = basis.width;
  const height = basis.height;
  const pose = (bitmap: ArtworkRect, frame: ArtworkRect): ArtworkMotionPose | null => {
    const scale = bitmap.width / width;
    if (!Number.isFinite(scale) || scale <= 0) return null;
    // Clip to the uniformly projected plane as well as the measured bitmap.
    const projected = { left: bitmap.left, top: bitmap.top, width: bitmap.width, height: height * scale };
    const clip = intersectArtworkRects([bitmap, frame, projected]);
    if (!clip) return null;
    const insets = [
      (clip.top - bitmap.top) / scale,
      width - (clip.left + clip.width - bitmap.left) / scale,
      height - (clip.top + clip.height - bitmap.top) / scale,
      (clip.left - bitmap.left) / scale,
    ].map(value => Math.max(0, value));
    if (insets.some(value => !Number.isFinite(value))) return null;
    return {
      transform: `translate3d(${bitmap.left}px, ${bitmap.top}px, 0) scale(${scale})`,
      clipPath: `inset(${insets.map(value => `${value}px`).join(" ")})`,
    };
  };
  const from = pose(fromBitmap, fromFrame);
  const to = pose(toBitmap, toFrame);
  return from && to ? { width, height, from, to } : null;
}

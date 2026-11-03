// One decorative viewport, retained only by the current artwork origin. This is
// not a mounted gallery: it has no navigation, listeners, reads or form actions.
const MAX_GROUPS = 24;
const MAX_NODES = 1_800;
const MAX_CANVAS_PIXELS = 4_000_000;
const GROUPS = ".module-header, .daily-panel, .gallery-filters, .gallery-row-item, .gallery-load-more, .gallery-notice";
const OMIT = new Set(["script", "style", "link", "meta", "iframe", "object", "embed", "audio", "video", "source", "track", "canvas", "image", "use"]);
const VISUAL_ATTRIBUTES = new Set([
  "class", "hidden", "width", "height", "type", "placeholder", "checked", "selected", "disabled", "open",
  "aria-pressed", "data-image-state", "viewBox", "fill", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "d", "points", "cx", "cy", "r", "x", "y", "x1", "x2", "y1", "y2", "rx", "ry",
  "fill-rule", "clip-rule", "preserveAspectRatio",
]);
// An IMG selector does not style a CANVAS. Freeze the replaced element's layout
// and paint properties explicitly while retaining its parent's crop window.
const IMAGE_STYLES = [
  "display", "position", "inset", "top", "right", "bottom", "left", "box-sizing",
  "width", "height", "min-width", "min-height", "max-width", "max-height", "aspect-ratio",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top", "border-right", "border-bottom", "border-left", "border-radius", "box-shadow",
  "transform", "transform-origin", "translate", "rotate", "scale", "clip-path", "opacity", "visibility", "filter",
  "vertical-align", "align-self", "justify-self", "grid-area", "order", "flex", "z-index",
];

/** Freeze the displayed bitmap synchronously. A new IMG with the same URL can
 * still paint empty while reloading/decoding, even though its source is ready.
 * Canvas may be cross-origin tainted; it is displayed only, never read/exported.
 */
export function captureArtworkBitmap(source: HTMLImageElement): HTMLCanvasElement | null {
  if (!source.complete || !source.naturalWidth || !source.naturalHeight) return null;
  const scale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (source.naturalWidth * source.naturalHeight)),
    8192 / Math.max(source.naturalWidth, source.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.floor(source.naturalHeight * scale));
  try {
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch { return null; }
}

function imageContentSize(image: HTMLImageElement, style: CSSStyleDeclaration) {
  const pixels = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0;
  const horizontal = pixels("padding-left") + pixels("padding-right");
  const vertical = pixels("padding-top") + pixels("padding-bottom");
  let width = Number.parseFloat(style.width);
  let height = Number.parseFloat(style.height);
  if (!Number.isFinite(width)) width = image.clientWidth - horizontal;
  else if (style.boxSizing === "border-box") width -= horizontal + pixels("border-left-width") + pixels("border-right-width");
  if (!Number.isFinite(height)) height = image.clientHeight - vertical;
  else if (style.boxSizing === "border-box") height -= vertical + pixels("border-top-width") + pixels("border-bottom-width");
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

function objectOffset(value: string, available: number) {
  if (value === "left" || value === "top") return 0;
  if (value === "right" || value === "bottom") return available;
  if (value === "center") return available / 2;
  if (value.endsWith("%")) return available * (Number.parseFloat(value) || 0) / 100;
  if (value.endsWith("px")) return Number.parseFloat(value) || 0;
  return available / 2;
}

/** Capture only already painted public gallery groups intersecting this viewport.
 * The returned DIV uses viewport coordinates and must be placed in the fixed
 * scene below the top bar. Its gallery-page class is styling context only;
 * real gallery discovery must use main.gallery-page or its readiness marker.
 */
export function captureGalleryScene(gallery: HTMLElement, movingSource: HTMLImageElement): HTMLDivElement | null {
  if (!gallery.isConnected || !gallery.contains(movingSource)) return null;
  const top = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  const groups: { source: HTMLElement; rect: DOMRect }[] = [];
  for (const source of gallery.querySelectorAll<HTMLElement>(GROUPS)) {
    const rect = source.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= top || rect.top >= height || rect.right <= 0 || rect.left >= width) continue;
    const style = getComputedStyle(source);
    if (style.visibility !== "visible" || style.display === "none") continue;
    if (groups.length === MAX_GROUPS) return null;
    groups.push({ source, rect });
  }
  if (!groups.length) return null;

  const bitmaps = new Map<HTMLImageElement, { style: CSSStyleDeclaration; width: number; height: number }>();
  let contentPixels = 0;
  for (const { source } of groups) {
    for (const image of source.querySelectorAll("img")) {
      if (image === movingSource || !image.complete || !image.naturalWidth) continue;
      const rect = image.getBoundingClientRect();
      if (rect.bottom <= top || rect.top >= height || rect.right <= 0 || rect.left >= width) continue;
      const style = getComputedStyle(image);
      if (style.visibility !== "visible" || style.display === "none") continue;
      const size = imageContentSize(image, style);
      if (!size.width || !size.height) continue;
      bitmaps.set(image, { style, ...size });
      contentPixels += size.width * size.height;
    }
  }
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, contentPixels)));
  let remainingPixels = MAX_CANVAS_PIXELS;
  const copyBitmap = (source: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    const bitmap = bitmaps.get(source);
    const style = bitmap?.style || getComputedStyle(source);
    for (const property of IMAGE_STYLES) {
      const value = style.getPropertyValue(property);
      if (!/url\s*\(/i.test(value)) canvas.style.setProperty(property, value);
    }
    canvas.style.animation = "none";
    canvas.style.transition = "none";
    canvas.style.pointerEvents = "none";
    if (!bitmap) {
      canvas.width = canvas.height = 1;
      canvas.style.visibility = "hidden";
      return canvas;
    }
    const ratio = Math.min(pixelRatio, 8192 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.floor(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.floor(bitmap.height * ratio));
    const pixels = canvas.width * canvas.height;
    if (pixels > remainingPixels) throw new Error("Gallery scene pixel budget exceeded");
    remainingPixels -= pixels;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Gallery scene canvas unavailable");
    let drawWidth = bitmap.width, drawHeight = bitmap.height;
    if (style.objectFit !== "fill") {
      let scale = style.objectFit === "cover"
        ? Math.max(bitmap.width / source.naturalWidth, bitmap.height / source.naturalHeight)
        : Math.min(bitmap.width / source.naturalWidth, bitmap.height / source.naturalHeight);
      if (style.objectFit === "none") scale = 1;
      if (style.objectFit === "scale-down") scale = Math.min(1, scale);
      drawWidth = source.naturalWidth * scale;
      drawHeight = source.naturalHeight * scale;
    }
    const [horizontal = "50%", vertical = "50%"] = style.objectPosition.split(/\s+/);
    context.scale(canvas.width / bitmap.width, canvas.height / bitmap.height);
    // Cross-origin paintings may taint this decorative canvas. No pixel read,
    // export, data URL or blob is needed or allowed; the original node is reused.
    context.drawImage(source, objectOffset(horizontal, bitmap.width - drawWidth), objectOffset(vertical, bitmap.height - drawHeight), drawWidth, drawHeight);
    return canvas;
  };

  let remaining = MAX_NODES;
  const copy = (source: Node): Node | null => {
    if (--remaining < 0) throw new Error("Gallery scene node budget exceeded");
    if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent || "");
    if (!(source instanceof Element)) return null;
    const tag = source.localName.toLowerCase();
    if (OMIT.has(tag)) return null;
    if (source instanceof HTMLImageElement) return copyBitmap(source);
    // Construct instead of cloneNode: cloning an unloaded img/srcset or media
    // element could begin a request before its attributes can be removed.
    const target = document.createElementNS(source.namespaceURI, source.localName);
    for (const { name, value } of source.attributes) {
      if (VISUAL_ATTRIBUTES.has(name) && !/url\s*\(/i.test(value)) target.setAttribute(name, value);
    }
    if (source instanceof HTMLElement && target instanceof HTMLElement) {
      for (const property of source.style) {
        const value = source.style.getPropertyValue(property);
        if (!/url\s*\(/i.test(value)) target.style.setProperty(property, value, source.style.getPropertyPriority(property));
      }
      target.style.animation = "none";
      target.style.transition = "none";
      target.style.pointerEvents = "none";
      target.tabIndex = -1;
    }
    if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
      target.value = source.value;
      target.checked = source.checked;
      target.readOnly = true;
    }
    for (const child of source.childNodes) {
      const value = copy(child);
      if (value) target.appendChild(value);
    }
    if (source instanceof HTMLSelectElement && target instanceof HTMLSelectElement) target.value = source.value;
    return target;
  };

  const snapshot = document.createElement("div");
  snapshot.className = "gallery-page";
  snapshot.dataset.artworkSceneSnapshot = "gallery";
  snapshot.inert = true;
  snapshot.setAttribute("aria-hidden", "true");
  Object.assign(snapshot.style, { position: "absolute", inset: "0", width: `${width}px`, height: `${height}px`, pointerEvents: "none", overflow: "hidden" });
  try {
    for (const { source, rect } of groups) {
      const target = copy(source);
      if (!(target instanceof HTMLElement)) continue;
      Object.assign(target.style, {
        position: "absolute", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`,
        height: `${rect.height}px`, margin: "0", transform: "none", contentVisibility: "visible",
      });
      const style = getComputedStyle(source);
      for (const property of ["--gallery-row-image-height", "--gallery-gap"]) {
        const value = style.getPropertyValue(property);
        if (value) target.style.setProperty(property, value);
      }
      snapshot.append(target);
    }
  } catch {
    return null;
  }
  return snapshot.childElementCount ? snapshot : null;
}

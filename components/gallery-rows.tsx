"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { justifiedRows } from "@/lib/gallery-rows";
import { artworkAspectRatio } from "@/lib/masonry-layout";
import { resolveMediaUrl } from "@/lib/media";
import type { PaintingSummary } from "@/lib/types";
import { PaintingGridSkeleton, LoadingStatus } from "@/components/loading";

// Public asset dimensions only: no account data, tokens, or persistent storage.
const ratios = new Map<string, number>();
function prepareRatio(painting: PaintingSummary, signal: AbortSignal): Promise<number> {
  const source = resolveMediaUrl(painting.image?.contentUrl);
  if (!source) return Promise.resolve(4 / 3);
  const cached = ratios.get(source);
  if (cached) return Promise.resolve(cached);
  const { width, height } = painting.image!;
  if (width && height && width > 0 && height > 0) return Promise.resolve(artworkAspectRatio(width, height));
  return new Promise(resolve => {
    const image = new Image();
    const finish = (ratio: number, remember = false) => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      signal.removeEventListener("abort", cancel);
      if (remember) {
        if (ratios.size >= 1000) ratios.delete(ratios.keys().next().value!);
        ratios.set(source, ratio);
      }
      resolve(ratio);
    };
    const cancel = () => { finish(4 / 3); image.removeAttribute("src"); };
    // A slow/broken image must not block an entire batch indefinitely.
    const timer = setTimeout(() => finish(4 / 3), 8000);
    image.onload = () => finish(artworkAspectRatio(image.naturalWidth, image.naturalHeight), true);
    image.onerror = () => finish(4 / 3);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel(); else image.src = source;
  });
}

type PreparedBatch = { batch: PaintingSummary[]; ratios: number[] };
type Viewport = { key: string; paintingId?: string; offset: number; scrollY: number; savedAt: number };
let savedViewport: Viewport | undefined;
let viewportVersion = 0;
export function resetGalleryViewport() { savedViewport = undefined; viewportVersion++; }

export function GalleryRows({ batches, viewKey, restoreReady, onPrepared, renderPainting }: {
  batches: PaintingSummary[][];
  viewKey: string;
  restoreReady: boolean;
  onPrepared: (count: number) => void;
  renderPainting: (painting: PaintingSummary, priority: boolean) => ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [prepared, setPrepared] = useState<PreparedBatch[]>([]);
  const preparedRef = useRef(prepared);
  const visiblePrepared = useMemo(() => {
    let length = 0;
    while (length < prepared.length && prepared[length].batch === batches[length]) length++;
    return length === prepared.length ? prepared : prepared.slice(0, length);
  }, [prepared, batches]);
  const mountedVersion = useRef(viewportVersion);
  const restoring = useRef(savedViewport?.key === viewKey && Date.now() - savedViewport.savedAt < 20 * 60_000 ? savedViewport : undefined);

  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    let frame = 0;
    const measure = () => setWidth(node.getBoundingClientRect().width);
    // A resize event can precede responsive padding being committed. A second
    // frame also covers browsers without ResizeObserver and shell state updates.
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { measure(); frame = requestAnimationFrame(measure); });
    };
    measure();
    schedule();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(node);
    window.addEventListener("resize", schedule);
    return () => { observer?.disconnect(); window.removeEventListener("resize", schedule); cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let length = 0;
    while (length < preparedRef.current.length && preparedRef.current[length].batch === batches[length]) length++;
    const existing = preparedRef.current.slice(0, length);
    void (async () => {
      const next = [...existing];
      for (let i = existing.length; i < batches.length; i++) {
        const batch = batches[i];
        const sizes = await Promise.all(batch.map(painting => prepareRatio(painting, controller.signal)));
        if (controller.signal.aborted) return;
        next.push({ batch, ratios: sizes });
        preparedRef.current = [...next];
        setPrepared([...next]);
      }
    })();
    return () => controller.abort();
  }, [batches]);

  const count = visiblePrepared.reduce((sum, entry) => sum + entry.batch.length, 0);
  const pending = count < batches.reduce((sum, batch) => sum + batch.length, 0);
  useEffect(() => { onPrepared(count); }, [count, onPrepared]);
  const gap = width > 900 ? 20 : width > 680 ? 16 : 14;
  const rows = useMemo(() => {
    const result: { paintings: PaintingSummary[]; height: number; widths: number[]; left: number }[] = [];
    if (!width) return result;
    for (const entry of visiblePrepared) {
      let paintings = entry.batch;
      let sizes = entry.ratios;
      // A short terminal batch joins only the previous final row. Earlier rows
      // and all normal 12-item additions keep their positions at the same width.
      if (paintings.length < 3 && result.length && width > 680) {
        const last = result.pop()!;
        paintings = [...last.paintings, ...paintings];
        sizes = [...last.widths.map(value => value / last.height), ...sizes];
      }
      for (const row of justifiedRows(sizes, width, gap)) {
        result.push({ paintings: paintings.slice(row.start, row.start + row.count), height: row.height, widths: row.widths, left: row.left });
      }
    }
    return result;
  }, [visiblePrepared, width, gap]);

  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const save = () => {
      if (mountedVersion.current !== viewportVersion) return;
      // Capture before navigation changes scroll position or removes the cards.
      const item = Array.from(node.querySelectorAll<HTMLElement>("[data-painting-id]"))
        .find(candidate => candidate.getBoundingClientRect().bottom > 90);
      if (!item) return;
      savedViewport = { key: viewKey, paintingId: item.dataset.paintingId, offset: item.getBoundingClientRect().top, scrollY: window.scrollY, savedAt: Date.now() };
    };
    const beforeNavigate = (event: MouseEvent) => {
      if ((event.target as Element).closest("a[href]")) save();
    };
    node.addEventListener("click", beforeNavigate, true);
    window.addEventListener("pagehide", save);
    return () => { save(); node.removeEventListener("click", beforeNavigate, true); window.removeEventListener("pagehide", save); };
  }, [viewKey]);

  useEffect(() => {
    const cancel = () => { restoring.current = undefined; };
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("keydown", cancel);
    return () => { window.removeEventListener("wheel", cancel); window.removeEventListener("touchstart", cancel); window.removeEventListener("keydown", cancel); };
  }, []);

  useEffect(() => {
    if (!restoring.current || pending || !width || !restoreReady) return;
    let frame = 0;
    let disposed = false;
    void document.fonts.ready.then(() => {
      if (disposed) return;
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
        const snapshot = restoring.current;
        if (!snapshot) return;
        const anchor = Array.from(container.current?.querySelectorAll<HTMLElement>("[data-painting-id]") || [])
          .find(item => item.dataset.paintingId === snapshot.paintingId);
        window.scrollTo({ top: anchor ? window.scrollY + anchor.getBoundingClientRect().top - snapshot.offset : snapshot.scrollY, behavior: "instant" });
        restoring.current = undefined;
      }); });
    });
    return () => { disposed = true; cancelAnimationFrame(frame); };
  }, [pending, width, restoreReady, count]);

  return <div ref={container} className="gallery-rows" role="region" aria-label="画作目录" aria-busy={pending} style={{ "--gallery-gap": `${gap}px` } as CSSProperties}>
    {rows.map((row, rowIndex) => <div className="gallery-row" key={row.paintings[0].paintingId} style={{ marginLeft: row.left, "--gallery-row-image-height": `${row.height}px` } as CSSProperties}>
      {row.paintings.map((painting, index) => <div className="gallery-row-item" data-painting-id={painting.paintingId} key={painting.paintingId} style={{ width: row.widths[index] }}>
        {renderPainting(painting, rowIndex === 0)}
      </div>)}
    </div>)}
    {pending ? <div className="gallery-preparing"><PaintingGridSkeleton count={3} rows /><LoadingStatus label="正在准备画作预览" /></div> : null}
  </div>;
}

"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { justifiedRows } from "@/lib/gallery-rows";
import { artworkAspectRatio } from "@/lib/masonry-layout";
import type { PaintingSummary } from "@/lib/types";
import { startPresentation } from "@/lib/content-presentation";
import { StatePanel } from "@/components/state-panel";

function catalogRatio(painting: PaintingSummary): number {
  const { width, height } = painting.image ?? {};
  return width && height && width > 0 && height > 0 ? artworkAspectRatio(width, height) : 4 / 3;
}

type Viewport = { key: string; paintingId?: string; offset: number; scrollY: number; savedAt: number };
let savedViewport: Viewport | undefined;
let viewportVersion = 0;
export function resetGalleryViewport() { savedViewport = undefined; viewportVersion++; }
export function hasSavedGalleryViewport(generation: number) {
  return savedViewport?.key.startsWith(`${generation}:`) === true
    && Date.now() - savedViewport.savedAt < 20 * 60_000;
}

export function GalleryRows({ batches, viewKey, restoreReady, onPrepared, renderPainting }: {
  batches: PaintingSummary[][];
  viewKey: string;
  restoreReady: boolean;
  onPrepared: (count: number) => void;
  renderPainting: (painting: PaintingSummary, priority: boolean, previewSizes?: string) => ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
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

  const count = batches.reduce((sum, batch) => sum + batch.length, 0);
  useLayoutEffect(() => {
    if (!restoring.current) mountedVersion.current = viewportVersion;
  }, [batches]);
  const displayedIds = useRef(new Set<string>());
  const [presentationError, setPresentationError] = useState(false);
  const gap = width > 900 ? 20 : width > 680 ? 16 : 14;
  const rows = useMemo(() => {
    const result: { paintings: PaintingSummary[]; height: number; widths: number[]; left: number }[] = [];
    if (!width) return result;
    for (const batch of batches) {
      let paintings = batch;
      let sizes = batch.map(catalogRatio);
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
  }, [batches, width, gap]);

  useLayoutEffect(() => {
    const node = container.current;
    if (!node || !rows.length) { onPrepared(0); return; }
    const cards = Array.from(node.querySelectorAll<HTMLElement>("[data-painting-id]"));
    const next = cards.filter(card => !displayedIds.current.has(card.dataset.paintingId!));
    const prepared = () => { displayedIds.current = new Set(cards.map(card => card.dataset.paintingId!)); onPrepared(count); };
    if (!displayedIds.current.size || !next.length) { prepared(); return; }
    if (presentationError) { for (const card of next) card.hidden = true; return; }
    const presentation = startPresentation(node, { regions: next, onPrepared: prepared, onTimeout: () => setPresentationError(true) });
    return presentation.cancel;
  }, [rows, count, onPrepared, presentationError]);

  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    let navigationCaptured = false;
    const save = (anchor?: HTMLElement) => {
      if (mountedVersion.current !== viewportVersion) return;
      // Capture before navigation changes scroll position or removes the cards.
      const item = anchor ?? Array.from(node.querySelectorAll<HTMLElement>("[data-painting-id]"))
        .find(candidate => candidate.getBoundingClientRect().bottom > 90);
      if (!item) return;
      savedViewport = { key: viewKey, paintingId: item.dataset.paintingId, offset: item.getBoundingClientRect().top, scrollY: window.scrollY, savedAt: Date.now() };
    };
    const beforeNavigate = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest("a[href]");
      if (!link) return;
      save(link.closest<HTMLElement>("[data-painting-id]") ?? undefined);
      navigationCaptured = true;
    };
    const saveOnExit = () => { if (!navigationCaptured) save(); };
    // Daily recommendations sit outside the rows but need the same scroll snapshot.
    const gallery = node.closest<HTMLElement>(".gallery-page") || node;
    gallery.addEventListener("click", beforeNavigate, true);
    window.addEventListener("pagehide", saveOnExit);
    return () => { saveOnExit(); gallery.removeEventListener("click", beforeNavigate, true); window.removeEventListener("pagehide", saveOnExit); };
  }, [viewKey]);

  useEffect(() => {
    const cancel = () => {
      restoring.current = undefined;
      if (container.current) container.current.dataset.galleryRestoring = "false";
    };
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("keydown", cancel);
    return () => { window.removeEventListener("wheel", cancel); window.removeEventListener("touchstart", cancel); window.removeEventListener("keydown", cancel); };
  }, []);

  useEffect(() => {
    if (!restoring.current || !width || !restoreReady) return;
    let frame = 0;
    let disposed = false;
    void document.fonts.ready.then(() => {
      if (disposed) return;
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
        const snapshot = restoring.current;
        if (!snapshot) return;
        if (mountedVersion.current === viewportVersion) {
          const anchor = Array.from(container.current?.querySelectorAll<HTMLElement>("[data-painting-id]") || [])
            .find(item => item.dataset.paintingId === snapshot.paintingId);
          window.scrollTo({ top: anchor ? window.scrollY + anchor.getBoundingClientRect().top - snapshot.offset : snapshot.scrollY, behavior: "instant" });
        }
        restoring.current = undefined;
        // Shared-image returns must wait for this scroll, not just mounted cards.
        if (container.current) container.current.dataset.galleryRestoring = "false";
      }); });
    });
    return () => { disposed = true; cancelAnimationFrame(frame); };
  }, [width, restoreReady, count]);

  return <div ref={container} className="gallery-rows" data-gallery-restoring={Boolean(restoring.current)} role="region" aria-label="画作目录" style={{ "--gallery-gap": `${gap}px` } as CSSProperties}>
    {rows.map((row, rowIndex) => <div className="gallery-row" key={row.paintings[0].paintingId} style={{ marginLeft: row.left, "--gallery-row-image-height": `${row.height}px` } as CSSProperties}>
      {row.paintings.map((painting, index) => {
        const { width, height } = painting.image ?? {};
        // Match the contained image and its zoom inside the card's one-pixel border.
        const slot = width && height && width > 0 && height > 0
          ? Math.ceil(Math.min(row.widths[index] - 2, row.height * width / height) * 1.08)
          : null;
        return <div className="gallery-row-item" data-painting-id={painting.paintingId} data-progressive-images="" key={painting.paintingId} style={{ width: row.widths[index] }}>
          {renderPainting(painting, rowIndex === 0, slot && slot > 0 ? `${slot}px` : undefined)}
        </div>;
      })}
    </div>)}
    {presentationError ? <StatePanel kind="error" title="新增画作预览暂未准备完成" description="请重新筛选或刷新页面后重试。" actionLabel="刷新页面" onAction={() => location.reload()} /> : null}
  </div>;
}

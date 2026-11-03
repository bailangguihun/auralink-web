"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { ArtworkViewer } from "@/components/artwork-viewer";
import { beginArtworkFlight, clearArtworkPreview, saveArtworkPreview } from "@/lib/artwork-flight";
import { getGalleryFeedSnapshot, galleryFeedKey } from "@/lib/gallery-feed";

import { useSession } from "@/components/session-provider";
import { artworkMotionPlan, fitArtworkRect, intersectArtworkRects, type ArtworkRect } from "@/lib/artwork-transition-geometry";
import styles from "./artwork-transition.module.css";

// Only the final handoff waits for route/data readiness. The main flight starts
// in click capture, using the already decoded image and a presentation-only
// viewer shell. A slow route can no longer consume the animation itself.
const ARTWORK_READY_TIMEOUT_MS = 5_000;

type GalleryOrigin = {
  paintingId: string; generation: number; kind: "card" | "daily"; savedAt: number;
  bitmap: ArtworkRect; frame: ArtworkRect; viewport: string; feedKey: string;
};

type Transfer = {
  from: string; to: string; paintingId: string; generation: number;
  direction: "open" | "return"; galleryKind?: GalleryOrigin["kind"];
  source: string; bitmap: ArtworkRect; frame: ArtworkRect;
  overlay: HTMLDivElement; image: HTMLImageElement; decoded: boolean;
  phase: "waiting" | "moving" | "settling" | "fading"; arrived: boolean;
  flown: boolean; finishFlight: () => void;
  target?: { image: HTMLImageElement; visibility: string; priority: string; decoded: boolean };
  lastTarget?: ArtworkRect; lastFrame?: ArtworkRect; stableFrames: number;
  observer: MutationObserver; timer: ReturnType<typeof setTimeout>; raf: number;
  animations: Animation[];
};

/** The route entrance must not also translate the landing artwork. */
export function hasArtworkTransition(pathname: string, generation: number) {
  const overlay = document.querySelector<HTMLElement>("[data-artwork-transition-overlay]");
  return overlay?.dataset.artworkTransitionPath === pathname && overlay.dataset.artworkGeneration === String(generation);
}

function bitmapRect(image: HTMLImageElement) {
  const fit = getComputedStyle(image).objectFit;
  return fitArtworkRect(image.getBoundingClientRect(), image.naturalWidth, image.naturalHeight,
    fit === "cover" ? "cover" : fit === "fill" ? "fill" : "contain");
}

function sourceFrame(image: HTMLImageElement, bitmap: ArtworkRect) {
  const topbar = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
  const clips: ArtworkRect[] = [bitmap, image.getBoundingClientRect(),
    { left: 0, top: topbar, width: innerWidth, height: innerHeight - topbar }];
  for (let node = image.parentElement; node && node !== document.body; node = node.parentElement) {
    const css = getComputedStyle(node);
    if (/(hidden|clip|auto|scroll)/.test(`${css.overflowX} ${css.overflowY}`)) clips.push(node.getBoundingClientRect());
  }
  return intersectArtworkRects(clips);
}

function finishImageReveal(image: HTMLImageElement) {
  // The shared image already revealed this bitmap. A second CSS fade at handoff
  // would make it briefly dim, especially when the user interrupts the flight.
  for (const animation of image.getAnimations()) {
    if ("animationName" in animation && animation.animationName === "content-reveal") animation.finish();
  }
}

/** Copies only the already-visible public image; navigation and data reads stay native. */
export function ArtworkTransition() {
  const pathname = usePathname();
  const { status, sessionIdentity } = useSession();
  const latest = useRef({ pathname, status, generation: sessionIdentity.generation });
  latest.current = { pathname, status, generation: sessionIdentity.generation };
  const current = useRef<Transfer | null>(null);
  const measurement = useRef<HTMLDivElement>(null);
  // Only the last gallery entry, in memory; no route, query or auth persistence.
  const origin = useRef<GalleryOrigin | null>(null);
  const cancel = useRef<() => void>(() => {});
  const inspect = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cleanup = (transfer = current.current) => {
      if (!transfer) return;
      if (current.current === transfer) current.current = null;
      clearTimeout(transfer.timer);
      cancelAnimationFrame(transfer.raf);
      transfer.observer.disconnect();
      for (const animation of transfer.animations) {
        animation.onfinish = null;
        animation.cancel();
      }
      if (transfer.target) {
        const { image, visibility, priority } = transfer.target;
        finishImageReveal(image);
        if (visibility) image.style.setProperty("visibility", visibility, priority);
        else image.style.removeProperty("visibility");
      }
      transfer.overlay.remove();
      transfer.finishFlight();
    };
    const fade = (transfer: Transfer) => {
      if (current.current !== transfer || transfer.phase !== "waiting") return;
      transfer.phase = "fading";
      transfer.overlay.dataset.artworkTransitionPhase = "fading";
      transfer.observer.disconnect();
      const animation = transfer.overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: "forwards" });
      animation.id = "artlive-artwork-fallback";
      transfer.animations.push(animation);
      animation.onfinish = () => cleanup(transfer);
    };
    const queue = () => {
      const transfer = current.current;
      if (!transfer || transfer.phase === "fading" || transfer.phase === "settling" || transfer.raf) return;
      transfer.raf = requestAnimationFrame(() => { transfer.raf = 0; measure(transfer); });
    };
    const fly = (transfer: Transfer, destination: ArtworkRect, destinationFrame: ArtworkRect, primary: boolean) => {
      const plan = artworkMotionPlan(transfer.bitmap, transfer.frame, destination, destinationFrame);
      if (!plan) return false;
      transfer.phase = primary ? "moving" : "settling";
      transfer.overlay.dataset.artworkTransitionPhase = transfer.phase;
      Object.assign(transfer.overlay.style, { width: `${plan.width}px`, height: `${plan.height}px`, transform: plan.from.transform });
      transfer.image.style.clipPath = plan.from.clipPath;
      const mobile = matchMedia("(max-width: 680px)").matches;
      const timing = { duration: primary ? (transfer.direction === "return" ? 320 : 360) - (mobile ? 40 : 0) : 120,
        easing: "cubic-bezier(.2, .7, .25, 1)", fill: "both" as const };
      const outer = transfer.overlay.animate([{ transform: plan.from.transform }, { transform: plan.to.transform }], timing);
      outer.id = primary ? "artlive-artwork-frame" : "artlive-artwork-settle-frame";
      const inner = transfer.image.animate([{ clipPath: plan.from.clipPath }, { clipPath: plan.to.clipPath }], timing);
      inner.id = primary ? "artlive-artwork-image" : "artlive-artwork-settle-image";
      transfer.animations.push(outer, inner);
      outer.onfinish = () => {
        if (current.current !== transfer) return;
        if (!primary) { cleanup(transfer); return; }
        // Commit the final pose before removing fill animations. The picture can
        // stay here while a cold route arrives, without replaying the main flight.
        transfer.overlay.style.transform = plan.to.transform;
        transfer.image.style.clipPath = plan.to.clipPath;
        for (const animation of transfer.animations) { animation.onfinish = null; animation.cancel(); }
        transfer.animations = [];
        transfer.bitmap = destination; transfer.frame = destinationFrame;
        transfer.flown = true;
        transfer.phase = "waiting";
        transfer.overlay.dataset.artworkTransitionPhase = "waiting";
        clearTimeout(transfer.timer);
        transfer.timer = setTimeout(() => fade(transfer), ARTWORK_READY_TIMEOUT_MS);
        transfer.finishFlight();
        queue();
      };
      return true;
    };
    const measure = (transfer: Transfer) => {
      if (current.current !== transfer || transfer.phase === "fading" || transfer.phase === "settling") return;
      const state = latest.current;
      if (document.hidden || reduced.matches || state.status !== "authenticated" || state.generation !== transfer.generation) {
        cleanup(transfer); return;
      }
      if (state.pathname !== transfer.to || location.pathname !== transfer.to) return;
      if (transfer.direction === "return") {
        const gallery = document.querySelector<HTMLElement>(".gallery-page");
        if (gallery?.dataset.galleryReady !== "true" || gallery.querySelector('[data-gallery-restoring="true"]')) return;
      }
      const media = transfer.direction === "return"
        ? Array.from(document.querySelectorAll<HTMLElement>(transfer.galleryKind === "daily"
          ? ".gallery-page .daily-card[data-artwork-source]" : ".gallery-page .gallery-row-item [data-artwork-source]"))
          .find(node => node.dataset.artworkSource === transfer.paintingId)
        : Array.from(document.querySelectorAll<HTMLElement>("[data-artwork-target]"))
          .find(node => node.dataset.artworkTarget === transfer.paintingId);
      const target = media?.querySelector("img");
      if (!target) {
        if (document.querySelector(".detail-page .state-error, .detail-page .state-empty")) fade(transfer);
        return;
      }
      if ((target.currentSrc || target.src) !== transfer.source) { if (transfer.phase === "waiting") fade(transfer); return; }
      if (transfer.target?.image !== target) {
        if (transfer.target) {
          const old = transfer.target;
          if (old.visibility) old.image.style.setProperty("visibility", old.visibility, old.priority);
          else old.image.style.removeProperty("visibility");
        }
        const landing = { image: target, visibility: target.style.getPropertyValue("visibility"), priority: target.style.getPropertyPriority("visibility"), decoded: false };
        transfer.target = landing;
        target.style.visibility = "hidden";
        void target.decode().then(() => {
          if (current.current !== transfer) return;
          landing.decoded = true;
          queue();
        }, () => fade(transfer));
      }
      if (transfer.phase === "moving") return;
      if (!target.complete) return;
      if (!target.naturalWidth) { fade(transfer); return; }
      if (!transfer.decoded || !transfer.target.decoded) return;
      const destination = bitmapRect(target);
      const destinationFrame = destination && sourceFrame(target, destination);
      if (!destination || !destinationFrame) { fade(transfer); return; }
      const previous = transfer.lastTarget;
      const previousFrame = transfer.lastFrame;
      const stable = previous && previousFrame && (["left", "top", "width", "height"] as const)
        .every(key => Math.abs(previous[key] - destination[key]) < .25 && Math.abs(previousFrame[key] - destinationFrame[key]) < .25);
      transfer.stableFrames = stable ? transfer.stableFrames + 1 : 1;
      transfer.lastTarget = destination;
      transfer.lastFrame = destinationFrame;
      if (transfer.stableFrames < 2) { queue(); return; }
      finishImageReveal(target);
      if (!transfer.flown) {
        // A changed viewport cannot use an old return rectangle. It can still
        // fly once the real gallery geometry is available.
        if (!fly(transfer, destination, destinationFrame, true)) fade(transfer);
        return;
      }
      const close = (["left", "top", "width", "height"] as const).every(key =>
        Math.abs(transfer.bitmap[key] - destination[key]) < 1 && Math.abs(transfer.frame[key] - destinationFrame[key]) < 1);
      if (close) cleanup(transfer);
      else if (!fly(transfer, destination, destinationFrame, false)) fade(transfer);
    };
    const viewportKey = () => [document.documentElement.clientWidth, innerHeight, devicePixelRatio,
      document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0].join(":");
    const feedKey = (generation: number) => {
      const feed = getGalleryFeedSnapshot(generation);
      return feed ? `${galleryFeedKey(feed.query)}:${feed.page?.orderDate || ""}` : "";
    };
    const openingDestination = (source: HTMLImageElement) => {
      const host = measurement.current;
      const image = host?.querySelector("img");
      if (!host || !image) return null;
      host.inert = true;
      host.style.width = `${document.documentElement.clientWidth}px`;
      image.width = source.naturalWidth; image.height = source.naturalHeight;
      host.hidden = false;
      try {
        const bitmap = fitArtworkRect(image.getBoundingClientRect(), source.naturalWidth, source.naturalHeight, "contain");
        const frame = bitmap && sourceFrame(image, bitmap);
        return bitmap && frame ? { bitmap, frame } : null;
      } finally { host.hidden = true; }
    };
    const capture = (event: MouseEvent) => {
      // Assistive-technology clicks may have no preceding pointer/key event.
      cleanup();
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
        || reduced.matches || document.hidden || latest.current.status !== "authenticated" || typeof Element.prototype.animate !== "function") return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[data-artwork-link], a[data-artwork-return]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, location.href);
      const returning = link.hasAttribute("data-artwork-return");
      const paintingId = returning ? link.dataset.artworkReturn : link.dataset.artworkLink;
      if (!paintingId || destination.origin !== location.origin || destination.pathname === location.pathname) return;
      const detailPath = `/gallery/${encodeURIComponent(paintingId)}`;
      if (returning ? destination.pathname !== "/gallery" || location.pathname !== detailPath : destination.pathname !== detailPath) return;
      const entry = origin.current;
      if (returning && (!entry || entry.paintingId !== paintingId || entry.generation !== latest.current.generation || Date.now() - entry.savedAt > 20 * 60_000)) return;
      // A new entry with an unavailable image must not reuse an older daily/card origin.
      if (!returning) origin.current = null;
      const owner = returning ? link.closest<HTMLElement>(".detail-artwork")?.querySelector<HTMLElement>("[data-artwork-target]")
        : link.closest<HTMLElement>("[data-artwork-source]");
      const source = owner?.querySelector("img");
      if (!source || !source.complete || !source.naturalWidth || !source.getClientRects().length) return;
      let bitmap = bitmapRect(source);
      let frame = bitmap && sourceFrame(source, bitmap);
      if (!bitmap) return;
      // A title can remain clickable after its image scrolls behind the topbar.
      // Use a small copy at the visible card/click location in that case, instead
      // of silently discarding an otherwise valid decoded-image transition.
      if (!frame || frame.width < 24 || frame.height < 24) {
        const rect = link.getBoundingClientRect();
        const topbar = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
        const x = event.detail ? event.clientX : rect.left + rect.width / 2;
        const y = event.detail ? event.clientY : rect.top + rect.height / 2;
        bitmap = fitArtworkRect({ left: Math.max(0, Math.min(innerWidth - 80, x - 40)),
          top: Math.max(topbar, Math.min(innerHeight - 80, y - 40)), width: 80, height: 80 }, source.naturalWidth, source.naturalHeight, "contain");
        frame = bitmap;
      }
      if (!bitmap || !frame) return;
      const initial = artworkMotionPlan(bitmap, frame, bitmap, frame);
      if (!initial) return;
      const generation = latest.current.generation;
      const destinationGeometry = returning
        ? entry?.viewport === viewportKey() && entry.feedKey === feedKey(generation) ? { bitmap: entry.bitmap, frame: entry.frame } : null
        : openingDestination(source);
      if (!returning) {
        origin.current = location.pathname === "/gallery"
          ? { paintingId, generation, kind: owner?.matches(".daily-card") ? "daily" : "card", savedAt: Date.now(),
            bitmap, frame, viewport: viewportKey(), feedKey: feedKey(generation) } : null;
        saveArtworkPreview({ paintingId, generation, source: source.currentSrc || source.src,
          title: owner?.dataset.artworkTitle || source.alt || "无题", author: owner?.dataset.artworkAuthor || "佚名",
          period: owner?.dataset.artworkPeriod || "年代未详", width: source.naturalWidth, height: source.naturalHeight, savedAt: Date.now() });
      }
      const overlay = document.createElement("div");
      overlay.className = styles.overlay;
      overlay.setAttribute("aria-hidden", "true");
      overlay.dataset.artworkTransitionOverlay = "";
      overlay.dataset.artworkTransitionPath = destination.pathname;
      overlay.dataset.artworkGeneration = String(latest.current.generation);
      overlay.dataset.artworkTransitionDirection = returning ? "return" : "open";
      Object.assign(overlay.style, { width: `${initial.width}px`, height: `${initial.height}px`, transform: initial.from.transform });
      const image = document.createElement("img");
      image.className = styles.image;
      image.alt = "";
      image.draggable = false;
      image.decoding = "async";
      image.style.clipPath = initial.from.clipPath;
      image.src = source.currentSrc || source.src;
      overlay.append(image);
      const observer = new MutationObserver(queue);
      const transfer: Transfer = {
        from: location.pathname, to: destination.pathname, paintingId, generation: latest.current.generation,
        direction: returning ? "return" : "open", galleryKind: returning ? entry?.kind : undefined,
        source: image.src, bitmap, frame, overlay, image, decoded: false, phase: "waiting", arrived: false, stableFrames: 0,
        observer, timer: setTimeout(() => fade(transfer), ARTWORK_READY_TIMEOUT_MS), raf: 0, animations: [],
        flown: false, finishFlight: () => {},
      };
      current.current = transfer;
      document.body.append(overlay);
      // The source has already decoded. Reusing it is sufficient to start the
      // visual flight; an independent decode still verifies the landing copy.
      if (destinationGeometry) {
        transfer.finishFlight = beginArtworkFlight(destination.pathname, generation);
        if (!fly(transfer, destinationGeometry.bitmap, destinationGeometry.frame, true)) transfer.finishFlight();
      }
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-gallery-ready", "data-gallery-restoring"] });
      void image.decode().then(() => {
        if (current.current !== transfer) return;
        transfer.decoded = true;
        queue();
      }, () => { if (current.current === transfer) cleanup(transfer); });
      queue();
    };
    const stop = () => cleanup();
    // Router scroll reset and gallery anchor restoration are expected during a
    // flight. User scrolling is already caught by wheel/touch/key interruptions.
    const onScroll = () => { if (current.current?.phase === "waiting") current.current.stableFrames = 0; queue(); };
    const onVisibility = () => { if (document.hidden) cleanup(); };
    cancel.current = stop;
    inspect.current = queue;
    document.addEventListener("click", capture, true);
    const interruptions = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const event of interruptions) document.addEventListener(event, stop, { capture: true, passive: true });
    document.addEventListener("load", queue, true);
    document.addEventListener("error", queue, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", stop);
    window.addEventListener("popstate", stop);
    window.addEventListener("pagehide", stop);
    reduced.addEventListener("change", stop);
    return () => {
      cleanup(); cancel.current = () => {}; inspect.current = () => {};
      document.removeEventListener("click", capture, true);
      for (const event of interruptions) document.removeEventListener(event, stop, true);
      document.removeEventListener("load", queue, true);
      document.removeEventListener("error", queue, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", stop);
      window.removeEventListener("popstate", stop);
      window.removeEventListener("pagehide", stop);
      reduced.removeEventListener("change", stop);
    };
  }, []);

  useLayoutEffect(() => {
    const entry = origin.current;
    if (status !== "authenticated") clearArtworkPreview();
    if (entry && (status !== "authenticated" || sessionIdentity.generation !== entry.generation
      || (pathname !== "/gallery" && pathname !== `/gallery/${encodeURIComponent(entry.paintingId)}`))) origin.current = null;
    const transfer = current.current;
    if (!transfer) return;
    if (pathname === transfer.to) transfer.arrived = true;
    if (status !== "authenticated" || sessionIdentity.generation !== transfer.generation
      || (transfer.arrived && pathname !== transfer.to)
      || (pathname !== transfer.from && pathname !== transfer.to)) cancel.current();
    else inspect.current();
  }, [pathname, status, sessionIdentity.generation]);

  return <div ref={measurement} className={styles.measure} hidden aria-hidden="true" data-artwork-measure>
    <div className="page-shell detail-page" data-artwork-measure>
      <div className="detail-layout">
        <ArtworkViewer title="画作" author="作者" period="年代" image={<img alt="" width={1} height={1} />}
          actions={<><button className="button" tabIndex={-1}>返回画廊</button><button className="button" tabIndex={-1}>引用作品</button><button className="button" tabIndex={-1}>收藏</button></>} />
      </div>
    </div>
  </div>;
}

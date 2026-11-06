"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { ArtworkViewer } from "@/components/artwork-viewer";
import { beginArtworkFlight, clearArtworkPreview, saveArtworkPreview } from "@/lib/artwork-flight";
import { getGalleryFeedSnapshot, galleryFeedKey } from "@/lib/gallery-feed";
import { captureArtworkBitmap, captureGalleryScene } from "@/lib/artwork-gallery-scene";
import { prefetchPaintingDetail } from "@/lib/painting-detail-data";

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
  scene: HTMLDivElement;
};

type HiddenImage = { image: HTMLImageElement; visibility: string; priority: string };

type Transfer = {
  from: string; to: string; paintingId: string; generation: number;
  direction: "open" | "return"; galleryKind?: GalleryOrigin["kind"];
  source: string; bitmap: ArtworkRect; frame: ArtworkRect;
  overlay: HTMLDivElement; image: HTMLCanvasElement;
  scene: HTMLDivElement; scenery: HTMLElement; backgroundReady: boolean; sourceNode: HiddenImage; gestureHeld: boolean;
  phase: "waiting" | "moving" | "settling" | "fading"; arrived: boolean;
  flown: boolean; finishFlight: () => void;
  target?: HiddenImage & { decoded: boolean };
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
  const { status, token, sessionIdentity } = useSession();
  const latest = useRef({ pathname, status, token, generation: sessionIdentity.generation });
  latest.current = { pathname, status, token, generation: sessionIdentity.generation };
  const current = useRef<Transfer | null>(null);
  const measurement = useRef<HTMLDivElement>(null);
  // Only the last gallery entry, in memory; no route, query or auth persistence.
  const origin = useRef<GalleryOrigin | null>(null);
  const cancel = useRef<() => void>(() => {});
  const inspect = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cleanup = (transfer = current.current, force = false) => {
      if (!transfer) return;
      // Natural animation completion may race a finger held on the paper.
      // Retain its hit target until click/cancel, so the synthesized click cannot
      // retarget a newly revealed control. Auth/navigation teardown can force it.
      if (transfer.gestureHeld && !force) return;
      if (current.current === transfer) current.current = null;
      clearTimeout(transfer.timer);
      cancelAnimationFrame(transfer.raf);
      transfer.observer.disconnect();
      for (const animation of transfer.animations) {
        animation.onfinish = null;
        animation.cancel();
      }
      for (const hidden of [transfer.sourceNode, transfer.target]) {
        if (!hidden) continue;
        const { image, visibility, priority } = hidden;
        finishImageReveal(image);
        if (visibility) image.style.setProperty("visibility", visibility, priority);
        else image.style.removeProperty("visibility");
      }
      transfer.overlay.remove();
      transfer.scene.remove();
      transfer.finishFlight();
    };
    const fade = (transfer: Transfer) => {
      if (current.current !== transfer || transfer.phase !== "waiting") return;
      transfer.phase = "fading";
      transfer.overlay.dataset.artworkTransitionPhase = "fading";
      transfer.observer.disconnect();
      const animation = transfer.overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: "forwards" });
      const background = transfer.scene.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: "forwards" });
      animation.id = "artlive-artwork-fallback";
      transfer.animations.push(animation, background);
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
      const startTime = document.timeline.currentTime;
      const completeVisuals = () => {
        if (current.current !== transfer || !transfer.flown || !transfer.backgroundReady) return;
        transfer.finishFlight();
        queue();
      };
      if (primary) {
        // The opaque paper is present from the first frame. Only its panels
        // reveal, so the old route can never show through behind the picture.
        const background = transfer.scenery.animate([{ opacity: .65 }, { opacity: 1 }], timing);
        background.id = "artlive-artwork-background";
        background.startTime = startTime;
        transfer.animations.push(background);
        background.onfinish = () => {
          if (current.current !== transfer) return;
          transfer.backgroundReady = true;
          transfer.scene.dataset.artworkBackgroundReady = "true";
          completeVisuals();
        };
      }
      const outer = transfer.overlay.animate([{ transform: plan.from.transform }, { transform: plan.to.transform }], timing);
      outer.id = primary ? "artlive-artwork-frame" : "artlive-artwork-settle-frame";
      const inner = transfer.image.animate([{ clipPath: plan.from.clipPath }, { clipPath: plan.to.clipPath }], timing);
      inner.id = primary ? "artlive-artwork-image" : "artlive-artwork-settle-image";
      outer.startTime = inner.startTime = startTime;
      transfer.animations.push(outer, inner);
      outer.onfinish = () => {
        if (current.current !== transfer) return;
        if (!primary) { cleanup(transfer); return; }
        // Commit the final pose before removing fill animations. The picture can
        // stay here while a cold route arrives, without replaying the main flight.
        transfer.overlay.style.transform = plan.to.transform;
        transfer.image.style.clipPath = plan.to.clipPath;
        outer.onfinish = null;
        outer.cancel();
        inner.cancel();
        transfer.bitmap = destination; transfer.frame = destinationFrame;
        transfer.flown = true;
        transfer.phase = "waiting";
        transfer.overlay.dataset.artworkTransitionPhase = "waiting";
        clearTimeout(transfer.timer);
        transfer.timer = setTimeout(() => fade(transfer), ARTWORK_READY_TIMEOUT_MS);
        completeVisuals();
        queue();
      };
      return true;
    };
    const measure = (transfer: Transfer) => {
      if (current.current !== transfer || transfer.phase === "fading" || transfer.phase === "settling") return;
      const state = latest.current;
      if (document.hidden || reduced.matches || state.status !== "authenticated" || state.generation !== transfer.generation) {
        cleanup(transfer, true); return;
      }
      if (state.pathname !== transfer.to || location.pathname !== transfer.to) return;
      if (transfer.direction === "return") {
        const gallery = document.querySelector<HTMLElement>("main.gallery-page");
        if (gallery?.dataset.galleryReady !== "true" || gallery.querySelector('[data-gallery-restoring="true"]')) return;
      }
      const media = transfer.direction === "return"
        ? Array.from(document.querySelectorAll<HTMLElement>(transfer.galleryKind === "daily"
          ? "main.gallery-page .daily-card[data-artwork-source]" : "main.gallery-page .gallery-row-item [data-artwork-source]"))
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
      if (transfer.phase === "moving" || !transfer.backgroundReady) return;
      if (!target.complete) return;
      if (!target.naturalWidth) { fade(transfer); return; }
      if (!transfer.target.decoded) return;
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
        // This is the same presentation-only layout used for measurement. It
        // has no source URL, live controls, business effects or private data.
        const scenery = host.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
        return bitmap && frame && scenery ? { bitmap, frame, scenery } : null;
      } finally { host.hidden = true; }
    };
    const capture = (event: MouseEvent) => {
      // Assistive-technology clicks may have no preceding pointer/key event.
      cleanup(current.current, true);
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
      const image = captureArtworkBitmap(source);
      if (!image) return;
      const generation = latest.current.generation;
      const destinationGeometry = returning
        ? entry?.viewport === viewportKey() && entry.feedKey === feedKey(generation)
          ? { bitmap: entry.bitmap, frame: entry.frame, scenery: entry.scene } : null
        : openingDestination(source);
      // A stale viewport/query cannot safely replay the old gallery scene.
      // Keep native navigation rather than flying over the wrong background.
      if (!destinationGeometry) return;
      if (!returning) {
        const gallery = source.closest<HTMLElement>("main.gallery-page");
        const scene = gallery && captureGalleryScene(gallery, source);
        origin.current = location.pathname === "/gallery" && scene
          ? { paintingId, generation, kind: owner?.matches(".daily-card") ? "daily" : "card", savedAt: Date.now(),
            bitmap, frame, viewport: viewportKey(), feedKey: feedKey(generation), scene } : null;
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
      image.className = styles.image;
      image.style.clipPath = initial.from.clipPath;
      overlay.append(image);
      const scene = document.createElement("div");
      scene.className = styles.scene;
      // The outer paper consumes pointer hit testing. Making it inert would
      // let an unseen old card receive the click while the route is pending.
      // Its completed click cancels the decoration; its children cannot act or
      // receive focus, and the navigation above it remains usable.
      destinationGeometry.scenery.inert = true;
      scene.setAttribute("aria-hidden", "true");
      scene.dataset.artworkTransitionScene = "";
      scene.dataset.artworkTransitionDirection = returning ? "return" : "open";
      scene.dataset.artworkBackgroundReady = "false";
      scene.style.width = `${document.documentElement.clientWidth}px`;
      const paper = getComputedStyle(document.body, "::before");
      scene.style.backgroundImage = paper.backgroundImage;
      scene.style.backgroundSize = paper.backgroundSize;
      scene.append(destinationGeometry.scenery);
      const sourceNode = { image: source, visibility: source.style.getPropertyValue("visibility"), priority: source.style.getPropertyPriority("visibility") };
      const observer = new MutationObserver(queue);
      const transfer: Transfer = {
        from: location.pathname, to: destination.pathname, paintingId, generation: latest.current.generation,
        direction: returning ? "return" : "open", galleryKind: returning ? entry?.kind : undefined,
        source: source.currentSrc || source.src, bitmap, frame, overlay, image, phase: "waiting", arrived: false, stableFrames: 0,
        scene, scenery: destinationGeometry.scenery, backgroundReady: false, sourceNode, gestureHeld: false,
        observer, timer: setTimeout(() => fade(transfer), ARTWORK_READY_TIMEOUT_MS), raf: 0, animations: [],
        flown: false, finishFlight: () => {},
      };
      current.current = transfer;
      source.style.visibility = "hidden";
      document.body.append(scene, overlay);
      // Both the bitmap pixels and local paper are already available. Neither
      // requires a new image read/decode before the first moving frame.
      transfer.finishFlight = beginArtworkFlight(destination.pathname, generation);
      if (!fly(transfer, destinationGeometry.bitmap, destinationGeometry.frame, true)) { cleanup(transfer); return; }
      // Only the clicked artwork is read. The detail joins this request when its
      // route arrives; text and business components still wait for both visuals.
      if (!returning && latest.current.token) {
        void prefetchPaintingDetail(paintingId, latest.current.token, generation).catch(() => {});
      }
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-gallery-ready", "data-gallery-restoring"] });
      queue();
    };
    const stop = (event?: Event) => {
      // Keep the paper as the hit target through a touch gesture's synthesized
      // click. Removing it on pointerdown would retarget that click at an
      // invisible old card or favorite button. capture() consumes the completed
      // click; UA scroll takeover/cancellation still cleans up immediately.
      if ((event?.type === "touchstart" || (event?.type === "pointerdown"
        && (event as PointerEvent).button === 0 && (event as PointerEvent).isPrimary))
        && event.target === current.current?.scene) {
        current.current.gestureHeld = true;
        return;
      }
      cleanup(current.current, true);
    };
    // Router scroll reset and gallery anchor restoration are expected during a
    // flight. User scrolling is already caught by wheel/touch/key interruptions.
    const onScroll = () => { if (current.current?.phase === "waiting") current.current.stableFrames = 0; queue(); };
    const onVisibility = () => { if (document.hidden) cleanup(current.current, true); };
    cancel.current = stop;
    inspect.current = queue;
    document.addEventListener("click", capture, true);
    const interruptions = ["pointerdown", "keydown", "wheel", "touchstart", "pointercancel", "touchcancel", "contextmenu", "auxclick"] as const;
    for (const event of interruptions) document.addEventListener(event, stop, { capture: true, passive: true });
    document.addEventListener("load", queue, true);
    document.addEventListener("error", queue, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", stop);
    window.addEventListener("popstate", stop);
    window.addEventListener("pagehide", stop);
    window.addEventListener("blur", stop);
    reduced.addEventListener("change", stop);
    return () => {
      cleanup(current.current, true); cancel.current = () => {}; inspect.current = () => {};
      document.removeEventListener("click", capture, true);
      for (const event of interruptions) document.removeEventListener(event, stop, true);
      document.removeEventListener("load", queue, true);
      document.removeEventListener("error", queue, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", stop);
      window.removeEventListener("popstate", stop);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("blur", stop);
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
        <ArtworkViewer concealText title="画作" author="作者" period="年代" image={<img alt="" width={1} height={1} style={{ visibility: "hidden" }} />}
          actions={<><button className="button" tabIndex={-1}>返回画廊</button><button className="button" tabIndex={-1}>引用作品</button><button className="button" tabIndex={-1}>收藏</button></>} />
        <section className="detail-info glass-panel" />
      </div>
    </div>
  </div>;
}

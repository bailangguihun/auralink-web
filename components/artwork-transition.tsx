"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { useSession } from "@/components/session-provider";
import { artworkMotionPlan, fitArtworkRect, intersectArtworkRects, type ArtworkRect } from "@/lib/artwork-transition-geometry";
import styles from "./artwork-transition.module.css";

type GalleryOrigin = {
  paintingId: string; generation: number; kind: "card" | "daily"; savedAt: number;
};

type Transfer = {
  from: string; to: string; paintingId: string; generation: number;
  direction: "open" | "return"; galleryKind?: GalleryOrigin["kind"];
  source: string; bitmap: ArtworkRect; frame: ArtworkRect;
  overlay: HTMLDivElement; image: HTMLImageElement; decoded: boolean;
  phase: "waiting" | "moving" | "fading"; arrived: boolean;
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
    };
    const fade = (transfer: Transfer) => {
      if (current.current !== transfer || transfer.phase !== "waiting") return;
      transfer.phase = "fading";
      transfer.observer.disconnect();
      const animation = transfer.overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: "forwards" });
      animation.id = "artlive-artwork-fallback";
      transfer.animations.push(animation);
      animation.onfinish = () => cleanup(transfer);
    };
    const queue = () => {
      const transfer = current.current;
      if (!transfer || transfer.phase !== "waiting" || transfer.raf) return;
      transfer.raf = requestAnimationFrame(() => { transfer.raf = 0; measure(transfer); });
    };
    const measure = (transfer: Transfer) => {
      if (current.current !== transfer || transfer.phase !== "waiting") return;
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
      if ((target.currentSrc || target.src) !== transfer.source) { cleanup(transfer); return; }
      if (transfer.target?.image !== target) {
        if (transfer.target) { cleanup(transfer); return; }
        const landing = { image: target, visibility: target.style.getPropertyValue("visibility"), priority: target.style.getPropertyPriority("visibility"), decoded: false };
        transfer.target = landing;
        target.style.visibility = "hidden";
        void target.decode().then(() => {
          if (current.current !== transfer) return;
          landing.decoded = true;
          queue();
        }, () => fade(transfer));
      }
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
      const plan = artworkMotionPlan(transfer.bitmap, transfer.frame, destination, destinationFrame);
      if (!plan) { fade(transfer); return; }

      clearTimeout(transfer.timer);
      transfer.observer.disconnect();
      transfer.phase = "moving";
      // Rebase once at the larger endpoint. The flight itself changes no layout
      // dimensions: one uniformly scaled bitmap and an independently moving crop.
      Object.assign(transfer.overlay.style, { width: `${plan.width}px`, height: `${plan.height}px`, transform: plan.from.transform });
      transfer.image.style.clipPath = plan.from.clipPath;
      finishImageReveal(target);
      const mobile = matchMedia("(max-width: 680px)").matches;
      const timing = { duration: (transfer.direction === "return" ? 320 : 360) - (mobile ? 40 : 0), easing: "cubic-bezier(.2, .7, .25, 1)", fill: "both" as const };
      const outer = transfer.overlay.animate([{ transform: plan.from.transform }, { transform: plan.to.transform }], timing);
      outer.id = "artlive-artwork-frame";
      const inner = transfer.image.animate([
        { clipPath: plan.from.clipPath }, { clipPath: plan.to.clipPath },
      ], timing);
      inner.id = "artlive-artwork-image";
      transfer.animations.push(outer, inner);
      outer.onfinish = () => cleanup(transfer);
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
      const bitmap = bitmapRect(source);
      const frame = bitmap && sourceFrame(source, bitmap);
      if (!bitmap || !frame || frame.width < 24 || frame.height < 24) return;
      const initial = artworkMotionPlan(bitmap, frame, bitmap, frame);
      if (!initial) return;
      if (!returning) origin.current = location.pathname === "/gallery"
        ? { paintingId, generation: latest.current.generation, kind: owner?.matches(".daily-card") ? "daily" : "card", savedAt: Date.now() } : null;
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
        observer, timer: setTimeout(() => fade(transfer), 650), raf: 0, animations: [],
      };
      current.current = transfer;
      document.body.append(overlay);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-gallery-ready", "data-gallery-restoring"] });
      void image.decode().then(() => {
        if (current.current !== transfer) return;
        transfer.decoded = true;
        queue();
      }, () => { if (current.current === transfer) cleanup(transfer); });
      queue();
    };
    const stop = () => cleanup();
    const onScroll = () => { if (current.current?.phase === "moving") cleanup(); else queue(); };
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

  return null;
}

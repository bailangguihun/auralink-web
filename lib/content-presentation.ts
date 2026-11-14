import { participating, presentationRoots, revealGroups, hasPreparingAncestor } from "./route-presentation";

const pendingSelector = '[data-page-ready="false"], [data-content-ready="false"], [data-gallery-ready="false"], [data-gallery-restoring="true"], [aria-busy="true"], .route-skeleton, .paper-skeleton, .loading-status';
export type Presentation = { cancel: () => void; finish: () => void };
type Options = {
  kind?: "route" | "content";
  regions?: HTMLElement[];
  ready?: () => boolean;
  current?: () => boolean;
  page?: boolean;
  artwork?: () => boolean;
  onPrepared?: () => void;
  onTimeout?: () => void;
};

/** One preparation/reveal owner for a page, a result region, or appended items.
 * It never mounts components or starts data requests. Nested owners report ready
 * without playing their own animation while an ancestor is preparing/entering. */
export function startPresentation(root: HTMLElement, options: Options = {}): Presentation {
  const regions = options.regions || [root];
  const kind = options.kind || "content";
  const phase = kind === "route" ? "routePhase" : "contentPhase";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false, released = false, timedOut = false, frame = 0, poll = 0, deadline = 0;
  let previousGeometry = "", stableFrames = 0, sharedArtwork = false, visibleSince = performance.now();
  const animations = new Set<Animation>();
  const observers: MutationObserver[] = [];
  const observed = new Set<HTMLElement | ShadowRoot>();
  const images = new WeakMap<HTMLImageElement, { source: string; settled: boolean }>();
  const setPhase = (value: string) => { for (const region of regions) region.dataset[phase] = value; };
  const expose = () => {
    for (const region of regions) { region.removeAttribute("inert"); region.removeAttribute("aria-hidden"); }
  };
  for (const region of regions) {
    if (kind === "content" && region.dataset.contentPhase === "error") region.hidden = false;
    if (kind === "content") { region.classList.add("content-reveal-region"); region.dataset.contentReady = "false"; }
    region.dataset[phase] = "preparing";
    region.setAttribute("aria-hidden", "true"); region.setAttribute("inert", "");
  }
  const schedule = () => {
    if (!disposed && !released && !timedOut && !frame) frame = requestAnimationFrame(check);
  };
  const finish = () => {
    if (!released) return;
    for (const animation of animations) { animation.onfinish = null; animation.cancel(); }
    animations.clear(); setPhase("ready");
  };
  const stopWaiting = () => {
    cancelAnimationFrame(frame); frame = 0; clearTimeout(poll); clearTimeout(deadline);
    for (const observer of observers) observer.disconnect();
  };
  const observe = (scope: HTMLElement | ShadowRoot) => {
    if (observed.has(scope)) return;
    observed.add(scope);
    const observer = new MutationObserver(schedule);
    observer.observe(scope, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["aria-busy", "data-page-ready", "data-content-ready", "data-gallery-ready", "data-gallery-restoring", "class", "hidden", "open", "src", "srcset", "style"] });
    observers.push(observer);
  };
  const release = (groups: HTMLElement[]) => {
    released = true; stopWaiting();
    for (const region of regions) {
      if (kind === "content") region.dataset.contentReady = "true";
      for (const scope of presentationRoots(region)) for (const element of scope.querySelectorAll<HTMLElement>(".content-reveal")) element.dataset.routeSettled = "";
    }
    const nested = kind === "content" && regions.some(hasPreparingAncestor);
    let row = -1, top = -Infinity;
    const rows = groups.map(group => {
      const rect = group.getBoundingClientRect();
      if (rect.top > top + 8) { row++; top = rect.top; }
      return row;
    });
    const interval = Math.min(80, 480 / Math.max(1, row));
    const startTime = document.timeline.currentTime;
    for (const [index, group] of groups.entries()) {
      if (nested || reduced.matches || typeof group.animate !== "function") continue;
      if (sharedArtwork && (group.matches(".detail-artwork") || !!group.querySelector("[data-artwork-source], [data-artwork-target]"))) continue;
      const animation = group.animate([{ opacity: 0, translate: "0 20px" }, { opacity: 1, translate: "0 0" }],
        { duration: 500, delay: rows[index] * interval, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "both" });
      animation.id = kind === "route" ? "artlive-route-reveal" : "artlive-content-reveal";
      animation.startTime = startTime; animations.add(animation);
      animation.onfinish = () => { animations.delete(animation); animation.cancel(); if (!animations.size && !disposed) setPhase("ready"); };
    }
    expose(); setPhase(animations.size ? "entering" : "ready"); options.onPrepared?.();
  };
  function check() {
    frame = 0;
    if (disposed || released || timedOut) return;
    if (!root.isConnected || options.current?.() === false) { cancel(); return; }
    clearTimeout(poll); poll = window.setTimeout(schedule, 100);
    if (!regions.some(participating)) {
      visibleSince = performance.now(); stableFrames = 0;
      if (kind === "content" && options.ready?.() !== false) release([]);
      return;
    }
    const flight = options.artwork?.() || false; sharedArtwork ||= flight;
    if (options.ready?.() === false || document.fonts.status === "loading") return;
    const scopes = [...new Set(regions.flatMap(presentationRoots))]; scopes.forEach(observe);
    if (options.page && !root.querySelector("main, [data-navigation-page]")) return;
    if (scopes.some(scope => Array.from(scope.querySelectorAll<HTMLElement>(pendingSelector)).some(participating))) { stableFrames = 0; return; }
    let pendingImages = false;
    for (const scope of scopes) for (const image of scope.querySelectorAll<HTMLImageElement>("img")) {
      if (!participating(image) || !(image.currentSrc || image.src)) continue;
      if (image.loading === "lazy") image.loading = "eager";
      const source = image.currentSrc || image.src;
      let state = images.get(image);
      if (!state || state.source !== source) {
        state = { source, settled: false }; images.set(image, state);
        const current = state;
        void image.decode().catch(() => {}).then(() => { if (!disposed && images.get(image) === current) { current.settled = true; schedule(); } });
      }
      if (!image.complete || !state.settled) pendingImages = true;
    }
    if (pendingImages || flight) { stableFrames = 0; return; }
    const groups = regions.flatMap(region => revealGroups(region));
    groups.sort((a, b) => { const first = a.getBoundingClientRect(), second = b.getBoundingClientRect(); return Math.abs(first.top - second.top) <= 8 ? first.left - second.left : first.top - second.top; });
    if (!groups.length) return;
    const geometry = JSON.stringify(groups.map(element => {
      const box = element.getBoundingClientRect(); return [box.left, box.top, box.width, box.height].map(value => Math.round(value * 4));
    }));
    stableFrames = geometry === previousGeometry ? stableFrames + 1 : 1; previousGeometry = geometry;
    if (stableFrames < 2) { schedule(); return; }
    release(groups);
  }
  const timeout = () => {
    if (disposed || released) return;
    const remaining = 30_000 - (performance.now() - visibleSince);
    if (!regions.some(participating) || remaining > 0) { deadline = window.setTimeout(timeout, Math.max(100, remaining)); return; }
    timedOut = true; stopWaiting(); setPhase("error");
    for (const region of regions) if (kind === "content") { region.dataset.contentReady = "true"; region.hidden = true; }
    options.onTimeout?.();
  };
  deadline = window.setTimeout(timeout, 30_000);
  const bodyObserver = new MutationObserver(schedule); bodyObserver.observe(document.body, { childList: true }); observers.push(bodyObserver);
  const interaction = () => { if (released) finish(); };
  const resize = () => { if (released) finish(); else { stableFrames = 0; schedule(); } };
  for (const event of ["pointerdown", "keydown", "wheel", "touchstart"] as const) document.addEventListener(event, interaction, { capture: true, passive: true });
  window.addEventListener("resize", resize); reduced.addEventListener("change", resize); document.fonts.addEventListener("loadingdone", schedule);
  function cancel() {
    if (disposed) return;
    disposed = true; stopWaiting();
    for (const animation of animations) { animation.onfinish = null; animation.cancel(); }
    animations.clear(); expose(); setPhase("ready");
    for (const region of regions) if (kind === "content") region.dataset.contentReady = "true";
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"] as const) document.removeEventListener(event, interaction, true);
    window.removeEventListener("resize", resize); reduced.removeEventListener("change", resize); document.fonts.removeEventListener("loadingdone", schedule);
  }
  schedule();
  return { cancel, finish };
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const SCREEN_IDS = ["home-welcome", "home-features"] as const;
const WHEEL_THRESHOLD = 40;
const GESTURE_GAP_MS = 180;
const TRANSITION_MS = 480;

/** Two homepage stops, with normal scrolling inside an overflowing second screen. */
export function HomeScreens({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const [screen, setScreen] = useState<"welcome" | "features">("welcome");

  useEffect(() => {
    const area = root.current;
    if (!area) return;
    const panels = SCREEN_IDS.map(id => area.querySelector<HTMLElement>(`#${id}`));
    if (!panels[0] || !panels[1]) return;
    const contents = area.querySelector<HTMLElement>(".home-features-scroll");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let active = 0;
    let target: number | null = null;
    let animation = 0;
    let resizeFrame = 0;
    let wheelTime = 0;
    let wheelDirection = 0;
    let wheelTotal = 0;
    let wheelConsumed = false;
    let innerGesture = false;
    let touch: { x: number; y: number; fromTop: boolean; switched: boolean } | null = null;
    const originalSnap = area.style.scrollSnapType;
    const originalBehavior = area.style.scrollBehavior;

    const topFor = (index: number) => panels[index]!.getBoundingClientRect().top
      - area.getBoundingClientRect().top + area.scrollTop;
    const publish = (index: number) => {
      active = index;
      setScreen(index === 0 ? "welcome" : "features");
    };
    const restoreSnap = () => {
      area.style.scrollSnapType = originalSnap;
      area.style.scrollBehavior = originalBehavior;
    };
    const replaceHash = (index: number, explicit: boolean) => {
      if (!explicit && !SCREEN_IDS.some(id => window.location.hash === `#${id}`)) return;
      const hash = `#${SCREEN_IDS[index]}`;
      if (window.location.hash !== hash) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
      }
    };
    const goTo = (index: number, immediate = false, explicitHash = false) => {
      index = Math.max(0, Math.min(1, index));
      cancelAnimationFrame(animation);
      const destination = topFor(index);
      const start = area.scrollTop;
      target = index;
      replaceHash(index, explicitHash);
      area.style.scrollSnapType = "none";
      area.style.scrollBehavior = "auto";
      const finish = () => {
        area.scrollTo({ top: destination, behavior: "instant" });
        target = null;
        animation = 0;
        publish(index);
        restoreSnap();
      };
      if (immediate || reducedMotion.matches || Math.abs(destination - start) < 1) {
        finish();
        return;
      }
      const began = performance.now();
      const step = (time: number) => {
        const progress = Math.min(1, (time - began) / TRANSITION_MS);
        const eased = 1 - (1 - progress) ** 3;
        area.scrollTo({ top: start + (destination - start) * eased, behavior: "instant" });
        if (progress < 1) animation = requestAnimationFrame(step);
        else finish();
      };
      animation = requestAnimationFrame(step);
    };
    const insideContents = (eventTarget: EventTarget | null) => eventTarget instanceof Node && Boolean(contents?.contains(eventTarget));
    const canScrollContents = (direction: number) => Boolean(contents && (direction < 0
      ? contents.scrollTop > 1
      : contents.scrollTop + contents.clientHeight < contents.scrollHeight - 1));
    const onScroll = () => {
      const secondTop = topFor(1);
      publish(area.scrollTop >= secondTop / 2 ? 1 : 0);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
      const direction = Math.sign(event.deltaY);
      const now = performance.now();
      // A direction reversal begins a fresh intention once the transition ends.
      const fresh = now - wheelTime > GESTURE_GAP_MS || (direction !== wheelDirection && target === null);
      if (fresh) {
        wheelTotal = 0;
        wheelConsumed = false;
        innerGesture = false;
      }
      wheelTime = now;
      wheelDirection = direction;
      if (target !== null) {
        wheelConsumed = true;
        event.preventDefault();
        return;
      }
      if (wheelConsumed) {
        event.preventDefault();
        return;
      }
      if (active === 1 && insideContents(event.target)) {
        if (canScrollContents(direction)) {
          innerGesture = true;
          return;
        }
        // Reaching the top during a long inner scroll must not also flip a screen.
        if (innerGesture) {
          event.preventDefault();
          return;
        }
      }
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? area.clientHeight : 1;
      wheelTotal += event.deltaY * unit;
      if (Math.abs(wheelTotal) < WHEEL_THRESHOLD) return;
      wheelConsumed = true;
      goTo(active + direction);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || (!area.contains(link) && !link.closest(".topbar")) || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname !== window.location.pathname
        || !SCREEN_IDS.some(id => destination.hash === `#${id}`)) return;
      // Capture header Links before Next starts its own scroll. Their React
      // handlers still run (e.g. closing the menu), while goTo cancels our RAF.
      event.preventDefault();
      goTo(destination.hash === "#home-features" ? 1 : 0, false, true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const element = event.target instanceof Element ? event.target : null;
      if (!element || (element !== document.body && element !== document.documentElement && !area.contains(element))) return;
      if (element.closest('a, button, input, textarea, select, [contenteditable="true"], [role="slider"], [role="tab"]')) return;
      if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) return;
      event.preventDefault();
      if (target !== null) return;
      const direction = ["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey) ? -1 : 1;
      if (active === 1 && contents && canScrollContents(direction)) {
        if (event.key === "Home" || event.key === "End") {
          contents.scrollTo({ top: event.key === "Home" ? 0 : contents.scrollHeight, behavior: "instant" });
        } else {
          const distance = event.key.startsWith("Arrow") ? 40 : contents.clientHeight * .85;
          contents.scrollBy({ top: direction * distance, behavior: "instant" });
        }
        return;
      }
      goTo(event.key === "Home" ? 0 : event.key === "End" ? 1 : active + direction);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { touch = null; return; }
      const point = event.touches[0];
      touch = { x: point.clientX, y: point.clientY,
        fromTop: active === 1 && insideContents(event.target) && Boolean(contents && contents.scrollTop <= 1), switched: false };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1) return;
      if (target !== null || touch.switched) {
        if (event.cancelable) event.preventDefault();
        return;
      }
      const dx = event.touches[0].clientX - touch.x;
      const dy = event.touches[0].clientY - touch.y;
      if (touch.fromTop && dy > 50 && dy > Math.abs(dx) * 1.25) {
        if (event.cancelable) event.preventDefault();
        touch.switched = true;
        goTo(0);
      }
    };
    const onTouchEnd = () => { touch = null; };
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const panel = event.target.closest("#home-welcome, #home-features");
      if (!panel) return;
      const index = panel.id === "home-features" ? 1 : 0;
      if (index !== (target ?? active)) goTo(index, true);
    };
    const onResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => goTo(target ?? active, true));
    };
    const onHash = () => {
      const index = SCREEN_IDS.findIndex(id => window.location.hash === `#${id}`);
      if (index !== -1) goTo(index, true);
    };
    const onMotionChange = () => { if (reducedMotion.matches && target !== null) goTo(target, true); };

    area.addEventListener("wheel", onWheel, { passive: false });
    area.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    area.addEventListener("focusin", onFocus);
    area.addEventListener("touchstart", onTouchStart, { passive: true });
    area.addEventListener("touchmove", onTouchMove, { passive: false });
    area.addEventListener("touchend", onTouchEnd);
    area.addEventListener("touchcancel", onTouchEnd);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    reducedMotion.addEventListener("change", onMotionChange);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
    observer?.observe(area);
    onHash();
    onScroll();
    return () => {
      cancelAnimationFrame(animation);
      cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      restoreSnap();
      area.removeEventListener("wheel", onWheel);
      area.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
      area.removeEventListener("focusin", onFocus);
      area.removeEventListener("touchstart", onTouchStart);
      area.removeEventListener("touchmove", onTouchMove);
      area.removeEventListener("touchend", onTouchEnd);
      area.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      reducedMotion.removeEventListener("change", onMotionChange);
    };
  }, []);

  return <main ref={root} className="home-page" data-home-screen={screen} tabIndex={-1}>{children}</main>;
}

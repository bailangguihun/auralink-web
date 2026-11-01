"use client";

import { useLayoutEffect, useRef } from "react";

import styles from "./navigation-indicator.module.css";

type Position = { x: number; y: number; width: number };

/** A decorative sibling of the links; it never changes navigation geometry. */
export function NavigationIndicator({ pathname, menuOpen }: { pathname: string; menuOpen: boolean }) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const updateRef = useRef<(animate: boolean) => void>(() => {});
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    const navigation = indicator?.parentElement;
    if (!indicator || !navigation) return;

    const desktop = window.matchMedia("(min-width: 901px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let position: Position | null = null;
    let animation: Animation | undefined;
    let disposed = false;

    const update = (animate: boolean) => {
      if (disposed) return;
      const active = navigation.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
      if (!desktop.matches || !active || !navigation.getClientRects().length) {
        animation?.cancel();
        indicator.hidden = true;
        delete navigation.dataset.navigationIndicator;
        position = null;
        return;
      }

      const navBox = navigation.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      const next = {
        x: activeBox.left - navBox.left + activeBox.width / 4,
        y: activeBox.bottom - navBox.top - 5,
        width: activeBox.width / 2,
      };
      if (position?.x === next.x && position.y === next.y && position.width === next.width) return;

      // Sample an in-flight line before cancelling so rapid navigation stays continuous.
      const current = indicator.getBoundingClientRect();
      const wasVisible = position !== null;
      animation?.cancel();
      indicator.hidden = false;
      indicator.style.width = `${next.width}px`;
      indicator.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
      navigation.dataset.navigationIndicator = "ready";

      if (animate && wasVisible && !reducedMotion.matches && typeof indicator.animate === "function") {
        animation = indicator.animate([
          { transform: `translate3d(${current.left - navBox.left}px, ${current.top - navBox.top}px, 0)`, width: `${current.width}px` },
          { transform: `translate3d(${next.x}px, ${next.y}px, 0)`, width: `${next.width}px` },
        ], { duration: 200, easing: "cubic-bezier(.2,.7,.2,1)" });
      }
      position = next;
    };

    updateRef.current = update;
    const settle = () => update(false);
    const changeMotion = () => { animation?.cancel(); settle(); };
    const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(settle);
    resizeObserver?.observe(navigation);
    navigation.querySelectorAll("a").forEach(link => resizeObserver?.observe(link));
    window.addEventListener("resize", settle);
    desktop.addEventListener("change", settle);
    reducedMotion.addEventListener("change", changeMotion);
    document.fonts?.addEventListener("loadingdone", settle);
    void document.fonts?.ready.then(settle);
    settle();

    return () => {
      disposed = true;
      animation?.cancel();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", settle);
      desktop.removeEventListener("change", settle);
      reducedMotion.removeEventListener("change", changeMotion);
      document.fonts?.removeEventListener("loadingdone", settle);
      delete navigation.dataset.navigationIndicator;
      updateRef.current = () => {};
    };
  }, []);

  useLayoutEffect(() => {
    updateRef.current(previousPath.current !== pathname);
    previousPath.current = pathname;
  }, [pathname, menuOpen]);

  return <span ref={indicatorRef} className={styles.indicator} hidden aria-hidden="true" />;
}

"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { useSession } from "@/components/session-provider";
import { getGalleryFeedSnapshot } from "@/lib/gallery-feed";
import { requiresAuthentication } from "@/lib/navigation";
import { hasArtworkTransition } from "@/components/artwork-transition";

type Entry = { pathname: string; consumed: boolean; expiresAt: number };

/** Animate the mounted destination once, without retaining or remounting routes. */
export function RouteMotion() {
  const pathname = usePathname();
  const { status, sessionIdentity } = useSession();
  const previous = useRef(pathname);
  const traversal = useRef<string | null>(null);
  const entry = useRef<Entry | null>(null);
  const animations = useRef(new Set<Animation>());
  const cancelWaiting = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const stop = () => {
      if (entry.current) entry.current.consumed = true;
      cancelWaiting.current();
      for (const animation of animations.current) animation.cancel();
      animations.current.clear();
    };
    const onPopState = () => {
      traversal.current = window.location.pathname !== previous.current ? window.location.pathname : null;
      stop();
    };
    // Gallery saves card geometry during click capture. Restore natural geometry
    // before that handler, and before touch/keyboard scrolling can measure it.
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "click"] as const;
    for (const event of events) document.addEventListener(event, stop, { capture: true, passive: true });
    window.addEventListener("popstate", onPopState);
    window.addEventListener("resize", stop);
    document.addEventListener("visibilitychange", stop);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.addEventListener("change", stop);
    return () => {
      stop();
      for (const event of events) document.removeEventListener(event, stop, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("resize", stop);
      document.removeEventListener("visibilitychange", stop);
      reduced.removeEventListener("change", stop);
    };
  }, []);

  useLayoutEffect(() => {
    if (previous.current !== pathname) {
      const restoring = traversal.current === pathname
        || (pathname === "/gallery" && Boolean(getGalleryFeedSnapshot(sessionIdentity.generation)));
      previous.current = pathname;
      traversal.current = null;
      entry.current = { pathname, consumed: restoring || pathname === "/", expiresAt: performance.now() + 5000 };
    }
    const pending = entry.current;
    if (!pending || pending.consumed || pending.pathname !== pathname) return;
    if (performance.now() >= pending.expiresAt || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pending.consumed = true;
      return;
    }
    if (requiresAuthentication(pathname) && status !== "authenticated") {
      if (status !== "loading") pending.consumed = true;
      return;
    }

    const running: Animation[] = [];
    const activeAnimations = animations.current;
    const disconnect = () => { observer.disconnect(); clearTimeout(timeout); };
    cancelWaiting.current = disconnect;
    const animate = (node: HTMLElement, kind: string, distance: number, duration = 300, delay = 0) => {
      if (typeof node.animate !== "function") return;
      const frames: Keyframe[] = distance
        ? [{ opacity: .35, translate: `0 ${distance}px` }, { opacity: 1, translate: "0 0" }]
        : [{ opacity: .5 }, { opacity: 1 }];
      const animation = node.animate(frames, { duration, delay, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "both" });
      animation.id = `artlive-route-${kind}`;
      running.push(animation);
      activeAnimations.add(animation);
      const clear = () => { activeAnimations.delete(animation); };
      animation.oncancel = clear;
      animation.onfinish = () => { clear(); animation.cancel(); };
    };
    const visible = (node: HTMLElement | null): node is HTMLElement => Boolean(node && !node.closest("[hidden]") && node.getClientRects().length);
    const start = () => {
      if (pending.consumed || window.location.pathname !== pathname) return;
      if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        pending.consumed = true;
        disconnect();
        return;
      }
      const distance = window.matchMedia("(max-width: 680px)").matches ? 4 : 8;
      if (pathname === "/login" || pathname === "/register") {
        const card = document.querySelector<HTMLElement>("form.auth-form")?.closest<HTMLElement>(".auth-card") || null;
        if (!visible(card)) return;
        pending.consumed = true;
        disconnect();
        animate(card, "auth", 0, 200);
      } else if (pathname.startsWith("/gallery/")) {
        const artwork = document.querySelector<HTMLElement>(".detail-artwork");
        const info = document.querySelector<HTMLElement>(".detail-info");
        if (!visible(artwork) || !visible(info)) return;
        pending.consumed = true;
        disconnect();
        if (!hasArtworkTransition(pathname, sessionIdentity.generation)) animate(artwork, "artwork", distance);
        animate(info, "info", distance, 300, 50);
      } else {
        const page = document.querySelector<HTMLElement>("[data-navigation-page]") || document.querySelector<HTMLElement>("main");
        if (!visible(page) || page.querySelector(".route-skeleton")) return;
        pending.consumed = true;
        disconnect();
        if (hasArtworkTransition(pathname, sessionIdentity.generation)) return;
        animate(page, "page", distance);
      }
    };
    const observer = new MutationObserver(start);
    // Slow or failed loads remain usable; no late animation after a later retry.
    const timeout = setTimeout(() => { pending.consumed = true; disconnect(); }, Math.max(0, pending.expiresAt - performance.now()));
    observer.observe(document.body, { subtree: true, childList: true });
    start();
    return () => {
      disconnect();
      if (cancelWaiting.current === disconnect) cancelWaiting.current = () => {};
      for (const animation of running) { activeAnimations.delete(animation); animation.cancel(); }
    };
  }, [pathname, status, sessionIdentity.generation]);

  return null;
}

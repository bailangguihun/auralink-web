"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSession } from "@/components/session-provider";
import { api, ApiError } from "@/lib/api";
import { getGalleryFeedSnapshot } from "@/lib/gallery-feed";
import { INITIAL_GALLERY_QUERY } from "@/lib/gallery-order";
import { galleryFirstKey, KNOWLEDGE_STATISTICS_KEY, KNOWLEDGE_TTL_MS, readGalleryFirstPage } from "@/lib/navigation-data";
import { readCache } from "@/lib/read-cache";

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
function connection() { return (navigator as Navigator & { connection?: Connection }).connection; }
function canPrefetch() {
  const network = connection();
  return document.visibilityState === "visible" && navigator.onLine && !network?.saveData
    && !["slow-2g", "2g", "3g"].includes(network?.effectiveType || "");
}

/** Intent-only read warming. Never mounts pages, starts streams, or fetches images. */
export function useNavigationPrefetch(pathname: string) {
  const { status, token, sessionIdentity, isCurrentSession } = useSession();
  const candidate = useRef<string | null>(null);
  const active = useRef<{ href: string; controller: AbortController } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idle = useRef<number | undefined>(undefined);
  const schedule = useRef<(delay: number) => void>(() => {});

  const cancelQueued = useCallback(() => {
    candidate.current = null;
    clearTimeout(timer.current);
    if (idle.current !== undefined) window.cancelIdleCallback?.(idle.current);
    idle.current = undefined;
  }, []);

  useEffect(() => {
    let disposed = false;
    const run = () => {
      if (disposed || active.current || !candidate.current || !canPrefetch()) return;
      // A hover must never compete with the current screen's first meaningful render.
      const screenBusy = Array.from(document.querySelectorAll('main [aria-busy="true"], main .paper-skeleton')).some(node => node.getClientRects().length > 0);
      if (document.readyState !== "complete" || screenBusy) {
        schedule.current(200); return;
      }
      const href = candidate.current;
      candidate.current = null;
      if (href === pathname || (status !== "authenticated" && status !== "anonymous")) return;
      if (href === "/gallery" && getGalleryFeedSnapshot(sessionIdentity.generation)?.page) return;
      if (href === "/knowledge" && (!token || status !== "authenticated")) return;
      const controller = new AbortController(); active.current = { href, controller };
      const timeout = setTimeout(() => controller.abort(), 8000);
      const request = href === "/gallery"
        ? readGalleryFirstPage(INITIAL_GALLERY_QUERY, token, sessionIdentity.generation, controller.signal)
        : readCache.read(sessionIdentity.generation, KNOWLEDGE_STATISTICS_KEY, signal => api.paintingStatistics(token!, signal), { ttlMs: KNOWLEDGE_TTL_MS, signal: controller.signal });
      void request.catch(error => {
        // Speculation never changes login state or displays errors. A real visit retries.
        if (isCurrentSession(sessionIdentity) && error instanceof ApiError && [401, 403].includes(error.status)) {
          readCache.invalidate(sessionIdentity.generation, href === "/gallery" ? galleryFirstKey(INITIAL_GALLERY_QUERY) : KNOWLEDGE_STATISTICS_KEY);
        }
      }).finally(() => {
        clearTimeout(timeout);
        if (active.current?.controller === controller) active.current = null;
        if (candidate.current) schedule.current(150);
      });
    };
    schedule.current = delay => {
      clearTimeout(timer.current);
      if (idle.current !== undefined) window.cancelIdleCallback?.(idle.current);
      timer.current = setTimeout(() => {
        if (disposed || !candidate.current || !canPrefetch()) return;
        if (window.requestIdleCallback) idle.current = window.requestIdleCallback(run);
        else run();
      }, delay);
    };
    const suspend = () => {
      if (!canPrefetch()) { cancelQueued(); active.current?.controller.abort(); }
    };
    const network = connection();
    document.addEventListener("visibilitychange", suspend);
    window.addEventListener("offline", suspend);
    network?.addEventListener("change", suspend);
    return () => {
      disposed = true;
      cancelQueued();
      document.removeEventListener("visibilitychange", suspend);
      window.removeEventListener("offline", suspend);
      network?.removeEventListener("change", suspend);
      // Let a navigation consumer join an already-running read; its own signal owns it.
    };
  }, [pathname, status, token, sessionIdentity, isCurrentSession, cancelQueued]);

  useEffect(() => {
    const pending = active.current;
    if (pending && pending.href !== pathname) {
      // A different destination gets the bandwidth; a matching one joins the read.
      pending.controller.abort(); active.current = null;
    }
  }, [pathname]);
  useEffect(() => () => { active.current?.controller.abort(); }, []);

  const prepare = useCallback((href: string) => {
    cancelQueued();
    if ((href !== "/gallery" && href !== "/knowledge") || href === pathname || !canPrefetch()) return;
    candidate.current = href;
    schedule.current(150);
  }, [pathname, cancelQueued]);
  const cancel = useCallback((href: string) => { if (candidate.current === href) cancelQueued(); }, [cancelQueued]);
  return { prepare, cancel };
}

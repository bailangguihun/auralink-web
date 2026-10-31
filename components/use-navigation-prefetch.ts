"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useSession } from "@/components/session-provider";
import { api, ApiError } from "@/lib/api";
import { getGalleryFeedSnapshot } from "@/lib/gallery-feed";
import { INITIAL_GALLERY_QUERY } from "@/lib/gallery-order";
import { DAILY_PAINTING_KEY, DAILY_PAINTING_TTL_MS, galleryFirstKey, KNOWLEDGE_GRAPH_KEY, KNOWLEDGE_STATISTICS_KEY, KNOWLEDGE_TTL_MS, readGalleryFirstPage } from "@/lib/navigation-data";
import { NAVIGATION_ROUTES, preloadNavigationModule } from "@/lib/navigation-preload";
import { readCache } from "@/lib/read-cache";

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
type Task = { key: string; href: string; kind: "code" | "data"; run: (signal: AbortSignal) => Promise<unknown>; cacheKey?: string };
type Active = { task: Task; generation: number; controller: AbortController; resume: boolean };
function connection() { return (navigator as Navigator & { connection?: Connection }).connection; }
function canPrefetch() {
  const network = connection();
  return document.visibilityState === "visible" && navigator.onLine && !network?.saveData
    && !["slow-2g", "2g", "3g"].includes(network?.effectiveType || "");
}

/** Wait for real content, including visible images, but not off-screen lazy media. */
function currentPageReady() {
  if (document.readyState !== "complete") return false;
  const main = document.querySelector("[data-navigation-page]") || document.querySelector("main");
  if (!main) return false;
  const loadingSelector = '[aria-busy="true"], .paper-skeleton, .loading-status';
  if ((main.matches(loadingSelector) && main.getClientRects().length > 0)
    || Array.from(main.querySelectorAll(loadingSelector))
    .some(node => node.getClientRects().length > 0)) return false;
  return Array.from(main.querySelectorAll("img")).every(image => {
    const rect = image.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
      && rect.top < window.innerHeight && rect.left < window.innerWidth;
    return !visible || image.complete;
  });
}

/** Current page first, then bounded read/code warming. Never mount a hidden page. */
export function useNavigationPrefetch(pathname: string) {
  const router = useRouter();
  const { status, token, sessionIdentity, isCurrentSession } = useSession();
  const active = useRef<Active | null>(null);
  const completed = useRef({ generation: -1, keys: new Set<string>() });
  const latest = useRef({ pathname, generation: sessionIdentity.generation });
  latest.current = { pathname, generation: sessionIdentity.generation };
  const wake = useRef<() => void>(() => {});
  const prioritize = useRef<(href: string) => void>(() => {});

  useEffect(() => {
    if (status !== "anonymous" && status !== "authenticated") return;
    if (completed.current.generation !== sessionIdentity.generation) {
      completed.current = { generation: sessionIdentity.generation, keys: new Set() };
    }
    const done = completed.current.keys;
    let disposed = false;
    let scheduled = false;
    let idle: number | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;

    const tasksFor = (href: string): Task[] => {
      if (href === pathname) return [];
      const tasks: Task[] = [{ key: "code:" + href, href, kind: "code", run: async () => {
        router.prefetch(href);
        // Next disables route prefetch in dev; imports still warm client modules.
        // Effects, streams and actions only run when a page is actually mounted.
        await preloadNavigationModule(href);
      } }];
      if (href === "/gallery") {
        if (!getGalleryFeedSnapshot(sessionIdentity.generation)?.page) {
          const key = galleryFirstKey(INITIAL_GALLERY_QUERY);
          tasks.push({ key: "data:" + key, cacheKey: key, href, kind: "data", run: signal =>
            readGalleryFirstPage(INITIAL_GALLERY_QUERY, token, sessionIdentity.generation, signal) });
        }
        tasks.push({ key: "data:" + DAILY_PAINTING_KEY, cacheKey: DAILY_PAINTING_KEY, href, kind: "data", run: signal =>
          readCache.read(sessionIdentity.generation, DAILY_PAINTING_KEY, shared => api.dailyPainting(token, shared), { ttlMs: DAILY_PAINTING_TTL_MS, signal }) });
      }
      if (href === "/knowledge" && token && status === "authenticated") {
        for (const [key, loader] of [[KNOWLEDGE_STATISTICS_KEY, api.paintingStatistics], [KNOWLEDGE_GRAPH_KEY, api.poetryGraph]] as const) {
          tasks.push({ key: "data:" + key, cacheKey: key, href, kind: "data", run: signal =>
            readCache.read<unknown>(sessionIdentity.generation, key, shared => loader(token, shared), { ttlMs: KNOWLEDGE_TTL_MS, signal }) });
        }
      }
      return tasks;
    };
    const routes = [...NAVIGATION_ROUTES, ...(status === "authenticated" ? ["/me", "/account"] : ["/login", "/register"])];
    let queue = routes.flatMap(tasksFor).filter(task => !done.has(task.key));

    const cancelSchedule = () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearTimeout(fallback);
      idle = undefined; frame = undefined; scheduled = false;
    };
    // DOM loading indicators can change before the previous effect is cleaned up.
    // Use the latest destination, not this effect's captured pathname.
    const isForegroundRequest = (request: Active) => request.generation === latest.current.generation
      && [latest.current.pathname, window.location.pathname].includes(request.task.href);
    const run = () => {
      scheduled = false;
      if (disposed || active.current || !canPrefetch() || !currentPageReady()) return;
      const task = queue.shift();
      if (!task) return;
      const request: Active = { task, generation: sessionIdentity.generation, controller: new AbortController(), resume: false };
      active.current = request;
      const timeout = task.kind === "data" ? setTimeout(() => request.controller.abort(), 8000) : undefined;
      void task.run(request.controller.signal).catch(error => {
        // Speculative failures never log out the user or present page errors.
        if (task.cacheKey && isCurrentSession(sessionIdentity) && error instanceof ApiError && [401, 403].includes(error.status)) {
          readCache.invalidate(sessionIdentity.generation, task.cacheKey);
        }
      }).finally(() => {
        clearTimeout(timeout);
        if (active.current === request) active.current = null;
        if (!disposed) {
          if (request.resume) queue.unshift(task);
          else done.add(task.key); // Failed reads retry on a real visit, never in a background loop.
        }
        wake.current();
      });
    };
    const schedule = () => {
      if (disposed || (!active.current && !queue.length)) return;
      const allowed = canPrefetch() && currentPageReady();
      const pending = active.current;
      if (!allowed) {
        cancelSchedule();
        if (pending && !isForegroundRequest(pending)) {
          pending.resume = true;
          pending.controller.abort();
        }
        return;
      }
      if (scheduled || pending || !queue.length) return;
      scheduled = true;
      // Let newly committed page content paint before background work starts.
      const afterIdle = () => { frame = requestAnimationFrame(() => { frame = requestAnimationFrame(run); }); };
      if (window.requestIdleCallback) idle = window.requestIdleCallback(afterIdle, { timeout: 1000 });
      else fallback = setTimeout(afterIdle, 0);
    };
    wake.current = schedule;
    prioritize.current = href => {
      if (!routes.includes(href) || href === pathname) return;
      const wanted = tasksFor(href).filter(task => active.current?.task.key !== task.key
        && (task.kind === "data" || !done.has(task.key)));
      const keys = new Set(wanted.map(task => task.key));
      queue = [...wanted, ...queue.filter(task => !keys.has(task.key))];
      schedule();
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["aria-busy", "class", "src", "style", "hidden"] });
    document.addEventListener("load", schedule, true);
    document.addEventListener("error", schedule, true);
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("load", schedule);
    window.addEventListener("online", schedule);
    window.addEventListener("offline", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    const network = connection();
    network?.addEventListener("change", schedule);
    schedule();
    return () => {
      disposed = true;
      cancelSchedule();
      observer.disconnect();
      document.removeEventListener("load", schedule, true);
      document.removeEventListener("error", schedule, true);
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("load", schedule);
      window.removeEventListener("online", schedule);
      window.removeEventListener("offline", schedule);
      window.removeEventListener("scroll", schedule);
      network?.removeEventListener("change", schedule);
      prioritize.current = () => {};
      wake.current = () => {};
      const pending = active.current;
      // A foreground reader entering the same page can join the shared request.
      if (pending && !isForegroundRequest(pending)) {
        pending.controller.abort();
      }
    };
  }, [pathname, status, token, sessionIdentity, isCurrentSession, router]);

  useEffect(() => () => { active.current?.controller.abort(); }, []);
  const prepare = useCallback((href: string) => prioritize.current(href), []);
  return { prepare };
}

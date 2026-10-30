"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "@/components/session-provider";
import { api, ApiError, errorMessage, isAbortError } from "@/lib/api";
import { readCache } from "@/lib/read-cache";
import { galleryFirstKey, readGalleryFirstPage } from "@/lib/navigation-data";
import {
  acceptGalleryPage, clearGalleryFeedSnapshot, emptyGalleryFeed, galleryFeedKey, galleryFeedQuery,
  getGalleryFeedSnapshot, nextGalleryFeedQuery, saveGalleryFeedSnapshot, type GalleryFeedData,
} from "@/lib/gallery-feed";
import type { PaintingPage, PaintingQuery } from "@/lib/types";

export { getGalleryFeedSnapshot } from "@/lib/gallery-feed";

type FeedState = {
  key: string;
  feed: GalleryFeedData;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  moreError: string | null;
};

function initialState(key: string, query: PaintingQuery, generation: number): FeedState {
  const retained = getGalleryFeedSnapshot(generation);
  const first = typeof window !== "undefined" ? readCache.peek<PaintingPage>(generation, galleryFirstKey(query)) : undefined;
  const feed = retained && galleryFeedKey(retained.query) === galleryFeedKey(query) ? retained
    : first ? acceptGalleryPage(emptyGalleryFeed(query), query, first) : emptyGalleryFeed(query);
  return { key, feed, loading: !feed.page, loadingMore: false, error: null, moreError: null };
}

/** Successful pages append; query/session changes hide old results immediately. */
export function useGalleryFeed(query: PaintingQuery, token: string | null | undefined, ready: boolean, generation: number) {
  const { sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const normalizedQuery = useMemo(() => galleryFeedQuery(query), [query]);
  const key = `${generation}:${galleryFeedKey(normalizedQuery)}`;
  const [state, setState] = useState(() => initialState(key, normalizedQuery, generation));
  const stateRef = useRef(state);
  const currentKey = useRef(key);
  currentKey.current = key;
  const configuredQuery = useRef(normalizedQuery);
  const inFlight = useRef<AbortController | null>(null);

  const publish = useCallback((next: FeedState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const requestPage = useCallback(async (more: boolean, force = false) => {
    if (!ready || inFlight.current || sessionIdentity.generation !== generation) return;
    const previous = stateRef.current.key === key ? stateRef.current : initialState(key, normalizedQuery, generation);
    const request = more ? nextGalleryFeedQuery(previous.feed) : normalizedQuery;
    if (!request) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const identity = sessionIdentity;
    const active = () => !controller.signal.aborted && currentKey.current === key && isCurrentSession(identity);
    publish({ ...previous, loading: !more, loadingMore: more, error: null, moreError: null });
    try {
      const page = more ? await api.paintings(request, token, controller.signal)
        : await readGalleryFirstPage(request, token, generation, controller.signal, force);
      if (!active()) return;
      const feed = acceptGalleryPage(previous.feed, request, page);
      saveGalleryFeedSnapshot(generation, feed);
      publish({ key, feed, loading: false, loadingMore: false, error: null, moreError: null });
    } catch (caught) {
      if (!active()) return;
      const forbidden = caught instanceof ApiError && (caught.status === 401 || caught.status === 403);
      if (forbidden) {
        clearGalleryFeedSnapshot(generation);
        readCache.invalidate(generation, "gallery:first:");
      }
      const appendError = more && !forbidden;
      const message = isAbortError(caught) ? "目录读取已更新，请重新加载。" : errorMessage(caught);
      publish({
        ...previous, feed: forbidden ? emptyGalleryFeed(normalizedQuery) : previous.feed,
        loading: false, loadingMore: false,
        error: appendError ? null : message, moreError: appendError ? message : null,
      });
      if (caught instanceof ApiError && caught.status === 401) signOutIfCurrent(identity);
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, [ready, sessionIdentity, generation, key, normalizedQuery, isCurrentSession, token, publish, signOutIfCurrent]);

  useEffect(() => {
    // A submitted filter object starts a new browse even when its values match
    // the previous query. Only a fresh route mount restores the retained feed.
    const submittedAgain = configuredQuery.current !== normalizedQuery;
    configuredQuery.current = normalizedQuery;
    const initial = submittedAgain
      ? { key, feed: emptyGalleryFeed(normalizedQuery), loading: true, loadingMore: false, error: null, moreError: null }
      : initialState(key, normalizedQuery, generation);
    publish({ ...initial, loading: ready && !initial.feed.page });
    if (ready) {
      // Remember new filters even if the first request is still pending when the
      // user leaves. A successful retained page needs no network round trip.
      saveGalleryFeedSnapshot(generation, initial.feed);
      if (!initial.feed.page) void requestPage(false, submittedAgain);
    }
    return () => {
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [key, normalizedQuery, generation, ready, requestPage, publish]);

  const loadMore = useCallback(() => { void requestPage(true); }, [requestPage]);
  const retry = useCallback(() => { void requestPage(false, true); }, [requestPage]);
  const visible = ready && state.key === key ? state : {
    key, feed: emptyGalleryFeed(normalizedQuery), loading: true, loadingMore: false, error: null, moreError: null,
  };
  return {
    batches: visible.feed.batches, page: visible.feed.page, notice: visible.feed.notice,
    loading: visible.loading, loadingMore: visible.loadingMore, error: visible.error, moreError: visible.moreError,
    loadMore, retry,
  };
}

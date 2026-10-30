import { requireGalleryOrder, turnGalleryPage } from "./gallery-order.ts";
import type { PaintingPage, PaintingQuery, PaintingSummary } from "./types.ts";

export type GalleryFeedData = {
  query: PaintingQuery;
  batches: PaintingSummary[][];
  page: PaintingPage | null;
  notice: string | null;
};

/** Pagination belongs to the feed, not to the filter identity. */
export function galleryFeedQuery(query: PaintingQuery): PaintingQuery {
  return {
    keyword: query.keyword || undefined,
    dynasty: query.dynasty || undefined,
    category: query.category || undefined,
    author: query.author || undefined,
    subject: query.subject || undefined,
    sort: query.sort || "daily",
    direction: query.direction || "asc",
    page: 0,
    size: 12,
  };
}

export function galleryFeedKey(query: PaintingQuery): string {
  return JSON.stringify(galleryFeedQuery(query));
}

export function emptyGalleryFeed(query: PaintingQuery): GalleryFeedData {
  return { query: galleryFeedQuery(query), batches: [], page: null, notice: null };
}

export function nextGalleryFeedQuery(feed: GalleryFeedData): PaintingQuery | null {
  if (!feed.page || !feed.page.hasNext || feed.page.last) return null;
  return turnGalleryPage(feed.query, feed.page, 1);
}

/** Commit one successful response atomically; retry never advances this cursor. */
export function acceptGalleryPage(feed: GalleryFeedData, request: PaintingQuery, page: PaintingPage): GalleryFeedData {
  requireGalleryOrder(request, page);
  const requestedPage = request.page ?? 0;
  if (!Number.isInteger(page.page) || page.page < 0 || (page.page !== requestedPage && page.page !== 0)) {
    throw new Error("画廊页序暂时无法确认，请重新加载这一批。");
  }
  const dateChanged = request.sort === "daily" && feed.page !== null && page.orderDate !== feed.page.orderDate;
  if (dateChanged && page.page !== 0) {
    throw new Error("每日画廊顺序已变化，请重新加载目录。");
  }
  // Core explicitly restarts at page zero on a daily-order rollover. Never mix
  // two dates, even when the new first page contains familiar artwork IDs.
  const reset = requestedPage === 0 || page.page === 0;
  const batches = reset ? [] : feed.batches;
  const seen = new Set(batches.flatMap(batch => batch.map(painting => painting.paintingId)));
  const additions = page.items.filter(painting => {
    if (seen.has(painting.paintingId)) return false;
    seen.add(painting.paintingId);
    return true;
  });
  return {
    query: feed.query,
    batches: additions.length ? [...batches, additions] : [...batches],
    page,
    notice: requestedPage > 0 && page.page === 0
      ? dateChanged ? "今日画廊顺序已更新，已从新的首批作品开始展示。" : "画廊目录已更新，已从首批作品重新展示。"
      : reset ? null : feed.notice,
  };
}

type GalleryFeedSnapshot = GalleryFeedData & { generation: number; savedAt: number };
const RETENTION_MS = 20 * 60 * 1000;
let snapshot: GalleryFeedSnapshot | undefined;

/** One recent query, in memory only. No token, disk persistence or cross-login reuse. */
export function getGalleryFeedSnapshot(generation: number, now = Date.now()): GalleryFeedSnapshot | undefined {
  if (snapshot && (snapshot.generation !== generation || now - snapshot.savedAt > RETENTION_MS)) snapshot = undefined;
  return snapshot;
}

export function saveGalleryFeedSnapshot(generation: number, feed: GalleryFeedData, now = Date.now()): void {
  snapshot = { ...feed, generation, savedAt: now };
}

export function clearGalleryFeedSnapshot(generation: number): void {
  if (snapshot?.generation === generation) snapshot = undefined;
}

import { api } from "./api.ts";
import { galleryFeedKey, galleryFeedQuery } from "./gallery-feed.ts";
import { requireGalleryOrder } from "./gallery-order.ts";
import { readCache } from "./read-cache.ts";
import type { PaintingPage, PaintingQuery } from "./types.ts";

export const KNOWLEDGE_STATISTICS_KEY = "knowledge:paintings";
export const KNOWLEDGE_GRAPH_KEY = "knowledge:poetry";
export const KNOWLEDGE_TTL_MS = 5 * 60_000;
export const GALLERY_FIRST_TTL_MS = 30_000;
export const DAILY_PAINTING_KEY = "daily";
export const DAILY_PAINTING_TTL_MS = 60_000;

export const galleryFirstKey = (query: PaintingQuery) => `gallery:first:${galleryFeedKey(query)}`;

export function readGalleryFirstPage(query: PaintingQuery, token: string | null | undefined, generation: number, signal: AbortSignal, force = false) {
  const normalized = galleryFeedQuery(query);
  return readCache.read<PaintingPage>(generation, galleryFirstKey(normalized), async sharedSignal => {
    const page = await api.paintings(normalized, token, sharedSignal);
    requireGalleryOrder(normalized, page);
    if (page.page !== 0 || !Array.isArray(page.items)) throw new Error("画廊首批目录返回格式不完整。");
    return page;
  }, { ttlMs: GALLERY_FIRST_TTL_MS, signal, force });
}

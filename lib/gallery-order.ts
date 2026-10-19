import type { PaintingPage, PaintingQuery } from "./types.ts";

export const INITIAL_GALLERY_QUERY: PaintingQuery = { page: 0, size: 12, sort: "daily", direction: "asc" };

/** Only Core chooses the day/timezone; the browser must not invent a shuffle seed. */
export function requireGalleryOrder(query: PaintingQuery, page: PaintingPage): void {
  if (query.sort === "daily" && !/^\d{4}-\d{2}-\d{2}$/.test(page.orderDate ?? "")) {
    throw new Error("每日画廊顺序暂时无法读取，请稍后重新加载。");
  }
}

/** Core can return page zero when the date changes while the gallery is open. */
export function turnGalleryPage(query: PaintingQuery, page: PaintingPage, offset: -1 | 1): PaintingQuery {
  requireGalleryOrder(query, page);
  return {
    ...query,
    page: Math.max(0, page.page + offset),
    orderDate: query.sort === "daily" ? page.orderDate ?? undefined : undefined,
  };
}

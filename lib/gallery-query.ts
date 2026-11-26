import { INITIAL_GALLERY_QUERY } from "./gallery-order.ts";
import type { PaintingQuery } from "./types.ts";

const textFilters = { keyword: 200, dynasty: 512, category: 512, author: 512, subject: 512 } as const;
const textFilterNames = Object.keys(textFilters) as (keyof typeof textFilters)[];

export function readGalleryQuery(params: Pick<FormData, "get">): PaintingQuery {
  const query = { ...INITIAL_GALLERY_QUERY };
  for (const name of textFilterNames) {
    const value = params.get(name);
    if (typeof value === "string") query[name] = value.slice(0, textFilters[name]).trim() || undefined;
  }
  const sort = params.get("sort");
  if (sort === "source" || sort === "title" || sort === "author" || sort === "dynasty") query.sort = sort;
  if (params.get("direction") === "desc") query.direction = "desc";
  return query;
}

export function galleryHref(query: PaintingQuery): string {
  const params = new URLSearchParams();
  for (const name of textFilterNames) {
    const value = query[name];
    if (value) params.set(name, value);
  }
  if (query.sort && query.sort !== INITIAL_GALLERY_QUERY.sort) params.set("sort", query.sort);
  if (query.direction && query.direction !== INITIAL_GALLERY_QUERY.direction) params.set("direction", query.direction);
  const search = params.toString();
  return search ? `/gallery?${search}` : "/gallery";
}

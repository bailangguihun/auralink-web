import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { api } from "../lib/api.ts";
import { INITIAL_GALLERY_QUERY, requireGalleryOrder, turnGalleryPage } from "../lib/gallery-order.ts";
import type { PaintingPage } from "../lib/types.ts";

const originalFetch = globalThis.fetch;
const page: PaintingPage = {
  items: [], page: 0, size: 12, totalElements: 48, totalPages: 4,
  first: true, last: false, hasNext: true, orderDate: "2026-10-19",
};

afterEach(() => { globalThis.fetch = originalFetch; });

describe("daily gallery browsing", () => {
  it("requests a server-chosen date initially, then retains it with filters when paging", async () => {
    const urls: URL[] = [];
    globalThis.fetch = async (input) => {
      urls.push(new URL(String(input)));
      return Response.json(page);
    };
    const query = { ...INITIAL_GALLERY_QUERY, author: "同名作者", keyword: "山水" };
    const result = await api.paintings(query);
    await api.paintings(turnGalleryPage(query, result, 1));
    assert.equal(urls[0].searchParams.get("sort"), "daily");
    assert.equal(urls[0].searchParams.has("orderDate"), false);
    assert.equal(urls[1].searchParams.get("orderDate"), "2026-10-19");
    assert.equal(urls[1].searchParams.get("page"), "1");
    assert.equal(urls[1].searchParams.get("author"), "同名作者");
    assert.equal(urls[1].searchParams.get("keyword"), "山水");
  });

  it("follows Core's page-zero reset at midnight instead of advancing the stale page", () => {
    const staleQuery = { ...INITIAL_GALLERY_QUERY, page: 3, orderDate: "2026-10-18" };
    assert.deepEqual(turnGalleryPage(staleQuery, page, 1), {
      ...INITIAL_GALLERY_QUERY, page: 1, orderDate: "2026-10-19",
    });
    assert.equal(turnGalleryPage(staleQuery, page, -1).page, 0);
  });

  it("does not use a browser-local day or silently accept an old Core's source ordering", () => {
    assert.throws(() => requireGalleryOrder(INITIAL_GALLERY_QUERY, { ...page, orderDate: null }));
    assert.throws(() => requireGalleryOrder(INITIAL_GALLERY_QUERY, { ...page, orderDate: "bad" }));
    assert.doesNotThrow(() => requireGalleryOrder({ sort: "source" }, { ...page, orderDate: null }));
  });

  it("does not carry the day into an explicit alphabetical sort", () => {
    const query = turnGalleryPage({ sort: "author", direction: "desc", orderDate: "2026-10-18" }, { ...page, page: 1 }, -1);
    assert.equal(query.page, 0);
    assert.equal(query.sort, "author");
    assert.equal(query.direction, "desc");
    assert.equal(query.orderDate, undefined);
  });
});

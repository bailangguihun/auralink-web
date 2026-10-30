import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  acceptGalleryPage, clearGalleryFeedSnapshot, emptyGalleryFeed, galleryFeedKey, galleryFeedQuery,
  getGalleryFeedSnapshot, nextGalleryFeedQuery, saveGalleryFeedSnapshot,
} from "../lib/gallery-feed.ts";
import type { PaintingPage, PaintingSummary } from "../lib/types.ts";

function page(ids: string[], index = 0, orderDate = "2026-10-30", hasNext = true): PaintingPage {
  return {
    items: ids.map(paintingId => ({ paintingId } as PaintingSummary)),
    page: index, size: 12, totalElements: 37, totalPages: 4,
    first: index === 0, last: !hasNext, hasNext, orderDate,
  };
}
const ids = (batches: PaintingSummary[][]) => batches.flat().map(item => item.paintingId);
afterEach(() => { clearGalleryFeedSnapshot(17); clearGalleryFeedSnapshot(18); });

describe("continuous gallery feed", () => {
  it("isolates filters from the page cursor and keeps filter identities deterministic", () => {
    const filtered = { keyword: "山水", author: "作者", sort: "title" as const, direction: "desc" as const };
    const normalized = galleryFeedQuery({ ...filtered, page: 7, size: 50, orderDate: "2026-01-01" });
    assert.equal(normalized.page, 0);
    assert.equal(normalized.size, 12);
    assert.equal(normalized.orderDate, undefined);
    assert.equal(galleryFeedKey(filtered), galleryFeedKey({ author: "作者", keyword: "山水", direction: "desc", sort: "title" }));
    assert.notEqual(galleryFeedKey(filtered), galleryFeedKey({ ...filtered, keyword: "花鸟" }));
  });

  it("appends three batches in catalogue order, removes overlap and follows the returned cursor", () => {
    let feed = emptyGalleryFeed({ sort: "daily", keyword: "山" });
    assert.equal(nextGalleryFeedQuery(feed), null);
    feed = acceptGalleryPage(feed, feed.query, page(["a", "b", "a"]));
    const request = nextGalleryFeedQuery(feed)!;
    assert.equal(request.page, 1);
    assert.equal(request.orderDate, "2026-10-30");
    assert.equal(request.keyword, "山");
    const original = feed.batches;
    feed = acceptGalleryPage(feed, request, page(["b", "c", "d"], 1));
    assert.deepEqual(ids(original), ["a", "b"]);
    assert.equal(feed.batches[0], original[0], "Existing batch identity and card order stay stable");
    feed = acceptGalleryPage(feed, nextGalleryFeedQuery(feed)!, page(["d", "e"], 2, "2026-10-30", false));
    assert.deepEqual(ids(feed.batches), ["a", "b", "c", "d", "e"]);
    assert.equal(nextGalleryFeedQuery(feed), null);
  });

  it("retries the same cursor until a successful response and advances over an all-duplicate response", () => {
    let feed = emptyGalleryFeed({ sort: "daily" });
    feed = acceptGalleryPage(feed, feed.query, page(["a"]));
    const before = nextGalleryFeedQuery(feed);
    assert.throws(() => acceptGalleryPage(feed, before!, page(["x"], 3)));
    assert.deepEqual(nextGalleryFeedQuery(feed), before);
    feed = acceptGalleryPage(feed, before!, page(["a", "a"], 1));
    assert.deepEqual(ids(feed.batches), ["a"]);
    assert.equal(feed.batches.length, 1);
    assert.equal(nextGalleryFeedQuery(feed)!.page, 2);
  });

  it("replaces all batches on the server's midnight page-zero reset", () => {
    let feed = emptyGalleryFeed({ sort: "daily" });
    feed = acceptGalleryPage(feed, feed.query, page(["yesterday-a", "shared"]));
    feed = acceptGalleryPage(feed, nextGalleryFeedQuery(feed)!, page(["yesterday-b"], 1));
    feed = acceptGalleryPage(feed, nextGalleryFeedQuery(feed)!, page(["shared", "today-a"], 0, "2026-10-31"));
    assert.deepEqual(ids(feed.batches), ["shared", "today-a"]);
    assert.match(feed.notice!, /今日画廊顺序已更新/);
    assert.equal(nextGalleryFeedQuery(feed)!.page, 1);
    assert.equal(nextGalleryFeedQuery(feed)!.orderDate, "2026-10-31");
  });

  it("does not silently join a new order date from a nonzero page or accept missing daily order", () => {
    let feed = emptyGalleryFeed({ sort: "daily" });
    feed = acceptGalleryPage(feed, feed.query, page(["a"]));
    assert.throws(() => acceptGalleryPage(feed, nextGalleryFeedQuery(feed)!, page(["b"], 1, "2026-10-31")), /每日画廊顺序已变化/);
    assert.throws(() => acceptGalleryPage(feed, nextGalleryFeedQuery(feed)!, { ...page(["b"], 1), orderDate: null }));
    assert.deepEqual(ids(feed.batches), ["a"]);
    const alphabetical = emptyGalleryFeed({ sort: "author" });
    assert.doesNotThrow(() => acceptGalleryPage(alphabetical, alphabetical.query, { ...page(["b"]), orderDate: null }));
  });

  it("keeps only the latest query in short-lived, generation-isolated memory", () => {
    let feed = emptyGalleryFeed({ keyword: "花鸟", sort: "source" });
    feed = acceptGalleryPage(feed, feed.query, page(["a", "b"]));
    saveGalleryFeedSnapshot(17, feed, 1_000);
    assert.deepEqual(getGalleryFeedSnapshot(17, 2_000)?.query, feed.query);
    assert.deepEqual(ids(getGalleryFeedSnapshot(17, 2_000)!.batches), ["a", "b"]);
    const replacement = emptyGalleryFeed({ keyword: "山水" });
    saveGalleryFeedSnapshot(17, replacement, 3_000);
    assert.equal(getGalleryFeedSnapshot(17, 3_001)?.query.keyword, "山水");
    assert.equal(getGalleryFeedSnapshot(18, 3_002), undefined);
    assert.equal(getGalleryFeedSnapshot(17, 3_003), undefined, "An old login's results cannot be restored after switching");
    saveGalleryFeedSnapshot(18, feed, 10_000);
    assert.equal(getGalleryFeedSnapshot(18, 10_000 + 20 * 60 * 1000 + 1), undefined);
  });
});

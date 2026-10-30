import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { artworkAspectRatio } from "../lib/masonry-layout.ts";

describe("complete artwork preview proportions", () => {
  it("uses genuine proportions, bounds scroll frames, and tolerates missing dimensions", () => {
    assert.equal(artworkAspectRatio(800, 1200), 2 / 3);
    assert.equal(artworkAspectRatio(1500, 800), 1.875);
    assert.equal(artworkAspectRatio(800, 12000), 1 / 2.2);
    assert.equal(artworkAspectRatio(12000, 800), 2.5);
    for (const [width, height] of [[null, null], [0, 50], [50, -1], [Infinity, 10], [NaN, 10]]) {
      assert.equal(artworkAspectRatio(width, height), 4 / 3);
    }
  });
});

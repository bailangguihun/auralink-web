import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chartTruncatesItems, poetrySnapshotCounts } from "../lib/knowledge-presentation.ts";

describe("Poetry snapshot overview", () => {
  it("uses poem-classified entries and distinct poet names instead of all graph entities", () => {
    const nodes = [
      { name: "饮酒", category: "事件/诗词" },
      { name: "饮酒", category: "事件/诗词" },
      { name: " 陶渊明 ", category: "人物/诗人" },
      { name: "陶渊明", category: "人物/诗人" },
      { name: "李白", category: "人物/诗人" },
      { name: " ", category: "人物/诗人" },
      { name: "唐代", category: "朝代/类别" },
      { name: "长安", category: "地理" },
    ].map((node, index) => ({ ...node, id: String(index), size: 10, description: "" }));
    // Distinct work entries may share a title; author-name counts collapse duplicates.
    assert.deepEqual(poetrySnapshotCounts(nodes), { poems: 2, authorNames: 2 });
    assert.deepEqual(poetrySnapshotCounts([]), { poems: 0, authorNames: 0 });
  });
});

describe("Painting presentation limits", () => {
  it("does not claim first-12 truncation for empty, sparse or exactly-12 groups", () => {
    for (const count of [0, 1, 5, 12]) assert.equal(chartTruncatesItems(count, 12), false);
    assert.equal(chartTruncatesItems(13, 12), true);
    assert.equal(chartTruncatesItems(50, 12), true);
    // Server truncation is a separate contract flag; charts without a UI limit
    // must not invent a first-12 claim, even for many groups.
    assert.equal(chartTruncatesItems(50), false);
  });
});

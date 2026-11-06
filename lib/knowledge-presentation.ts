import type { PoetryNode } from "./knowledge-contracts.ts";

/** Match the validated snapshot's poem classification; author names are distinct. */
export function poetrySnapshotCounts(nodes: readonly PoetryNode[]): { poems: number; authorNames: number } {
  const authorNames = new Set<string>();
  let poems = 0;
  for (const node of nodes) {
    if (node.category.includes("诗词")) poems++;
    if (node.category.includes("诗人") && node.name.trim()) authorNames.add(node.name.trim());
  }
  return { poems, authorNames: authorNames.size };
}

/** Painting-only chart sizing; graph canvases keep their existing sizing. */
export function paintingChartHeight(kind: "bar" | "pie" | "line", itemCount: number): number {
  return kind === "bar" ? Math.max(156, itemCount * 28 + 36) : 220;
}

/** UI limits and server truncation are separate: neither changes metric samples. */
export function chartTruncatesItems(itemCount: number, displayLimit?: number): boolean {
  return displayLimit !== undefined && itemCount > displayLimit;
}

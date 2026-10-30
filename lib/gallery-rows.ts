export type GalleryRow = {
  start: number;
  count: number;
  height: number;
  widths: number[];
  left: number;
};

/**
 * Lay out one batch in catalogue order. Each ordinary row fills the container;
 * matching card copy heights is the renderer's responsibility. Bounded preview
 * ratios and a minimum frame width keep extreme scrolls and their titles usable.
 * A minimum-width frame may add paper margins around its complete contain image.
 */
export function justifiedRows(ratios: readonly number[], width: number, gap: number): GalleryRow[] {
  if (!ratios.length || !Number.isFinite(width) || width <= 0) return [];
  const spacing = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  const sizes = ratios.map(ratio => Number.isFinite(ratio) && ratio > 0
    ? Math.max(1 / 2.2, Math.min(2.5, ratio)) : 4 / 3);
  const singleColumn = () => sizes.map((ratio, start) => ({ start, count: 1, height: width / ratio, widths: [width], left: 0 }));
  if (width <= 680) return singleColumn();

  const target = width <= 900 ? 280 : 320;
  const minimumWidth = width <= 900 ? 120 : 140;
  const makeRow = (start: number, count: number, centered = false): GalleryRow => {
    const values = sizes.slice(start, start + count);
    const available = width - spacing * (count - 1);
    // Water-fill the row: lock under-sized frames to the readable minimum,
    // then solve the shared height for the remaining proportional frames.
    const locked = new Set<number>();
    let height = 0;
    for (let step = 0; step <= count; step++) {
      const sum = values.reduce((total, ratio, index) => total + (locked.has(index) ? 0 : ratio), 0);
      if (!sum) { height = minimumWidth / Math.max(...values); break; }
      height = (available - locked.size * minimumWidth) / sum;
      const undersized = values.flatMap((ratio, index) => !locked.has(index) && ratio * height < minimumWidth ? [index] : []);
      if (!undersized.length) break;
      undersized.forEach(index => locked.add(index));
    }
    if (centered) height = Math.min(target, height);
    const widths = values.map(ratio => Math.max(minimumWidth, ratio * height));
    if (!centered) {
      // Keep the right edge exact without moving a minimum-width frame below
      // its bound when fractional widths accumulate.
      const widest = widths.indexOf(Math.max(...widths));
      widths[widest] += available - widths.reduce((total, value) => total + value, 0);
    }
    const occupied = widths.reduce((total, value) => total + value, 0) + spacing * (count - 1);
    return { start, count, height, widths, left: centered ? Math.max(0, (width - occupied) / 2) : 0 };
  };

  // A genuinely small result set is deliberately centered, not stretched into
  // a very tall full-width portrait. The caller merges tiny final batches into
  // the preceding row before invoking this function.
  if (sizes.length <= 2) return width - spacing * (sizes.length - 1) >= sizes.length * minimumWidth
    ? [makeRow(0, sizes.length, true)] : singleColumn();

  // Dynamic programming considers every contiguous grouping of 2–6 paintings.
  // All normal batches therefore close on a full row, without hiding a widow,
  // rearranging items, or assuming a fixed number of paintings in each row.
  const costs = Array.from({ length: sizes.length + 1 }, () => Infinity);
  const counts = Array.from({ length: sizes.length }, () => 0);
  costs[sizes.length] = 0;
  for (let start = sizes.length - 1; start >= 0; start--) {
    for (let count = 2; count <= 6 && start + count <= sizes.length; count++) {
      if (!Number.isFinite(costs[start + count]) || width - spacing * (count - 1) < count * minimumWidth) continue;
      const row = makeRow(start, count);
      const heightCost = count * Math.log(row.height / target) ** 2;
      // Prefer naturally proportional frames; use contain margins when a
      // mixed extreme group would otherwise make its portrait card unreadable.
      const marginCost = row.widths.reduce((total, value, index) => total + 8 * ((value - sizes[start + index] * row.height) / value) ** 2, 0);
      const cost = heightCost + marginCost + costs[start + count];
      if (cost < costs[start] - 1e-10) {
        costs[start] = cost;
        counts[start] = count;
      }
    }
  }
  // Impossible spacing supplied by a caller must not produce negative boxes.
  if (!Number.isFinite(costs[0])) return singleColumn();
  const rows: GalleryRow[] = [];
  for (let start = 0; start < sizes.length; start += counts[start]) rows.push(makeRow(start, counts[start]));
  return rows;
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { justifiedRows } from "../lib/gallery-rows.ts";

const close = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const clampedRatio = (ratio: number) => Number.isFinite(ratio) && ratio > 0 ? Math.max(1 / 2.2, Math.min(2.5, ratio)) : 4 / 3;

describe("justified gallery rows", () => {
  const firstPage = [.504, .373, 2.21, .576, .271, .544, .488, .512, 2.153, .487, .804, .427];

  it("closes the real mixed first page on full rows without a lone trailing painting", () => {
    const rows = justifiedRows(firstPage, 1140, 20);
    assert(rows.length >= 2 && rows.length <= 4);
    let next = 0;
    for (const row of rows) {
      assert.equal(row.start, next);
      assert(row.count >= 2 && row.count <= 6);
      assert(row.height >= 180 && row.height <= 460);
      assert(row.widths.every(width => width >= 140 - 1e-7));
      close(row.widths.reduce((sum, width) => sum + width, 0) + (row.count - 1) * 20, 1140);
      assert.equal(row.left, 0);
      row.widths.forEach((width, index) => close(width, Math.max(140, row.height * clampedRatio(firstPage[row.start + index]))));
      next += row.count;
    }
    assert.equal(next, firstPage.length);
  });

  it("retains every painting and fills each row for short and complete batches", () => {
    for (const count of [3, 4, 5, 7, 11, 12, 13, 25]) {
      const values = Array.from({ length: count }, (_, index) => firstPage[index % firstPage.length]);
      for (const width of [681, 900, 901, 1140.625]) {
        const gap = width <= 900 ? 16 : 20;
        const rows = justifiedRows(values, width, gap);
        const indices = rows.flatMap(row => row.widths.map((_, offset) => row.start + offset));
        assert.deepEqual(indices, values.map((_, index) => index));
        for (const row of rows) {
          const minimum = width <= 900 ? 120 : 140;
          assert(row.count >= 2 && row.widths.every(value => value >= minimum - 1e-7));
          close(row.widths.reduce((sum, value) => sum + value, 0) + (row.count - 1) * gap, width);
          row.widths.forEach((value, index) => close(value, Math.max(minimum, row.height * clampedRatio(values[row.start + index]))));
        }
      }
    }
  });

  it("uses readable centered previews for a genuinely one or two painting result", () => {
    for (const values of [[.5], [.5, .6], [2.5, 2.5]]) {
      const rows = justifiedRows(values, 1140, 20);
      assert.equal(rows.length, 1);
      const row = rows[0];
      assert.equal(row.count, values.length);
      assert(row.height <= 320 && row.height > 0);
      const occupied = row.widths.reduce((sum, value) => sum + value, 0) + (row.count - 1) * 20;
      close(row.left * 2 + occupied, 1140);
    }
  });

  it("uses one full-width frame per painting on mobile, including the boundary", () => {
    for (const width of [1, 320, 390, 680]) {
      const rows = justifiedRows(firstPage, width, 14);
      assert.equal(rows.length, firstPage.length);
      rows.forEach((row, index) => {
        assert.equal(row.start, index);
        assert.equal(row.count, 1);
        assert.deepEqual(row.widths, [width]);
        assert.equal(row.left, 0);
        close(row.height, width / clampedRatio(firstPage[index]));
      });
    }
    assert(justifiedRows(firstPage, 680.01, 16).every(row => row.count >= 2));
  });

  it("bounds extreme scrolls and replaces absent or invalid ratios without corrupting geometry", () => {
    for (const values of [Array(12).fill(.001), Array(12).fill(1000), [NaN, 0, -1, Infinity, 1e200, 1e-200]]) {
      const original = [...values];
      for (const row of justifiedRows(values, 1140, 20)) {
        assert(Number.isFinite(row.height) && row.height > 0);
        close(row.widths.reduce((sum, value) => sum + value, 0) + 20 * (row.count - 1), 1140);
        row.widths.forEach((value, index) => {
          assert(Number.isFinite(value) && value > 0);
          close(value, Math.max(140, row.height * clampedRatio(values[row.start + index])));
        });
      }
      assert.deepEqual(values, original);
    }
  });

  it("gives extreme mixed portraits a readable contain frame without cropping any painting", () => {
    const ratios = [1 / 2.2, 2.5, 2.5];
    for (const width of [681, 900, 1140]) {
      const minimum = width <= 900 ? 120 : 140;
      const gap = width <= 900 ? 16 : 20;
      const [row] = justifiedRows(ratios, width, gap);
      assert.equal(row.count, 3);
      close(row.widths[0], minimum);
      assert(row.widths[0] > ratios[0] * row.height, "Extreme portrait gets paper margins rather than a tiny card");
      close(row.widths.reduce((sum, value) => sum + value, 0) + gap * 2, width);
      row.widths.forEach((value, index) => assert(value + 1e-7 >= ratios[index] * row.height, "Every complete image fits inside its frame"));
    }
    const rows = justifiedRows(Array(12).fill(1 / 2.2), 681, 16);
    assert(rows.every(row => row.widths.every(value => value >= 120 - 1e-7)));
    assert(rows.every(row => row.count <= 5), "Groupings that cannot fit the frame minimum are skipped");
    // At an exact minimum-width boundary, the solver still returns positive,
    // finite frame heights instead of dividing by zero after locking a group.
    const exact = justifiedRows([.454545, .454545, 2.5], 720, 180);
    assert(exact.every(row => row.height > 0 && row.widths.every(value => value >= 120 - 1e-7)));
  });

  it("handles hidden containers and malformed spacing safely and deterministically", () => {
    assert.deepEqual(justifiedRows([], 1140, 20), []);
    for (const width of [0, -1, NaN, Infinity]) assert.deepEqual(justifiedRows(firstPage, width, 20), []);
    for (const gap of [NaN, Infinity, -10]) assert.deepEqual(justifiedRows(firstPage, 1140, gap), justifiedRows(firstPage, 1140, 0));
    assert(justifiedRows(firstPage, 1140, 2000).every(row => row.count === 1 && row.height > 0));
    assert(justifiedRows([.5, 2.5], 1140, 1100).every(row => row.count === 1 && row.widths[0] === 1140));
    assert.deepEqual(justifiedRows(firstPage, 1140, 20), justifiedRows(firstPage, 1140, 20));
  });
});

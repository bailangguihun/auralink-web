import assert from "node:assert/strict";
import { test } from "node:test";
import { graphViewportFit } from "../lib/graph-viewport.ts";

test("fits offscreen nodes inside both desktop and narrow canvases", () => {
  for (const [width, height] of [[1100, 530], [354, 410]]) {
    const points = [[-440, -200], [1500, 900], [12, 80]] as const;
    const fit = graphViewportFit(points, width, height, 1)!;
    for (const [x, y] of points) {
      const px = fit.centerX + (x - fit.centerX) * fit.factor + fit.dx;
      const py = fit.centerY + (y - fit.centerY) * fit.factor + fit.dy;
      assert(px >= 39.99 && px <= width - 39.99);
      assert(py >= 39.99 && py <= height - 39.99);
    }
  }
});

test("empty and hidden canvases do not produce invalid graph transforms", () => {
  assert.equal(graphViewportFit([], 900, 530, 1), null);
  assert.equal(graphViewportFit([[NaN, 4]], 900, 530, 1), null);
  assert.equal(graphViewportFit([[0, 0]], 0, 0, 1), null);
  const fit = graphViewportFit([[30, 60]], 400, 400, 1)!;
  assert.equal(fit.factor, 8);
  assert.equal(30 + fit.dx, 200);
  assert.equal(60 + fit.dy, 200);
});

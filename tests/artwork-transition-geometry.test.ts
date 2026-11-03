import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { artworkMotionPlan, fitArtworkRect, intersectArtworkRects, type ArtworkMotionPlan, type ArtworkMotionPose, type ArtworkRect } from "../lib/artwork-transition-geometry.ts";

describe("fitArtworkRect", () => {
  const box = { left: 100, top: 50, width: 300, height: 200 };

  it("centers portrait and landscape artwork inside a contain image box", () => {
    assert.deepEqual(fitArtworkRect(box, 200, 400, "contain"), {
      left: 200, top: 50, width: 100, height: 200,
    });
    assert.deepEqual(fitArtworkRect(box, 600, 200, "contain"), {
      left: 100, top: 100, width: 300, height: 100,
    });
  });

  it("preserves the bitmap aspect ratio when cover extends beyond its image box", () => {
    assert.deepEqual(fitArtworkRect(box, 200, 400, "cover"), {
      left: 100, top: -150, width: 300, height: 600,
    });
    assert.deepEqual(fitArtworkRect(box, 600, 200, "cover"), {
      left: -50, top: 50, width: 600, height: 200,
    });
  });

  it("retains the given geometry for fill without mutating or returning the input", () => {
    const frozen = Object.freeze({ ...box });
    const painted = fitArtworkRect(frozen, 200, 400, "fill");
    assert.deepEqual(painted, box);
    assert.notEqual(painted, frozen);
  });

  it("reads inherited rectangle getters for fill as returned by DOMRect", () => {
    const inheritedBox = Object.create({
      get left() { return 100; },
      get top() { return 50; },
      get width() { return 300; },
      get height() { return 200; },
    }) as ArtworkRect;

    assert.deepEqual(Object.keys(inheritedBox), []);
    assert.deepEqual(fitArtworkRect(inheritedBox, 200, 400, "fill"), box);
  });

  it("uses transformed client bounds without applying the gallery's scale a second time", () => {
    const scaledBox = { left: 92, top: 188, width: 216, height: 324 };
    assert.deepEqual(fitArtworkRect(scaledBox, 1000, 1500, "contain"), scaledBox);
    assert.deepEqual(intersectArtworkRects([
      fitArtworkRect(scaledBox, 1000, 1500, "contain")!,
      { left: 100, top: 200, width: 200, height: 300 },
    ]), { left: 100, top: 200, width: 200, height: 300 });
  });

  it("rejects unavailable or invalid natural dimensions in every fit mode", () => {
    for (const fit of ["contain", "cover", "fill"] as const) {
      for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
        assert.equal(fitArtworkRect(box, invalid, 100, fit), null);
        assert.equal(fitArtworkRect(box, 100, invalid, fit), null);
      }
    }
  });

  it("rejects boxes with non-finite coordinates or non-positive dimensions", () => {
    const invalidBoxes: ArtworkRect[] = [
      { ...box, left: NaN },
      { ...box, top: Infinity },
      { ...box, width: Infinity },
      { ...box, height: NaN },
      { ...box, width: 0 },
      { ...box, height: -1 },
      { ...box, left: Number.MAX_VALUE, width: Number.MAX_VALUE },
    ];
    for (const invalidBox of invalidBoxes) {
      assert.equal(fitArtworkRect(invalidBox, 200, 400, "contain"), null);
    }
  });

  it("rejects overflowed fit calculations", () => {
    assert.equal(fitArtworkRect(box, Number.MIN_VALUE, 100, "cover"), null);
  });
});

describe("intersectArtworkRects", () => {
  it("clips a cover bitmap to its image box, card and visible viewport", () => {
    const box = { left: 100, top: -40, width: 300, height: 200 };
    const painted = fitArtworkRect(box, 600, 200, "cover")!;
    const rects = Object.freeze([
      Object.freeze(painted),
      Object.freeze(box),
      Object.freeze({ left: 120, top: -50, width: 260, height: 300 }),
      Object.freeze({ left: 0, top: 80, width: 1440, height: 820 }),
    ]);
    assert.deepEqual(intersectArtworkRects(rects), {
      left: 120, top: 80, width: 260, height: 80,
    });
    assert.deepEqual(rects[1], box);
  });

  it("does not stretch narrow contained artwork to its wider image element", () => {
    const box = { left: 100, top: 50, width: 300, height: 200 };
    assert.deepEqual(intersectArtworkRects([
      fitArtworkRect(box, 200, 400, "contain")!,
      box,
    ]), { left: 200, top: 50, width: 100, height: 200 });
  });

  it("preserves negative positions and fractional geometry until actually clipped", () => {
    const rect = { left: -2.5, top: -3.25, width: 10.5, height: 20.75 };
    assert.deepEqual(intersectArtworkRects([rect]), rect);
    assert.notEqual(intersectArtworkRects([rect]), rect);
    assert.deepEqual(intersectArtworkRects([
      rect,
      { left: 0, top: 0, width: 100, height: 100 },
    ]), { left: 0, top: 0, width: 8, height: 17.5 });
  });

  it("returns no frame for empty, disjoint, or edge-touching rectangles", () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    assert.equal(intersectArtworkRects([]), null);
    for (const other of [
      { left: 120, top: 0, width: 10, height: 10 },
      { left: 100, top: 0, width: 10, height: 10 },
      { left: 0, top: 100, width: 10, height: 10 },
    ]) {
      assert.equal(intersectArtworkRects([rect, other]), null);
    }
  });

  it("rejects an invalid clipping rectangle instead of ignoring its bounds", () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    for (const invalid of [
      { ...rect, left: Infinity },
      { ...rect, top: NaN },
      { ...rect, width: 0 },
      { ...rect, height: -1 },
      { ...rect, width: Infinity },
      { ...rect, top: Number.MAX_VALUE, height: Number.MAX_VALUE },
    ]) {
      assert.equal(intersectArtworkRects([rect, invalid]), null);
    }
  });
});

describe("artworkMotionPlan", () => {
  // Project the serialized CSS back into screen space to verify visual endpoints,
  // not just that a particular implementation emitted a particular string.
  function project(plan: ArtworkMotionPlan, pose: ArtworkMotionPose) {
    const transform = /^translate3d\(([^,]+)px, ([^,]+)px, 0\) scale\(([^)]+)\)$/.exec(pose.transform);
    assert(transform, "Motion must use one translation and a uniform scale");
    const [left, top, scale] = transform.slice(1).map(Number);
    const inset = /^inset\((.+)\)$/.exec(pose.clipPath);
    assert(inset);
    const [cropTop, cropRight, cropBottom, cropLeft] = inset[1].split(" ").map(value => Number.parseFloat(value));
    assert([cropTop, cropRight, cropBottom, cropLeft].every(value => Number.isFinite(value) && value >= 0));
    return {
      bitmap: { left, top, width: plan.width * scale, height: plan.height * scale },
      frame: {
        left: left + cropLeft * scale,
        top: top + cropTop * scale,
        width: (plan.width - cropLeft - cropRight) * scale,
        height: (plan.height - cropTop - cropBottom) * scale,
      },
      scale,
    };
  }
  function near(actual: ArtworkRect, expected: ArtworkRect, tolerance = 1e-8) {
    for (const key of ["left", "top", "width", "height"] as const) {
      assert(Math.abs(actual[key] - expected[key]) <= tolerance, `${key}: ${actual[key]} vs ${expected[key]}`);
    }
  }

  it("projects cropped portrait artwork into a full-size detail image without changing its ratio", () => {
    const source = Object.freeze({ left: 92, top: 188, width: 216, height: 324 });
    const frame = Object.freeze({ left: 100, top: 200, width: 200, height: 300 });
    const destination = Object.freeze({ left: 440, top: 150, width: 400, height: 600 });
    const plan = artworkMotionPlan(source, frame, destination, destination);
    assert(plan);
    assert.equal(plan.width, 400);
    assert.equal(plan.height, 600);
    near(project(plan, plan.from).bitmap, source);
    near(project(plan, plan.from).frame, frame);
    near(project(plan, plan.to).bitmap, destination);
    near(project(plan, plan.to).frame, destination);
    const start = project(plan, plan.from).scale;
    const end = project(plan, plan.to).scale;
    for (const progress of [0, .1, .25, .5, .75, 1]) {
      const scale = start + (end - start) * progress;
      assert(Math.abs((plan.width * scale) / (plan.height * scale) - 2 / 3) < 1e-12);
    }
  });

  it("preserves landscape cover cropping, fractional positions and viewport clipping", () => {
    const source = { left: -40.5, top: 70.25, width: 600.5, height: 300.25 };
    const sourceFrame = { left: 0, top: 90, width: 400, height: 180.5 };
    const destination = { left: 500.25, top: 300.5, width: 800, height: 400 };
    const destinationFrame = { left: 510.25, top: 310.5, width: 770, height: 360 };
    const plan = artworkMotionPlan(source, sourceFrame, destination, destinationFrame);
    assert(plan);
    near(project(plan, plan.from).bitmap, source);
    near(project(plan, plan.from).frame, sourceFrame);
    near(project(plan, plan.to).bitmap, destination);
    near(project(plan, plan.to).frame, destinationFrame);
  });

  it("uses the same plane and exchanged poses when returning to a card", () => {
    const card = { left: 100, top: 110, width: 240, height: 360 };
    const crop = { left: 110, top: 120, width: 220, height: 320 };
    const detail = { left: 500, top: 160, width: 400, height: 600 };
    const forward = artworkMotionPlan(card, crop, detail, detail);
    const reverse = artworkMotionPlan(detail, detail, card, crop);
    assert(forward && reverse);
    assert.equal(reverse.width, forward.width);
    assert.equal(reverse.height, forward.height);
    assert.deepEqual(reverse.from, forward.to);
    assert.deepEqual(reverse.to, forward.from);
  });

  it("supports the capture pose and intersects a partially overlapping frame with the bitmap", () => {
    const bitmap = { left: -20, top: 10, width: 200, height: 300 };
    const frame = { left: 0, top: 0, width: 500, height: 500 };
    const plan = artworkMotionPlan(bitmap, frame, bitmap, frame);
    assert(plan);
    near(project(plan, plan.from).bitmap, bitmap);
    near(project(plan, plan.from).frame, { left: 0, top: 10, width: 180, height: 300 });
    assert.deepEqual(plan.from, plan.to);
    assert.equal(project(plan, plan.from).scale, 1);
  });

  it("accepts tiny measured-ratio differences but rejects a genuinely different image shape", () => {
    const source = { left: 10, top: 10, width: 100, height: 200 };
    const rounded = { left: 200, top: 100, width: 300, height: 600.3 };
    const plan = artworkMotionPlan(source, source, rounded, rounded);
    assert(plan);
    near(project(plan, plan.from).frame, source);
    near(project(plan, plan.to).bitmap, rounded);
    const mismatched = { ...rounded, height: 610 };
    assert.equal(artworkMotionPlan(source, source, mismatched, mismatched), null);
  });

  it("rejects invalid, disjoint and unrepresentable geometry rather than emitting broken CSS", () => {
    const bitmap = { left: 0, top: 0, width: 200, height: 300 };
    for (const invalid of [
      { ...bitmap, left: NaN }, { ...bitmap, top: Infinity },
      { ...bitmap, width: 0 }, { ...bitmap, height: -1 },
      { ...bitmap, left: Number.MAX_VALUE, width: Number.MAX_VALUE },
    ]) {
      assert.equal(artworkMotionPlan(invalid, bitmap, bitmap, bitmap), null);
      assert.equal(artworkMotionPlan(bitmap, invalid, bitmap, bitmap), null);
      assert.equal(artworkMotionPlan(bitmap, bitmap, invalid, bitmap), null);
      assert.equal(artworkMotionPlan(bitmap, bitmap, bitmap, invalid), null);
    }
    const outside = { left: 200, top: 0, width: 20, height: 20 };
    assert.equal(artworkMotionPlan(bitmap, outside, bitmap, bitmap), null);
    assert.equal(artworkMotionPlan(bitmap, bitmap, bitmap, outside), null);
    const underflow = { left: 0, top: 0, width: Number.MIN_VALUE, height: 1 };
    const enormous = { left: 0, top: 0, width: 1, height: Number.MAX_VALUE };
    assert.equal(artworkMotionPlan(underflow, underflow, enormous, enormous), null);
  });
});

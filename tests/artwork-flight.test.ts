import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { beginArtworkFlight, isArtworkFlightActive, waitForArtworkFlight } from "../lib/artwork-flight.ts";

describe("artwork visual gate", () => {
  const path = "/gallery/first";
  let finish = () => {};
  afterEach(() => finish());

  it("holds text and detail readers for this artwork and login generation until the visual controller finishes", async () => {
    finish = beginArtworkFlight(path, 7);
    let released = false;
    const pending = waitForArtworkFlight(path, 7).then(() => { released = true; });
    await Promise.resolve();
    assert.equal(released, false);
    assert.equal(isArtworkFlightActive(path, 7), true);
    assert.equal(isArtworkFlightActive(path, 8), false);
    assert.equal(isArtworkFlightActive("/gallery/other", 7), false);
    await waitForArtworkFlight(path, 8);
    await waitForArtworkFlight("/gallery/other", 7);
    finish();
    await pending;
    assert.equal(released, true);
    assert.equal(isArtworkFlightActive(path, 7), false);
  });

  it("aborting a superseded detail reader does not open the visual gate for another reader", async () => {
    finish = beginArtworkFlight(path, 7);
    const controller = new AbortController();
    const cancelled = waitForArtworkFlight(path, 7, controller.signal);
    const rejection = assert.rejects(cancelled, { name: "AbortError" });
    let released = false;
    const current = waitForArtworkFlight(path, 7).then(() => { released = true; });
    controller.abort();
    await rejection;
    assert.equal(released, false);
    assert.equal(isArtworkFlightActive(path, 7), true);
    finish();
    await current;
    assert.equal(released, true);
  });

  it("a replaced transition releases its old reader without letting its late completion open the new gate", async () => {
    const finishPrevious = beginArtworkFlight(path, 7);
    let previousReleased = false;
    const previous = waitForArtworkFlight(path, 7).then(() => { previousReleased = true; });
    finish = beginArtworkFlight(path, 8);
    await previous;
    assert.equal(previousReleased, true);
    let currentReleased = false;
    const current = waitForArtworkFlight(path, 8).then(() => { currentReleased = true; });
    finishPrevious();
    await Promise.resolve();
    assert.equal(currentReleased, false);
    assert.equal(isArtworkFlightActive(path, 8), true);
    finish();
    await current;
  });

  it("finishes all current readers once and leaves later direct navigation unblocked", async () => {
    finish = beginArtworkFlight(path, 7);
    let completions = 0;
    const readers = [1, 2, 3].map(() => waitForArtworkFlight(path, 7).then(() => { completions += 1; }));
    finish();
    finish();
    await Promise.all(readers);
    assert.equal(completions, 3);
    await waitForArtworkFlight(path, 7);
  });

  it("rejects an already cancelled request even when no matching transition remains", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(waitForArtworkFlight("/gallery/direct", 99, controller.signal), { name: "AbortError" });
  });
});

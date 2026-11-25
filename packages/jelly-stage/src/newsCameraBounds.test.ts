import assert from "node:assert/strict";
import { test } from "node:test";

import { findTextBounds, fitsBounds } from "./newsCameraBounds.ts";
import { layoutNewsBar } from "./newsBarLayout.ts";

/** The map window at its smallest, with its bands for the buttons. */
const SIZE = { width: 520, height: 460 };
const INSETS = { top: 44, bottom: 70 };

test("texts stay between the bands the page covers", () => {
  const bounds = findTextBounds(SIZE, INSETS);
  const name = { x: 200, width: 80, height: 14 };
  assert.equal(fitsBounds({ ...name, y: 120 }, bounds), true);
  // In the dock band at the bottom and in the band at the top.
  assert.equal(fitsBounds({ ...name, y: 400 }, bounds), false);
  assert.equal(fitsBounds({ ...name, y: 30 }, bounds), false);
  assert.equal(fitsBounds({ ...name, y: 120 }, null), true);
  assert.equal(fitsBounds({ ...name, y: 400 }, null), true);
});

test("texts stay clear of the lower third and the card over the shoulder", () => {
  const layout = layoutNewsBar(SIZE, INSETS);
  assert.ok(layout?.card);
  const bounds = findTextBounds(SIZE, INSETS);
  const headline = { x: 200, y: layout.headline.y + 2, width: 60, height: 12 };
  assert.equal(fitsBounds(headline, bounds), false);
  const ticker = { x: 200, y: layout.ticker.y, width: 60, height: 12 };
  assert.equal(fitsBounds(ticker, bounds), false);
  const card = { x: layout.card.x + 4, y: layout.card.y + 4, width: 30, height: 12 };
  assert.equal(fitsBounds(card, bounds), false);
  // Half under the top of the lower third is left out too.
  const half = { x: 200, y: layout.tags.y - 6, width: 60, height: 12 };
  assert.equal(fitsBounds(half, bounds), false);
});

test("a picture too small for the news look keeps only the bands", () => {
  const tiny = { width: 180, height: 150 };
  assert.equal(layoutNewsBar(tiny, INSETS), null);
  const bounds = findTextBounds(tiny, { top: 10, bottom: 20 });
  assert.deepEqual(bounds.covered, []);
  assert.deepEqual(bounds.free, { x: 0, y: 10, width: 180, height: 120 });
});

/**
 * What all parts of the lower third of the Jelly-News share in one frame: the report, the layout,
 * the colors and how far bands and texts are in. Kept apart, so bands, tabs and texts can be painted
 * by modules of their own.
 *
 * @module
 */

import type { NewsBarLayout } from "./newsBarLayout.ts";
import type { NewsColors } from "./newsBarPaint.ts";
import type { NewsCard } from "./newsLines.ts";

import { easeOut, stagger } from "./newsBarPaint.ts";

/** What the lower third shows in one frame. */
export interface ThirdScene {
  card: NewsCard;
  /** The reports of the ticker, separated by `TICKER_GAP`. */
  ticker: string;
  layout: NewsBarLayout;
  colors: NewsColors;
  /** How far the bands are built, from 0 to 1. */
  build: number;
  /** How far the texts are in, from 0 to 1. */
  texts: number;
  serverTime: number;
  reducedMotion: boolean;
}

/** Returns how far band `index` of three is built: from the left with motion, at once without. */
export function showBand(scene: ThirdScene, index: number): number {
  return scene.reducedMotion ? 1 : easeOut(stagger(scene.build, index, 3));
}

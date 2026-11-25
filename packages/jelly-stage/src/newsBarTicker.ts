/**
 * The bottom strip of the Jelly-News: the clock at its left end and the ticker running through all
 * reports of the show. Where the ticker stands follows from the server time, so all screens run it
 * in step and a screen that loads late joins at the same words. With less motion it stands still
 * and shows one report after the other.
 *
 * @module
 */

import type { NewsBarLayout, Rect } from "./newsBarLayout.ts";
import type { NewsColors } from "./newsBarPaint.ts";

import { cutToFit, fitLine } from "./newsBarFit.ts";
import { clipTo, measureWith, ON_COLOR, setFont, WEIGHT } from "./newsBarPaint.ts";
import { paintLacquer } from "./newsBarTexture.ts";
import { findTickerItem, findTickerPhase } from "./newsBarTiming.ts";
import { formatNewsTime, TICKER_GAP } from "./newsDirector.ts";

/** What the strip shows in one frame. */
export interface TickerScene {
  /** The reports, separated by {@link TICKER_GAP}. */
  ticker: string;
  layout: NewsBarLayout;
  colors: NewsColors;
  /** How far the strip is built, from 0 to 1. */
  shown: number;
  serverTime: number;
  reducedMotion: boolean;
}

/** Shown between two reports instead of the plain gap. */
const MARK = "+++";
/** The text starts this far after the clock, as a share of the strip height. */
const GAP_SHARE = 0.45;

/** Returns the reports of a ticker without empty ones. */
function listReports(ticker: string): string[] {
  return ticker
    .split(TICKER_GAP)
    .map((report) => report.trim())
    .filter((report) => report.length > 0);
}

/** Paints the clock box at the left end of the strip, lacquered like the tabs. */
function drawClock(context: CanvasRenderingContext2D, scene: TickerScene): void {
  const { clock, fonts, padding } = scene.layout;
  paintLacquer(context, clock, scene.colors.brand, "light");
  const width = clock.width - padding;
  const box = { width, largest: fonts.ticker * 1.05, smallest: fonts.ticker * 0.8 };
  const time = fitLine(formatNewsTime(scene.serverTime), box, measureWith(context, WEIGHT.tag));
  setFont(context, time.size, WEIGHT.tag);
  context.fillStyle = ON_COLOR;
  context.textAlign = "center";
  context.fillText(
    time.lines[0] ?? "",
    clock.x + clock.width / 2,
    clock.y + clock.height / 2,
    width,
  );
  context.textAlign = "left";
}

/** Writes one report at a time without motion, cut to the strip. */
function drawStill(
  context: CanvasRenderingContext2D,
  reports: string[],
  scene: TickerScene,
  area: Rect,
) {
  const { fonts } = scene.layout;
  const report = reports[findTickerItem(reports.length, scene.serverTime)] ?? "";
  const text = cutToFit(report, area.width, fonts.ticker, measureWith(context, WEIGHT.text));
  setFont(context, fonts.ticker, WEIGHT.text);
  context.fillStyle = ON_COLOR;
  context.fillText(text, area.x, area.y + area.height / 2, area.width);
}

/**
 * Writes the running ticker: every report followed by a mark, over and over. The loop is measured
 * in characters for the timing and in pixels only for the picture.
 */
function drawRunning(
  context: CanvasRenderingContext2D,
  reports: string[],
  scene: TickerScene,
  area: Rect,
) {
  const { fonts } = scene.layout;
  const gap = ` ${MARK} `;
  setFont(context, fonts.ticker, WEIGHT.text);
  const parts = reports.flatMap((report) => [
    { text: report, color: ON_COLOR, width: context.measureText(report).width },
    { text: gap, color: scene.colors.accent, width: context.measureText(gap).width },
  ]);
  const loopWidth = parts.reduce((sum, part) => sum + part.width, 0);
  const characters = parts.reduce((sum, part) => sum + part.text.length, 0);
  if (loopWidth <= 0) return;
  let x = area.x - findTickerPhase(characters, scene.serverTime) * loopWidth;
  const y = area.y + area.height / 2;
  while (x < area.x + area.width) {
    for (const part of parts) {
      if (x + part.width > area.x && x < area.x + area.width) {
        context.fillStyle = part.color;
        context.fillText(part.text, x, y);
      }
      x += part.width;
    }
  }
}

/** Paints the clock and the ticker on the strip, as far as it is built. */
export function drawTicker(context: CanvasRenderingContext2D, scene: TickerScene): void {
  const { ticker, clock } = scene.layout;
  if (scene.shown <= 0) return;
  context.save();
  clipTo(context, { ...ticker, width: ticker.width * scene.shown });
  drawClock(context, scene);
  const start = clock.x + clock.width + ticker.height * GAP_SHARE;
  const area = {
    ...ticker,
    x: start,
    width: ticker.x + ticker.width - start - ticker.height * GAP_SHARE,
  };
  clipTo(context, area);
  const reports = listReports(scene.ticker);
  if (scene.reducedMotion) drawStill(context, reports, scene, area);
  else drawRunning(context, reports, scene, area);
  context.restore();
}

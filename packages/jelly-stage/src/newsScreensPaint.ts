/**
 * The picture of the Jelly-News on the beamer screens of the stage, laid out for their wide format:
 * around the show the logo of the channel on its studio blue, during a report the sign of the
 * report large on the left, its rubric and its number on the right, with the logo as a small mark
 * in the corner. Painted with the ground, colors, fonts and stripes of the look over the picture, so
 * screens and lower third speak with one voice, but not as a second copy of the card over the
 * shoulder. Functions take the canvas, so the module can be imported without a page.
 *
 * @module
 */

import type { Rect, StripeGrid } from "./newsBarLayout.ts";
import type { NewsCard } from "./newsLines.ts";
import type { BroadcastPicture } from "./newsSetPlan.ts";

import { paintCardBackdrop } from "./newsBarCard.ts";
import { fitLine } from "./newsBarFit.ts";
import { drawNewsSign } from "./newsBarSign.ts";
import {
  CHANNEL_COLORS,
  drawLogo,
  measureLogo,
  measureWith,
  ON_COLOR,
  pickColors,
  setFont,
  WEIGHT,
  type NewsColors,
} from "./newsBarPaint.ts";

const TAGLINE = "NACHRICHTEN AUS DER HALLE";
/** A picture is this much larger than the emoji it replaces, which has air around its glyph. */
const PICTURE_SCALE = 1.35;
/** The logo around the show: its height and the line under it, as shares of the picture height. */
const TITLE = { logo: 0.2, tagline: 0.055, gap: 0.05, widest: 0.8 };
/** The mark in the corner during a report, as shares of the height. */
const MARK = { height: 0.085, inset: 0.07 };
/** The sign of a report: its middle as shares of width and height, its size and glow of the height. */
const SIGN = { x: 0.27, y: 0.56, size: 0.4, glow: 0.34, glowAlpha: 0.32 };
/** The column right of the sign, as shares of the width, and its parts as shares of the height. */
const COLUMN = { from: 0.5, to: 0.94 };
const RUBRIC = { middle: 0.37, largest: 0.1, smallest: 0.055 };
const FIGURE = { top: 0.46, height: 0.3, largest: 0.2, smallest: 0.08, padding: 0.06 };
/** The line along the top of a report, as a share of the height. */
const TOP_LINE = 0.025;
/**
 * The period of the stripes as a share of the picture height: on the screens of the stage about
 * as long as on the front of the desk, so both read as one material.
 */
const STRIPE_SHARE = 0.048;

/** Returns the grid of the stripes on the picture, from its corner. */
function findGrid(rect: Rect): StripeGrid {
  return { period: rect.height * STRIPE_SHARE, x: rect.x, y: rect.y };
}

/**
 * Paints the studio blue: the brand color, darker toward the edges. It stays plain, a calm ground
 * for the logo between the reports, while the desk below carries the stripes.
 */
function paintStudio(context: CanvasRenderingContext2D, rect: Rect): void {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const radius = Math.hypot(rect.width, rect.height) / 2;
  const ground = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
  ground.addColorStop(0, CHANNEL_COLORS.brand);
  ground.addColorStop(1, CHANNEL_COLORS.deep);
  context.fillStyle = ground;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
}

/** Paints the logo of the channel in the middle, with its line under it. */
function paintChannel(context: CanvasRenderingContext2D, rect: Rect): void {
  paintStudio(context, rect);
  const wanted = rect.height * TITLE.logo;
  const widest = rect.width * TITLE.widest;
  const height = Math.min(wanted, (wanted * widest) / measureLogo(context, wanted));
  const width = measureLogo(context, height);
  const corner = { x: rect.x + (rect.width - width) / 2, y: rect.y + rect.height / 2 - height };
  drawLogo(context, corner, height, true);
  setFont(context, rect.height * TITLE.tagline, WEIGHT.tag);
  context.fillStyle = ON_COLOR;
  context.textAlign = "center";
  const line = corner.y + height + rect.height * (TITLE.gap + TITLE.tagline / 2);
  context.fillText(TAGLINE, rect.x + rect.width / 2, line, width);
}

/** Paints the sign of a report large on the left, lit from behind: its picture, else its emoji. */
function paintSign(context: CanvasRenderingContext2D, rect: Rect, card: NewsCard): void {
  const center = { x: rect.x + rect.width * SIGN.x, y: rect.y + rect.height * SIGN.y };
  const radius = rect.height * SIGN.glow;
  const glow = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
  glow.addColorStop(0, `rgba(255, 255, 255, ${SIGN.glowAlpha})`);
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(center.x - radius, center.y - radius, 2 * radius, 2 * radius);
  const size = rect.height * SIGN.size;
  context.fillStyle = ON_COLOR;
  drawNewsSign(context, card, { ...center, size: size * PICTURE_SCALE }, size);
}

/** Writes one line into the column, as large as it fits between two sizes, from its left edge. */
function writeInColumn(
  context: CanvasRenderingContext2D,
  line: { text: string; middle: number; weight: number },
  box: { width: number; largest: number; smallest: number; x: number },
): void {
  const fitted = fitLine(line.text, box, measureWith(context, line.weight));
  setFont(context, fitted.size, line.weight);
  context.fillText(fitted.lines[0] ?? "", box.x, line.middle, box.width);
}

/** Paints the rubric over a light band with the number, or the rubric alone in that band. */
function paintColumn(
  context: CanvasRenderingContext2D,
  rect: Rect,
  card: NewsCard,
  colors: NewsColors,
): void {
  const { height } = rect;
  const x = rect.x + rect.width * COLUMN.from;
  const width = rect.width * (COLUMN.to - COLUMN.from);
  const band = { y: rect.y + height * FIGURE.top, height: height * FIGURE.height };
  context.fillStyle = colors.paper;
  context.fillRect(x, band.y, width, band.height);
  const inner = { x: x + height * FIGURE.padding, width: width - 2 * height * FIGURE.padding };
  const inBand = card.figure || card.rubric;
  context.fillStyle = colors.ink;
  writeInColumn(
    context,
    { text: inBand, middle: band.y + band.height / 2, weight: WEIGHT.logo },
    { ...inner, largest: height * FIGURE.largest, smallest: height * FIGURE.smallest },
  );
  if (!card.figure || !card.rubric) return;
  context.fillStyle = ON_COLOR;
  writeInColumn(
    context,
    { text: card.rubric, middle: rect.y + height * RUBRIC.middle, weight: WEIGHT.tag },
    { x, width, largest: height * RUBRIC.largest, smallest: height * RUBRIC.smallest },
  );
}

/** Paints a report: its ground, the sign, rubric and number, the mark of the channel on top. */
function paintReport(context: CanvasRenderingContext2D, rect: Rect, card: NewsCard): void {
  const colors = pickColors(card.isUrgent);
  const grid = findGrid(rect);
  paintCardBackdrop(context, rect, colors, grid);
  paintSign(context, rect, card);
  paintColumn(context, rect, card, colors);
  const inset = rect.height * MARK.inset;
  drawLogo(context, { x: rect.x + inset, y: rect.y + inset }, rect.height * MARK.height, true);
  context.fillStyle = colors.accent;
  context.fillRect(rect.x, rect.y, rect.width, rect.height * TOP_LINE);
}

/** Paints the picture of the screens over the whole canvas. */
export function paintBroadcast(context: CanvasRenderingContext2D, picture: BroadcastPicture): void {
  const { width, height } = context.canvas;
  const rect = { x: 0, y: 0, width, height };
  context.save();
  context.clearRect(0, 0, width, height);
  if (picture.card) paintReport(context, rect, picture.card);
  else paintChannel(context, rect);
  context.restore();
}

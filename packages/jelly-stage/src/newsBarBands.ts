/**
 * The bands of the lower third of the Jelly-News and what they are made of. The headline band is the
 * calm bright middle: plain, a rectangle with a thin accent line under the tabs. The band under it
 * and the ground of the ticker come in two neighboring tones: they keep their color where their text
 * begins and deepen toward the other end, where soft stripes of their own color appear. The sub band
 * ends in a cut at the slant of the stripes with a slim wedge after it, the one place where a shape
 * takes up the `///`, and a fine light line runs where it meets the headline band. Bands build from
 * the left; their material is laid out for the whole band and only revealed as it grows, so nothing
 * slides.
 *
 * @module
 */

import type { Rect, StripeGrid } from "./newsBarLayout.ts";
import type { ThirdScene } from "./newsBarScene.ts";

import { showBand } from "./newsBarScene.ts";
import { NEIGHBOR, paintHighlight, paintStripedBand, readScale } from "./newsBarTexture.ts";

/** A corner of a shape, in CSS pixels. */
interface Point {
  x: number;
  y: number;
}

/**
 * The end of the sub band, as shares of its height: the gap before the wedge and the width of the
 * wedge. The cut rises at the slant of the stripes, so it reaches one height across.
 */
const SLANTED_END = { gap: 0.16, wedge: 0.2 };
/** How far into the cut the text of the sub band may reach, as a share of its height. */
const TEXT_REACH = 0.8;
/** Where a band deepens, as shares of its width: its own color up to `from`, deeper toward `to`. */
const SUB_FADE = { from: 0.45, to: 0.98 };
const STRIP_FADE = { from: 0.42, to: 0.02 };
/** The thin lines under the tabs and where headline and sub band meet, as shares of band height. */
const LINES = { tabs: 0.025, meet: 0.045, meetAlpha: 0.8 };
/** The lower edge of the dark bands is deeper by this much, over this share of their height. */
const LOWER_EDGE = { alpha: 0.14, share: 0.5 };
/** The bar at the start of the headline, as a share of the band height. */
const BAR_SHARE = 0.09;
/** The shadow under the bands, as shares of the headline height. */
const SHADOW = { color: "rgba(6, 16, 40, 0.32)", blur: 0.22, drop: 0.05 };

/** Returns the room the bar at the start of the headline takes, in CSS pixels. */
export function measureHeadlineBar(height: number): number {
  return Math.max(3, height * BAR_SHARE);
}

/** Returns the room the slanted end of the sub band takes from its text, in CSS pixels. */
export function measureSubEnd(height: number): number {
  return height * (TEXT_REACH + SLANTED_END.gap + SLANTED_END.wedge);
}

/** Returns the corners of a rectangle. */
function cornersOf(rect: Rect): Point[] {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return [
    { x: rect.x, y: rect.y },
    { x: right, y: rect.y },
    { x: right, y: bottom },
    { x: rect.x, y: bottom },
  ];
}

/** Returns a band ending in a cut at the slant of the stripes, and the slim wedge after it. */
function shapeSlantedEnd(rect: Rect): { band: Point[]; wedge: Point[] } {
  const { x, y, width, height } = rect;
  const right = x + width;
  const wedge = height * SLANTED_END.wedge;
  const end = right - height * SLANTED_END.gap - wedge;
  const bottom = y + height;
  return {
    band: [
      { x, y },
      { x: end, y },
      { x: end - height, y: bottom },
      { x, y: bottom },
    ],
    wedge: [
      { x: right - wedge, y },
      { x: right, y },
      { x: right - height, y: bottom },
      { x: right - height - wedge, y: bottom },
    ],
  };
}

/** Cuts a convex shape off right of `reach`, where a band that is still building ends. */
function cutAt(points: Point[], reach: number): Point[] {
  const kept: Point[] = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    if (point.x <= reach) kept.push(point);
    if (point.x <= reach !== next.x <= reach) {
      const share = (reach - point.x) / (next.x - point.x);
      kept.push({ x: reach, y: point.y + (next.y - point.y) * share });
    }
  });
  return kept;
}

/** Traces a shape as far as a band has been built. Returns false if nothing of it is built yet. */
function traceShape(context: CanvasRenderingContext2D, points: Point[], reach: number): boolean {
  const [first, ...rest] = cutAt(points, reach);
  if (!first) return false;
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of rest) context.lineTo(point.x, point.y);
  context.closePath();
  return true;
}

/** Paints a dark band in its two tones with its stripes and its deeper lower edge, within its outline. */
function paintDarkBand(
  context: CanvasRenderingContext2D,
  outline: { rect: Rect; points: Point[]; reach: number },
  band: { color: string; depth: number; from: number; to: number; grid: StripeGrid },
): void {
  const { rect } = outline;
  context.save();
  if (traceShape(context, outline.points, outline.reach)) context.clip();
  paintStripedBand(context, rect, band, band.grid);
  const edge = rect.y + rect.height * (1 - LOWER_EDGE.share);
  const lower = context.createLinearGradient(0, edge, 0, rect.y + rect.height);
  lower.addColorStop(0, "rgba(0, 0, 0, 0)");
  lower.addColorStop(1, `rgba(0, 0, 0, ${LOWER_EDGE.alpha})`);
  context.fillStyle = lower;
  context.fillRect(rect.x, edge, rect.width, rect.height * LOWER_EDGE.share);
  context.restore();
}

/** Paints the thin lines: in the color of the bar under the tabs, light where the bands meet. */
function paintLines(context: CanvasRenderingContext2D, scene: ThirdScene, built: Rect[]): void {
  const { headline, sub } = scene.layout;
  const { colors } = scene;
  const least = 1 / (readScale(context) || 1);
  const [top, meet] = built;
  if (top) {
    context.fillStyle = colors.stripe;
    context.fillRect(top.x, top.y, top.width, Math.max(least, headline.height * LINES.tabs));
  }
  if (meet) {
    const [, end] = shapeSlantedEnd(sub).band;
    context.save();
    context.globalAlpha *= LINES.meetAlpha;
    context.fillStyle = colors.accent;
    const width = Math.min(meet.width, (end?.x ?? sub.x + sub.width) - sub.x);
    context.fillRect(meet.x, sub.y, width, Math.max(least, sub.height * LINES.meet));
    context.restore();
  }
}

/**
 * Casts the shadow of the bands from rectangles, as far as they are built: a blurred rectangle costs
 * a fraction of a blurred shape. The slanted end of the sub band and its wedge cast none, they are
 * filled afterwards; under so small a part nobody misses it.
 */
function castShadow(context: CanvasRenderingContext2D, scene: ThirdScene, built: Rect[]): void {
  const { layout, colors } = scene;
  const { headline, sub } = layout;
  const [top, middle, bottom] = built;
  const shape = shapeSlantedEnd(sub);
  // The band is whole up to where its cut reaches the bottom edge.
  const whole = (shape.band[2]?.x ?? sub.x + sub.width) - sub.x;
  const paper = context.createLinearGradient(0, headline.y, 0, headline.y + headline.height);
  paper.addColorStop(0, colors.paper);
  paper.addColorStop(1, colors.paperShade);
  const fills: [Rect | undefined, string | CanvasGradient][] = [
    [top, paper],
    [middle && { ...middle, width: Math.min(middle.width, whole) }, colors.deep],
    [bottom, colors.strip],
  ];
  context.save();
  context.shadowColor = SHADOW.color;
  context.shadowBlur = headline.height * SHADOW.blur;
  context.shadowOffsetY = headline.height * SHADOW.drop;
  for (const [rect, fill] of fills) {
    if (!rect) continue;
    context.fillStyle = fill;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  context.restore();
  context.fillStyle = colors.accent;
  if (middle && traceShape(context, shape.wedge, middle.x + middle.width)) context.fill();
}

/** Paints the bands of the lower third as far as they are built, with their shadow. */
export function drawBands(context: CanvasRenderingContext2D, scene: ThirdScene): void {
  const { layout, colors } = scene;
  const { headline, sub, ticker, stripes } = layout;
  const built = [headline, sub, ticker].map((rect, index) => ({
    ...rect,
    width: rect.width * showBand(scene, index),
  }));
  castShadow(context, scene, built);
  const [, subBuilt = sub, stripBuilt = ticker] = built;
  const subOutline = {
    rect: sub,
    points: shapeSlantedEnd(sub).band,
    reach: subBuilt.x + subBuilt.width,
  };
  paintDarkBand(context, subOutline, {
    color: colors.deep,
    depth: NEIGHBOR.band,
    ...SUB_FADE,
    grid: stripes,
  });
  const stripOutline = {
    rect: ticker,
    points: cornersOf(ticker),
    reach: stripBuilt.x + stripBuilt.width,
  };
  paintDarkBand(context, stripOutline, {
    color: colors.strip,
    depth: NEIGHBOR.strip,
    ...STRIP_FADE,
    grid: stripes,
  });
  paintHighlight(context, stripBuilt);
  paintLines(context, scene, built);
  const bar = measureHeadlineBar(headline.height) * Math.min(1, showBand(scene, 0) * 4);
  context.fillStyle = colors.stripe;
  context.fillRect(headline.x, headline.y, bar, headline.height);
}

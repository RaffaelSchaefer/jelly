/**
 * The card over the shoulder of the Jelly-News: a panel in the upper corner with the sign of the
 * report and its number or time, or its rubric where it has none. The ground is drawn, a gradient in
 * two tones of the report's color with the soft stripes of the look, in the rhythm of the lower
 * third. A photo can take its place later in {@link paintCardBackdrop}.
 *
 * @module
 */

import type { CardRect, Rect, StripeGrid } from "./newsBarLayout.ts";
import type { NewsColors } from "./newsBarPaint.ts";
import type { NewsCard } from "./newsLines.ts";

import { fitLine, type FittedText } from "./newsBarFit.ts";
import { easeOut, measureWith, ON_COLOR, setFont, WEIGHT } from "./newsBarPaint.ts";
import { drawNewsSign } from "./newsBarSign.ts";
import { paintStripes } from "./newsBarTexture.ts";

/** What the card shows in one frame. */
export interface CardScene {
  card: NewsCard;
  rect: CardRect;
  colors: NewsColors;
  /** How far the card is in, from 0 to 1. */
  shown: number;
  reducedMotion: boolean;
}

/** The light band at the foot of the card: higher for a number than for a rubric. */
const FOOT_SHARE = { figure: 0.34, rubric: 0.24 };
/** Text in the foot, as shares of its height. */
const FOOT_FONT = { largest: 0.62, smallest: 0.34 };
/** The sign as a share of the open part of the card, above a foot or alone. */
const GLYPH_SHARE = 0.55;
const GLYPH_ALONE_SHARE = 0.5;
const PADDING_SHARE = 0.08;
/** The line along the top of the card, as a share of its height. */
const TOP_LINE_SHARE = 0.025;
/**
 * The stripes of the ground are of its brighter color: they vanish where the gradient keeps that
 * color and show only faintly toward its deep end, a few percent of lightness at most.
 */
const STRIPE_ALPHA = 0.13;
const GLOW_ALPHA = 0.3;
const SHADOW = { color: "rgba(6, 16, 40, 0.3)", blur: 0.08, drop: 0.025 };
const SMALLEST_TEXT = 11;
/** A picture is this much larger than the emoji it replaces, which has air around its glyph. */
const PICTURE_SCALE = 1.35;

/**
 * Paints the ground of the card: a slanted gradient in two tones of the report's color, crossed by
 * the soft stripes of the look on `grid`, in the brighter tone. A photo of the rubric could replace
 * this function later, drawn into the same rectangle, as long as the sign keeps a calm patch in the
 * middle.
 */
export function paintCardBackdrop(
  context: CanvasRenderingContext2D,
  rect: Rect,
  colors: NewsColors,
  grid: StripeGrid,
): void {
  const ground = context.createLinearGradient(
    rect.x,
    rect.y,
    rect.x + rect.width,
    rect.y + rect.height,
  );
  ground.addColorStop(0, colors.brand);
  ground.addColorStop(1, colors.deep);
  context.fillStyle = ground;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  paintStripes(context, rect, { color: colors.brand, alpha: STRIPE_ALPHA }, grid);
}

/** Lights the middle of the card behind the sign. */
function paintGlow(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  radius: number,
) {
  const glow = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
  glow.addColorStop(0, `rgba(255, 255, 255, ${GLOW_ALPHA})`);
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(center.x - radius, center.y - radius, 2 * radius, 2 * radius);
}

/** What the foot of a card says, and how high it is. */
interface CardFoot {
  height: number;
  text: FittedText;
  weight: number;
}

/**
 * Sets the number of the report, or else its rubric, for the foot of the card. A number shrinks and
 * is cut at worst. A rubric only repeats the tab over the headline, so a card that cannot hold it
 * whole goes without a foot.
 */
function planFoot(context: CanvasRenderingContext2D, card: NewsCard, rect: Rect): CardFoot | null {
  const height = rect.height * (card.figure ? FOOT_SHARE.figure : FOOT_SHARE.rubric);
  const weight = card.figure ? WEIGHT.logo : WEIGHT.tag;
  const box = {
    width: rect.width * (1 - 2 * PADDING_SHARE),
    largest: Math.max(SMALLEST_TEXT, height * FOOT_FONT.largest),
    smallest: Math.max(SMALLEST_TEXT, height * FOOT_FONT.smallest),
  };
  const words = card.figure || card.rubric;
  if (!words) return null;
  const text = fitLine(words, box, measureWith(context, weight));
  return card.figure || text.lines[0] === words ? { height, text, weight } : null;
}

/** Writes the foot on its light band at the bottom of the card. */
function drawFoot(context: CanvasRenderingContext2D, scene: CardScene, foot: CardFoot): void {
  const { rect, colors } = scene;
  const band = { ...rect, y: rect.y + rect.height - foot.height, height: foot.height };
  context.fillStyle = colors.paper;
  context.fillRect(band.x, band.y, band.width, band.height);
  setFont(context, foot.text.size, foot.weight);
  context.fillStyle = colors.ink;
  context.textAlign = "center";
  const width = band.width * (1 - 2 * PADDING_SHARE);
  context.fillText(
    foot.text.lines[0] ?? "",
    band.x + band.width / 2,
    band.y + band.height / 2,
    width,
  );
}

/** Paints the ground of the card with its shadow. Its stripes start at its corner and slide with it. */
function drawGround(context: CanvasRenderingContext2D, rect: CardRect, colors: NewsColors): void {
  context.save();
  context.shadowColor = SHADOW.color;
  context.shadowBlur = rect.height * SHADOW.blur;
  context.shadowOffsetY = rect.height * SHADOW.drop;
  context.fillStyle = colors.deep;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();
  paintCardBackdrop(context, rect, colors, { period: rect.period, x: rect.x, y: rect.y });
}

/**
 * Paints the sign of the report in the open part of the card, lit from behind: its picture, or the
 * emoji of the system until the picture is there.
 */
function drawSign(
  context: CanvasRenderingContext2D,
  scene: CardScene,
  open: number,
  hasFoot: boolean,
): void {
  const { rect, card } = scene;
  const center = { x: rect.x + rect.width / 2, y: rect.y + open / 2 };
  paintGlow(context, center, open * 0.6);
  const size = open * (hasFoot ? GLYPH_SHARE : GLYPH_ALONE_SHARE);
  context.fillStyle = ON_COLOR;
  drawNewsSign(context, card, { ...center, size: size * PICTURE_SCALE }, size);
}

/** Paints the card in its place, sliding in from the right side, or fading without motion. */
export function drawNewsCard(context: CanvasRenderingContext2D, scene: CardScene): void {
  const { colors, card } = scene;
  if (scene.shown <= 0) return;
  context.save();
  context.globalAlpha *= scene.shown;
  const slide = scene.reducedMotion ? 0 : (1 - easeOut(scene.shown)) * scene.rect.width * 0.5;
  const rect = { ...scene.rect, x: scene.rect.x + slide };
  drawGround(context, rect, colors);
  const foot = planFoot(context, card, rect);
  const open = rect.height - (foot?.height ?? 0);
  drawSign(context, { ...scene, rect }, open, foot !== null);
  if (foot) drawFoot(context, { ...scene, rect }, foot);
  context.fillStyle = colors.accent;
  context.fillRect(rect.x, rect.y, rect.width, Math.max(2, rect.height * TOP_LINE_SHARE));
  context.restore();
}

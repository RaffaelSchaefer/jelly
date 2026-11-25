/**
 * The opening title of the Jelly-News: slanted bands in the colors of the channel sweep across the
 * picture, the logo lands on the last one, and the bands sweep on and give the picture back. Without
 * motion that ground only fades in and out around the logo. It covers what the page leaves free.
 *
 * The bands are painted with the rest of the television look. The logo is not: `newsTitle.ts`
 * paints it after the look, on the band of the logo ({@link traceLogoBand}), as the 3D title or, until
 * its model is there, as the flat logo of {@link drawFlatLogo}.
 *
 * @module
 */

import type { Rect } from "./newsBarLayout.ts";

import {
  clipTo,
  CHANNEL_COLORS,
  drawLogo,
  measureLogo,
  ON_COLOR,
  setFont,
  WEIGHT,
} from "./newsBarPaint.ts";
import { measureSweeps } from "./newsBarTiming.ts";

/** What the opening title shows in one frame. */
export interface BumperScene {
  free: Rect;
  /** Progress through the opening title, from 0 to 1. */
  progress: number;
  /** How long the opening title lasts, in milliseconds: its bands sweep as fast at any length. */
  length: number;
  reducedMotion: boolean;
}

/** The line under the logo, also under the 3D title. */
export const TAGLINE = "NACHRICHTEN AUS DER HALLE";
/** The logo comes from this much larger. */
const LOGO_ZOOM = 0.18;
/** Without motion the ground fades in and out over these shares. */
const FADE = { in: 0.15, out: 0.82 };
/** Logo height as a share of the free height, and at most of the width. */
const LOGO_SHARE = { height: 0.18, width: 0.15 };
const TAGLINE_SHARE = 0.24;
/** The bands lean by this share of the free height. */
const SLANT_SHARE = 0.35;
/** The band the logo stands on: the last of the three. */
const LOGO_BAND = 2;

/** Keeps a share between 0 and 1. */
function clamp(share: number): number {
  return Math.min(1, Math.max(0, share));
}

/** Smooth at both ends, like a camera move. */
function easeInOut(share: number): number {
  const value = clamp(share);
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

/** Traces a band that leans to the right, from `from` to `to` across the area. */
function traceBand(context: CanvasRenderingContext2D, free: Rect, from: number, to: number) {
  const slant = free.height * SLANT_SHARE;
  const top = free.y;
  const bottom = free.y + free.height;
  context.beginPath();
  context.moveTo(from - slant / 2, bottom);
  context.lineTo(from + slant / 2, top);
  context.lineTo(to + slant / 2, top);
  context.lineTo(to - slant / 2, bottom);
  context.closePath();
}

/**
 * Returns where band `index` begins and ends, from all left of the area to all right of it. The
 * band of the logo is last in and first out, so the others trail on both sides.
 */
function findBandEdges(scene: BumperScene, index: number): { from: number; to: number } {
  const { free, progress } = scene;
  const slant = free.height * SLANT_SHARE;
  const travel = free.width + 2 * slant;
  const sweeps = measureSweeps(scene.length);
  const lead = easeInOut((progress - index * sweeps.delay) / sweeps.in);
  const leave = sweeps.leave + (LOGO_BAND - index) * sweeps.delay;
  const trail = easeInOut((progress - leave) / sweeps.out);
  return { from: free.x - slant + travel * trail, to: free.x - slant + travel * lead };
}

/** Returns how far the logo has landed, from 0 to 1: once its band is half in, as fast as a band. */
function landLogo(scene: BumperScene): number {
  if (scene.reducedMotion) return 1;
  const sweeps = measureSweeps(scene.length);
  return easeInOut((scene.progress - LOGO_BAND * sweeps.delay - sweeps.in / 2) / sweeps.in);
}

/** Paints the line under the logo, centred at `y`, `size` high. */
export function drawTagline(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  size: number,
  width: number,
): void {
  setFont(context, size, WEIGHT.tag);
  context.fillStyle = ON_COLOR;
  context.textAlign = "center";
  context.fillText(TAGLINE, center.x, center.y, width);
}

/**
 * Paints the flat logo with its line in the middle of the free area, landing from a little larger:
 * the stand-in for the 3D title. With less motion it stands from the start.
 */
export function drawFlatLogo(context: CanvasRenderingContext2D, scene: BumperScene): void {
  const { free } = scene;
  const height = Math.min(free.height * LOGO_SHARE.height, free.width * LOGO_SHARE.width);
  const width = measureLogo(context, height);
  const landed = landLogo(scene);
  if (landed <= 0) return;
  const center = { x: free.x + free.width / 2, y: free.y + free.height / 2 };
  context.save();
  context.globalAlpha *= landed;
  context.translate(center.x, center.y);
  const zoom = 1 + LOGO_ZOOM * (1 - landed);
  context.scale(zoom, zoom);
  drawLogo(context, { x: -width / 2, y: -height / 2 }, height);
  drawTagline(context, { x: 0, y: height * 0.95 }, height * TAGLINE_SHARE, width);
  context.restore();
}

/** Returns how far the ground stands without motion: it fades in and out around the logo. */
export function measureStill(progress: number): number {
  return Math.min(clamp(progress / FADE.in), clamp((1 - progress) / (1 - FADE.out)));
}

/** Paints the opening title without motion: the ground of the logo fades in and out. */
function drawStill(context: CanvasRenderingContext2D, scene: BumperScene): void {
  const { free, progress } = scene;
  context.save();
  context.globalAlpha *= measureStill(progress);
  context.fillStyle = makeStage(context, free);
  context.fillRect(free.x, free.y, free.width, free.height);
  context.restore();
}

/** The ground the logo stands on: the channel blue, darker toward the edges like a studio wall. */
function makeStage(context: CanvasRenderingContext2D, free: Rect): CanvasGradient {
  const center = { x: free.x + free.width / 2, y: free.y + free.height / 2 };
  const radius = Math.hypot(free.width, free.height) / 2;
  const ground = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
  ground.addColorStop(0, CHANNEL_COLORS.brand);
  ground.addColorStop(1, CHANNEL_COLORS.deep);
  return ground;
}

/**
 * Traces where the logo stands: its band as far as it has swept, or with less motion all of the
 * free area. Returns false while there is nothing of it, then nothing is traced.
 */
export function traceLogoBand(context: CanvasRenderingContext2D, scene: BumperScene): boolean {
  const { free } = scene;
  if (scene.reducedMotion) {
    context.beginPath();
    context.rect(free.x, free.y, free.width, free.height);
    return measureStill(scene.progress) > 0;
  }
  const { from, to } = findBandEdges(scene, LOGO_BAND);
  if (to <= from) return false;
  traceBand(context, free, from, to);
  return true;
}

/** Paints the bands of the opening title over what the page leaves free, without the logo. */
export function drawBumper(context: CanvasRenderingContext2D, scene: BumperScene): void {
  if (scene.reducedMotion) {
    drawStill(context, scene);
    return;
  }
  const grounds = [CHANNEL_COLORS.accent, CHANNEL_COLORS.deep, makeStage(context, scene.free)];
  context.save();
  clipTo(context, scene.free);
  grounds.forEach((ground, index) => {
    const { from, to } = findBandEdges(scene, index);
    if (to <= from) return;
    traceBand(context, scene.free, from, to);
    context.fillStyle = ground;
    context.fill();
  });
  context.restore();
}

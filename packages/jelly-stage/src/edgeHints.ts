/**
 * Hints at the edge of a zoomed personal screen: where the own jelly is, and where something happens
 * outside the picture, such as an emote, a new level or a beam of light. A hint sits where the way
 * from the middle leaves the picture and points on. A click on it flies there.
 *
 * @module
 */

import type { StageEffect } from "./effects.ts";
import type { LabelAnchor } from "./labels.ts";
import type { ScreenPoint, ScreenSize } from "./lens.ts";

import { findViewCenter, type StageInsets } from "./insets.ts";
import { findPalette } from "./palette.ts";

/** In CSS pixels: radius of a hint and of the own one, distance from the edge, the tip, the gap. */
const SIZE = { radius: 14, ownRadius: 17, edge: 28, tip: 7, gap: 4, grab: 6 };
const MOST_HINTS = 6;
/** How long a hint takes to pop up and to fade out. */
const POP_MS = 220;
const FADE_MS = 600;
const GLYPHS = { spotlight: "✦", reward: "★" };
const RIM = "#ffffff";
const SHADOW = { color: "rgba(11, 26, 43, 0.35)", blur: 8 };
/** The glyph fills this much of the radius, the dot of the own jelly this much. */
const GLYPH_SHARE = 1.05;
const DOT_SHARE = 0.36;
const FONT = "system-ui, sans-serif";

/** A hint at the edge of the picture. */
export interface EdgeHint {
  playerId: number;
  x: number;
  y: number;
  /** Direction to the jelly in radians, 0 points right. */
  angle: number;
  radius: number;
  /** The color of the jelly. */
  color: string;
  /** What happens there, empty for the own jelly. */
  glyph: string;
  opacity: number;
}

/** What the hints of a frame are found in. */
export interface HintScene {
  anchors: LabelAnchor[];
  effects: StageEffect[];
  ownId: number;
  size: ScreenSize;
  insets: StageInsets;
  now: number;
}

/** A jelly worth a hint, before it has its place. */
type HintWish = Omit<EdgeHint, "x" | "y" | "angle">;

/** Returns what an effect shows in its hint, null when it is not worth one. */
function findGlyph(effect: StageEffect): string | null {
  if (effect.kind === "bubble") return effect.glyph;
  if (effect.kind === "spotlight") return GLYPHS.spotlight;
  return effect.kind === "toast" && effect.isReward ? GLYPHS.reward : null;
}

/** Returns where the middle of a jelly's body is on screen. */
function findBody(anchor: LabelAnchor): ScreenPoint {
  return { x: (anchor.x + anchor.headX) / 2, y: anchor.y - anchor.height / 2 };
}

/** Reports whether a point lies outside what the page leaves free. */
function isHidden(point: ScreenPoint, { size, insets }: HintScene): boolean {
  return (
    point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height - insets.bottom
  );
}

/** Lists the jellies worth a hint, the own one first and then the newest events. */
function listWishes(scene: HintScene): HintWish[] {
  const own = scene.anchors.find((anchor) => anchor.player.id === scene.ownId);
  const wishes: HintWish[] = own
    ? [
        {
          playerId: own.player.id,
          radius: SIZE.ownRadius,
          color: own.player.color,
          glyph: "",
          opacity: 1,
        },
      ]
    : [];
  const newest = [...scene.effects].sort((first, second) => second.startedAt - first.startedAt);
  for (const effect of newest) {
    const glyph = findGlyph(effect);
    const anchor = scene.anchors.find((candidate) => candidate.player.id === effect.playerId);
    const opacity = Math.min(
      1,
      (scene.now - effect.startedAt) / POP_MS,
      (effect.endsAt - scene.now) / FADE_MS,
    );
    if (glyph === null || !anchor || opacity <= 0) continue;
    if (wishes.some((wish) => wish.playerId === effect.playerId)) continue;
    wishes.push({
      playerId: effect.playerId,
      radius: SIZE.radius,
      color: anchor.player.color,
      glyph,
      opacity,
    });
  }
  return wishes;
}

/** Returns where the way from the middle to a point leaves a box. */
function placeOnEdge(
  target: ScreenPoint,
  middle: ScreenPoint,
  box: { left: number; top: number; right: number; bottom: number },
): ScreenPoint {
  const dx = target.x - middle.x;
  const dy = target.y - middle.y;
  const reachX = dx === 0 ? Infinity : ((dx > 0 ? box.right : box.left) - middle.x) / dx;
  const reachY = dy === 0 ? Infinity : ((dy > 0 ? box.bottom : box.top) - middle.y) / dy;
  const scale = Math.min(reachX, reachY, 1);
  return { x: middle.x + dx * scale, y: middle.y + dy * scale };
}

/**
 * Finds the hints of a frame: for jellies outside the picture, at most {@link MOST_HINTS}. A hint
 * that would cover one already placed is left out, the own one always comes first.
 */
export function findEdgeHints(scene: HintScene): EdgeHint[] {
  const { size, insets } = scene;
  const middle = findViewCenter(size, insets);
  const box = {
    left: SIZE.edge,
    top: insets.top + SIZE.edge,
    right: size.width - SIZE.edge,
    bottom: size.height - insets.bottom - SIZE.edge,
  };
  const hints: EdgeHint[] = [];
  for (const wish of listWishes(scene)) {
    const anchor = scene.anchors.find((candidate) => candidate.player.id === wish.playerId);
    const body = anchor && findBody(anchor);
    if (!body || !isHidden(body, scene) || hints.length === MOST_HINTS) continue;
    const spot = placeOnEdge(body, middle, box);
    const isFree = hints.every(
      (hint) => Math.hypot(hint.x - spot.x, hint.y - spot.y) > hint.radius + wish.radius + SIZE.gap,
    );
    if (!isFree) continue;
    const angle = Math.atan2(body.y - middle.y, body.x - middle.x);
    hints.push({ ...wish, ...spot, angle });
  }
  return hints;
}

/** Paints one hint: a disc in the color of the jelly with a tip toward it. */
function drawHint(context: CanvasRenderingContext2D, hint: EdgeHint): void {
  const palette = findPalette(hint.color);
  const { radius } = hint;
  context.save();
  context.globalAlpha = hint.opacity;
  context.translate(hint.x, hint.y);
  context.shadowColor = SHADOW.color;
  context.shadowBlur = SHADOW.blur;
  context.rotate(hint.angle);
  context.beginPath();
  context.moveTo(radius + SIZE.tip, 0);
  context.lineTo(radius - 2, -SIZE.tip);
  context.lineTo(radius - 2, SIZE.tip);
  context.closePath();
  context.fillStyle = RIM;
  context.fill();
  context.rotate(-hint.angle);
  context.beginPath();
  context.arc(0, 0, radius, 0, 2 * Math.PI);
  context.fillStyle = palette.glow;
  context.fill();
  context.shadowBlur = 0;
  context.lineWidth = 2.5;
  context.strokeStyle = RIM;
  context.stroke();
  drawMark(context, hint, palette.outline);
  context.restore();
}

/** Paints what happens there, or a dot for the own jelly. */
function drawMark(context: CanvasRenderingContext2D, hint: EdgeHint, ink: string): void {
  if (!hint.glyph) {
    context.beginPath();
    context.arc(0, 0, hint.radius * DOT_SHARE, 0, 2 * Math.PI);
    context.fillStyle = RIM;
    context.fill();
    return;
  }
  context.font = `${Math.round(hint.radius * GLYPH_SHARE)}px ${FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = ink;
  context.fillText(hint.glyph, 0, 1);
}

/** Paints the hints of a frame over the picture. */
export function drawEdgeHints(context: CanvasRenderingContext2D, hints: EdgeHint[]): void {
  for (const hint of hints) {
    drawHint(context, hint);
  }
}

/** Returns the player of the hint at a point, null when there is none. */
export function pickEdgeHint(hints: EdgeHint[], point: ScreenPoint): number | null {
  const hit = hints.find(
    (hint) => Math.hypot(hint.x - point.x, hint.y - point.y) <= hint.radius + SIZE.grab,
  );
  return hit?.playerId ?? null;
}

/**
 * Paints the texts over the 3D stage: names, signs, emote bubbles and rising toasts. It only reads
 * where the jellies are on screen and holds no state of its own.
 *
 * @module
 */

import type { StageEffect } from "./effects.ts";
import type { StagePlayer } from "./types.ts";

const TEXT_COLOR = "#ffffff";
const TEXT_OUTLINE = "rgba(28, 38, 52, 0.85)";
const SIGN_FILL = "#fff3c9";
const SIGN_EDGE = "rgba(120, 92, 20, 0.35)";
const SIGN_TEXT = "#3b2f0f";

/** Text sizes as shares of the jelly height on screen. */
const NAME_FONT_SHARE = 0.17;
const MIN_FONT_PIXELS = 11;
const NAME_GAP_SHARE = 0.08;
const SIGN_FONT_SHARE = 0.15;
const SIGN_GAP_SHARE = 0.1;
const SIGN_PADDING = 6;
const SIGN_RADIUS = 6;
const BUBBLE_FONT_SHARE = 0.36;
const TOAST_FONT_SHARE = 0.18;
const TOAST_RISE_SHARE = 0.45;
const OUTLINE_PIXELS = 3;

/** Where a jelly is on screen, in CSS pixels. */
export interface LabelAnchor {
  player: StagePlayer;
  /** Middle of the feet. */
  x: number;
  y: number;
  /** Height of the jelly from feet to the top of its head. */
  height: number;
}

/** A rectangle on the screen a text has taken. */
interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything the texts of a frame need. */
export interface LabelScene {
  /** Sorted from back to front, so nearer names cover those behind. */
  anchors: LabelAnchor[];
  effects: StageEffect[];
  signLabels: Map<string, string>;
  now: number;
}

/**
 * Paints all texts of a frame over the picture of the stage. In a crowd, the texts of the nearest
 * jellies win: a name or sign that would overlap one already painted is left out.
 */
export function drawLabels(context: CanvasRenderingContext2D, scene: LabelScene): void {
  const taken: TextBox[] = [];
  for (const anchor of [...scene.anchors].reverse()) {
    drawName(context, anchor, taken);
    const signLabel = scene.signLabels.get(anchor.player.sign ?? "");
    if (signLabel) {
      drawSign(context, signLabel, anchor, taken);
    }
  }
  drawEffects(context, scene);
}

/** Takes a box for a text, unless it overlaps one already taken. */
function claimBox(taken: TextBox[], box: TextBox): boolean {
  const isFree = taken.every(
    (other) =>
      box.x + box.width <= other.x ||
      other.x + other.width <= box.x ||
      box.y + box.height <= other.y ||
      other.y + other.height <= box.y,
  );
  if (isFree) taken.push(box);
  return isFree;
}

/** Writes text with a dark edge, so it stays readable on any background. */
function writeOutlined(
  context: CanvasRenderingContext2D,
  text: string,
  position: { x: number; y: number },
): void {
  context.strokeStyle = TEXT_OUTLINE;
  context.lineWidth = OUTLINE_PIXELS;
  context.lineJoin = "round";
  context.strokeText(text, position.x, position.y);
  context.fillStyle = TEXT_COLOR;
  context.fillText(text, position.x, position.y);
}

/** Sets a font scaled to the jelly, but never below a readable size. Returns the size. */
function useFont(context: CanvasRenderingContext2D, pixels: number, weight = "600"): number {
  const size = Math.max(MIN_FONT_PIXELS, Math.round(pixels));
  context.font = `${weight} ${size}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  return size;
}

/** Writes name and level below a jelly, if there is room. */
function drawName(context: CanvasRenderingContext2D, anchor: LabelAnchor, taken: TextBox[]): void {
  const size = useFont(context, anchor.height * NAME_FONT_SHARE);
  const text = `${anchor.player.name} · ${anchor.player.level}`;
  const width = context.measureText(text).width + OUTLINE_PIXELS;
  const nameY = anchor.y + anchor.height * NAME_GAP_SHARE + size / 2;
  if (claimBox(taken, { x: anchor.x - width / 2, y: nameY - size / 2, width, height: size })) {
    writeOutlined(context, text, { x: anchor.x, y: nameY });
  }
}

/** Paints a sign over the head, if there is room. */
function drawSign(
  context: CanvasRenderingContext2D,
  label: string,
  anchor: LabelAnchor,
  taken: TextBox[],
): void {
  const size = useFont(context, anchor.height * SIGN_FONT_SHARE);
  const width = context.measureText(label).width + 2 * SIGN_PADDING;
  const boxHeight = size + SIGN_PADDING;
  const centerY = anchor.y - anchor.height * (1 + SIGN_GAP_SHARE) - boxHeight / 2;
  const box = { x: anchor.x - width / 2, y: centerY - boxHeight / 2, width, height: boxHeight };
  if (!claimBox(taken, box)) {
    return;
  }
  context.fillStyle = SIGN_FILL;
  context.strokeStyle = SIGN_EDGE;
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(anchor.x - width / 2, centerY - boxHeight / 2, width, boxHeight, SIGN_RADIUS);
  context.fill();
  context.stroke();
  context.fillStyle = SIGN_TEXT;
  context.fillText(label, anchor.x, centerY);
}

/** Paints bubbles and rising texts over their jellies. */
function drawEffects(context: CanvasRenderingContext2D, scene: LabelScene): void {
  const anchorById = new Map(scene.anchors.map((anchor) => [anchor.player.id, anchor]));
  for (const effect of scene.effects) {
    const anchor = anchorById.get(effect.playerId);
    if (!anchor || effect.kind === "motion" || effect.kind === "visit") {
      continue;
    }
    const progress = (scene.now - effect.startedAt) / (effect.endsAt - effect.startedAt);
    const headY = anchor.y - anchor.height;
    context.globalAlpha = Math.min(1, 2 * (1 - progress));
    if (effect.kind === "bubble") {
      const size = useFont(context, anchor.height * BUBBLE_FONT_SHARE);
      context.fillText(effect.glyph, anchor.x, headY - size);
    } else {
      useFont(context, anchor.height * TOAST_FONT_SHARE, "700");
      const riseY = headY - progress * anchor.height * TOAST_RISE_SHARE;
      writeOutlined(context, effect.text, { x: anchor.x, y: riseY });
    }
    context.globalAlpha = 1;
  }
}

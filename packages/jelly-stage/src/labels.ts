/**
 * Paints the texts over the 3D stage: names, signs, emote bubbles and rising toasts. It only reads
 * where the jellies are on screen and holds no state of its own.
 *
 * @module
 */

import type { StageEffect } from "./effects.ts";
import type { StagePlayer } from "./types.ts";

import { findPalette } from "./jellies.ts";

const TEXT_COLOR = "#ffffff";
const TEXT_OUTLINE = "rgba(28, 38, 52, 0.85)";
const PLAIN_TEXT: TextColors = { fill: TEXT_COLOR, edge: TEXT_OUTLINE };
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
/** A marked name is this much larger than the others. */
const MARKED_NAME_SCALE = 1.15;
const MARKED_NAME_WEIGHT = "800";
const MARKER_SHARE = 0.11;
const MIN_MARKER_PIXELS = 6;
/** A marker is this much longer than half its width. */
const MARKER_STRETCH = 1.4;
const MARKER_EDGE_PIXELS = 2;

/** Colors of a text or marker. */
interface TextColors {
  fill: string;
  edge: string;
}

/** Where a jelly is on screen, in CSS pixels. */
export interface LabelAnchor {
  player: StagePlayer;
  /** Middle of the feet. */
  x: number;
  y: number;
  /** Where the head is sideways: Perspective and lens can tilt a jelly. */
  headX: number;
  /** Height of the jelly from feet to the top of its head. */
  height: number;
}

/** Jellies whose names show in any crowd. The big stage has none. */
export interface LabelMarks {
  ownId: number | null;
  targetId: number | null;
  hoveredId: number | null;
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
  /** Sorted from back to front. Texts are placed from the front, so nearer jellies keep theirs. */
  anchors: LabelAnchor[];
  effects: StageEffect[];
  signLabels: Map<string, string>;
  now: number;
  marks: LabelMarks;
}

/**
 * Paints all texts of a frame over the picture of the stage. Marked names come first and always
 * show. After them, the texts of the nearest jellies win: a name or sign that would overlap one
 * already painted is left out.
 */
export function drawLabels(context: CanvasRenderingContext2D, scene: LabelScene): void {
  const taken: TextBox[] = [];
  const marked = listMarked(scene);
  for (const anchor of marked) {
    drawMarkedName(context, anchor, scene.marks.ownId === anchor.player.id, taken);
  }
  for (const anchor of [...scene.anchors].reverse()) {
    if (!marked.includes(anchor)) {
      drawName(context, anchor, taken);
    }
    const signLabel = scene.signLabels.get(anchor.player.sign ?? "");
    if (signLabel) {
      drawSign(context, signLabel, anchor, taken);
    }
  }
  drawMarkers(context, scene);
  drawEffects(context, scene);
}

/** Returns the marked jellies in painting order. Names that collide stack up in this order. */
function listMarked(scene: LabelScene): LabelAnchor[] {
  const { hoveredId, targetId, ownId } = scene.marks;
  return [...new Set([hoveredId, targetId, ownId])].flatMap(
    (id) => scene.anchors.find((anchor) => anchor.player.id === id) ?? [],
  );
}

/** Returns the colors of the own jelly, so its name and marker match it. */
function findOwnColors(player: StagePlayer): TextColors {
  const palette = findPalette(player.color);
  return { fill: palette.glow, edge: palette.outline };
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
  colors = PLAIN_TEXT,
): void {
  context.strokeStyle = colors.edge;
  context.lineWidth = OUTLINE_PIXELS;
  context.lineJoin = "round";
  context.strokeText(text, position.x, position.y);
  context.fillStyle = colors.fill;
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

/**
 * Writes name and level of a marked jelly below it. Only another marked name can push it further
 * down: a jelly stands right next to its target, so their names would always collide.
 */
function drawMarkedName(
  context: CanvasRenderingContext2D,
  anchor: LabelAnchor,
  isOwn: boolean,
  taken: TextBox[],
): void {
  const pixels = anchor.height * NAME_FONT_SHARE * MARKED_NAME_SCALE;
  const size = useFont(context, pixels, MARKED_NAME_WEIGHT);
  const text = `${anchor.player.name} · ${anchor.player.level}`;
  const width = context.measureText(text).width + OUTLINE_PIXELS;
  const box = {
    x: anchor.x - width / 2,
    y: anchor.y + anchor.height * NAME_GAP_SHARE,
    width,
    height: size,
  };
  while (!claimBox(taken, box)) {
    box.y += size;
  }
  const colors = isOwn ? findOwnColors(anchor.player) : PLAIN_TEXT;
  writeOutlined(context, text, { x: anchor.x, y: box.y + size / 2 }, colors);
}

/** Returns where the sign of a jelly hangs and how high it is, with its font set. */
function placeSign(context: CanvasRenderingContext2D, anchor: LabelAnchor) {
  const size = useFont(context, anchor.height * SIGN_FONT_SHARE);
  const boxHeight = size + SIGN_PADDING;
  return { boxHeight, centerY: anchor.y - anchor.height * (1 + SIGN_GAP_SHARE) - boxHeight / 2 };
}

/** Paints a sign over the head, if there is room. */
function drawSign(
  context: CanvasRenderingContext2D,
  label: string,
  anchor: LabelAnchor,
  taken: TextBox[],
): void {
  const { boxHeight, centerY } = placeSign(context, anchor);
  const width = context.measureText(label).width + 2 * SIGN_PADDING;
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

/** Points at the own jelly and the one it stands next to. */
function drawMarkers(context: CanvasRenderingContext2D, scene: LabelScene): void {
  for (const anchor of scene.anchors) {
    const isOwn = scene.marks.ownId === anchor.player.id;
    if (isOwn || scene.marks.targetId === anchor.player.id) {
      drawMarker(context, anchor, isOwn ? findOwnColors(anchor.player) : PLAIN_TEXT, scene);
    }
  }
}

/** Paints a triangle pointing down at a jelly, above its sign if it holds one. */
function drawMarker(
  context: CanvasRenderingContext2D,
  anchor: LabelAnchor,
  colors: TextColors,
  scene: LabelScene,
): void {
  const { boxHeight, centerY } = placeSign(context, anchor);
  const hasSign = scene.signLabels.has(anchor.player.sign ?? "");
  const tipY = hasSign ? centerY - boxHeight / 2 - SIGN_PADDING : centerY + boxHeight / 2;
  const size = Math.max(MIN_MARKER_PIXELS, anchor.height * MARKER_SHARE);
  context.beginPath();
  context.moveTo(anchor.x, tipY);
  context.lineTo(anchor.x - size, tipY - size * MARKER_STRETCH);
  context.lineTo(anchor.x + size, tipY - size * MARKER_STRETCH);
  context.closePath();
  context.fillStyle = colors.fill;
  context.strokeStyle = colors.edge;
  context.lineWidth = MARKER_EDGE_PIXELS;
  context.lineJoin = "round";
  context.stroke();
  context.fill();
}

/** Paints bubbles and rising texts over their jellies. */
function drawEffects(context: CanvasRenderingContext2D, scene: LabelScene): void {
  const anchorById = new Map(scene.anchors.map((anchor) => [anchor.player.id, anchor]));
  for (const effect of scene.effects) {
    const anchor = anchorById.get(effect.playerId);
    if (!anchor || (effect.kind !== "bubble" && effect.kind !== "toast")) {
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

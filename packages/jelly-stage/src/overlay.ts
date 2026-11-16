/**
 * The screen side of a frame: where the jellies are on the picture, what lies under the pointer,
 * the texts and hints painted over the room, and what a click there hits.
 *
 * @module
 */

import type { StageEffect } from "./effects.ts";
import type { JellySpot } from "./jellies.ts";
import type { LabelAnchor } from "./labels.ts";
import type { ScreenPoint, ScreenSize } from "./lens.ts";
import type { StageHighlight } from "./moves.ts";
import type { StageInsets } from "./insets.ts";
import type { StagePoint } from "./types.ts";
import type { ScenePoint } from "./world.ts";

import { drawEdgeHints, findEdgeHints, pickEdgeHint, type EdgeHint } from "./edgeHints.ts";
import { drawLabels } from "./labels.ts";
import { pickJelly } from "./picking.ts";

/** Which jellies stand out on a personal screen. The big stage marks none. */
export interface StageMarks {
  ownId: number | null;
  targetId: number | null;
  /** While set, only the jellies that light up can be hovered and picked. */
  highlight?: StageHighlight | null;
  /** Where the own jelly is heading. A pointer stands there until it has arrived. */
  destination?: StagePoint | null;
}

/** Where a jelly is on screen in CSS pixels: the middle of its body and how tall it shows. */
export interface JellyOnScreen {
  x: number;
  y: number;
  height: number;
}

/** What lies under the pointer. */
export interface Hovered {
  /** Another jelly that can be picked, null for none. */
  playerId: number | null;
  /** The own jelly is in front. */
  isOwn: boolean;
}

/** Where a click finds the jellies. */
export interface PickScene {
  /** Where the jellies were in the last frame, from back to front. */
  anchors: LabelAnchor[];
  marks: StageMarks;
  /** The jellies that light up in this frame. */
  highlighted: ReadonlySet<number>;
}

/** Everything painted over the room in a frame. */
export interface OverlayFrame extends PickScene {
  effects: StageEffect[];
  signLabels: Map<string, string>;
  pointer: ScreenPoint | null;
  size: ScreenSize;
  insets: StageInsets;
  now: number;
}

/** Nothing under the pointer. */
export const NOTHING_HOVERED: Hovered = { playerId: null, isOwn: false };

/** Returns where the jellies are on screen, in the order of the spots. */
export function measureAnchors(
  spots: JellySpot[],
  toScreen: (point: ScenePoint) => ScreenPoint,
): LabelAnchor[] {
  return spots.map((spot) => {
    const feet = toScreen(spot.feet);
    const head = toScreen(spot.head);
    return { player: spot.player, x: feet.x, y: feet.y, headX: head.x, height: feet.y - head.y };
  });
}

/** Returns the player of the jelly at a point that can be picked right now. */
export function pickAvailable(scene: PickScene, point: ScreenPoint): number | null {
  const { ownId, highlight } = scene.marks;
  const anchors = highlight
    ? scene.anchors.filter((anchor) => scene.highlighted.has(anchor.player.id))
    : scene.anchors;
  return pickJelly(anchors, point, ownId);
}

/** Reports whether the own jelly is the frontmost one at a point. */
export function isOwnAt(scene: PickScene, point: ScreenPoint): boolean {
  const { ownId } = scene.marks;
  return ownId !== null && pickJelly(scene.anchors, point, null) === ownId;
}

/** Finds what lies under the pointer. While jellies light up for a choice, the own one does not count. */
function findHovered(scene: PickScene, pointer: ScreenPoint | null): Hovered {
  if (!pointer) {
    return NOTHING_HOVERED;
  }
  const isOwn = !scene.marks.highlight && isOwnAt(scene, pointer);
  return { playerId: isOwn ? null : pickAvailable(scene, pointer), isOwn };
}

/** Returns where a jelly is on screen, null when it is not in the room. */
export function locateJelly(anchors: LabelAnchor[], playerId: number): JellyOnScreen | null {
  const anchor = anchors.find((candidate) => candidate.player.id === playerId);
  if (!anchor) {
    return null;
  }
  return {
    x: (anchor.x + anchor.headX) / 2,
    y: anchor.y - anchor.height / 2,
    height: anchor.height,
  };
}

/**
 * Paints texts and edge hints over the room and shows on the canvas what can be clicked. Returns
 * what lies under the pointer and the hints, for the clicks until the next frame.
 */
export function paintOverlay(
  context: CanvasRenderingContext2D,
  frame: OverlayFrame,
): { hovered: Hovered; hints: EdgeHint[] } {
  const { anchors, effects, marks, pointer, now } = frame;
  const hovered = findHovered(frame, pointer);
  drawLabels(context, {
    anchors,
    effects,
    signLabels: frame.signLabels,
    now,
    marks: { ...marks, hoveredId: hovered.playerId },
  });
  const { ownId } = marks;
  const hints =
    ownId === null
      ? []
      : findEdgeHints({ ...frame, ownId, size: frame.size, insets: frame.insets });
  drawEdgeHints(context, hints);
  const isOverHint = pointer !== null && pickEdgeHint(hints, pointer) !== null;
  const canClick = isOverHint || hovered.isOwn || hovered.playerId !== null;
  context.canvas.style.cursor = canClick ? "pointer" : "";
  return { hovered, hints };
}

/**
 * The studio of the Jelly-News in the room: the anchor desk in front of the presenter and the
 * broadcast on the beamer screens, both only while a show is on air, and the test card on the screens
 * between shows. `newsSetPlan.ts` decides where and how far, this module puts it into the scene.
 *
 * The desk draws right after the presenter, like the light of `beams.ts` draws right before its
 * jelly: over the presenter and every jelly behind it, under every nearer one. So the presenter
 * shows through it while it fades, a jelly in front of it covers it, and where the presenter stands
 * behind it the depth test hides the presenter, also its outline and cosmetics.
 *
 * @module
 */

import type { Scene } from "three";

import type { JellySpot } from "./jellies.ts";
import type { NewsLive } from "./newsDirector.ts";
import type { StageGathering, StageMove, StagePlayer } from "./types.ts";
import type { RoomSize } from "./world.ts";

import { FIRST_JELLY_ORDER, WINNER_SCALE } from "./jellies.ts";
import { createNewsScreens, showBroadcast, showTestCard, type NewsScreens } from "./newsScreens.ts";
import { createNewsDesk, type NewsDesk } from "./newsSetDesk.ts";
import {
  DESK,
  describeBroadcast,
  findShowSpan,
  measureDesk,
  measureScreens,
  placeDesk,
  type ShowSpan,
} from "./newsSetPlan.ts";
import { STAGE_HEIGHT, type Placement } from "./zones.ts";

/**
 * The desk draws this much after the presenter: between it and the next nearer jelly, and apart
 * from the light of that jelly, which draws half a step before it.
 */
const AFTER_PRESENTER = 0.25;
/** Panel and front reach this far under the stage floor, in units of the grown desk. */
const SKIRT = STAGE_HEIGHT / WINNER_SCALE;
/** Sunk this far, all of the desk lies under the stage floor. */
const SUNK = (DESK.top.bottom + DESK.top.height) * WINNER_SCALE;

/** The studio in the scene. */
export interface NewsSet {
  desk: NewsDesk;
  screens: NewsScreens;
}

/** What {@link updateNewsSet} needs for a frame. */
export interface NewsSetFrame {
  live: NewsLive | null;
  gathering: StageGathering | null;
  players: StagePlayer[];
  moves: ReadonlyMap<number, StageMove>;
  platforms: Placement[];
  room: RoomSize;
  /** Sorted from back to front, the order the jellies are drawn in. */
  spots: JellySpot[];
  /** Server time in milliseconds. */
  serverTime: number;
  reducedMotion: boolean;
}

/** Creates the studio, off air. The desk goes into the scene, the screens are part of the stage. */
export function createNewsSet(scene: Scene): NewsSet {
  const desk = createNewsDesk(SKIRT);
  scene.add(desk.group);
  return { desk, screens: createNewsScreens() };
}

/** Puts the desk in front of the presenter while the show runs, or hides it. */
function standDesk(desk: NewsDesk, span: ShowSpan | null, frame: NewsSetFrame): void {
  const presenterId = frame.live?.show.presenterId ?? null;
  const spot = span ? placeDesk({ ...frame, presenterId }) : null;
  const rank = frame.spots.findIndex((candidate) => candidate.player.id === presenterId);
  const look = span && spot && rank >= 0 ? measureDesk(span, spot, frame) : null;
  const { group } = desk;
  group.visible = look !== null && look.shown > 0;
  if (!spot || !look || !group.visible) return;
  group.renderOrder = FIRST_JELLY_ORDER + rank + AFTER_PRESENTER;
  group.position.set(spot.x, spot.floor - (1 - look.lift) * SUNK, spot.z);
  group.rotation.y = spot.turn;
  group.scale.setScalar(WINNER_SCALE);
  for (const material of desk.materials) material.opacity = look.shown;
}

/**
 * Moves the studio one frame on: desk and screens follow the show on air and the server time, and
 * between shows the screens show their test card.
 */
export function updateNewsSet(set: NewsSet, frame: NewsSetFrame): void {
  const span = frame.live ? findShowSpan(frame.gathering) : null;
  const picture = span && frame.live ? describeBroadcast(frame.live) : null;
  showTestCard(frame.reducedMotion);
  showBroadcast(set.screens, picture, span ? measureScreens(span, frame.serverTime) : 0);
  standDesk(set.desk, span, frame);
}

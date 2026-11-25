/**
 * What the framings of the news camera share: how each kind of shot frames its subject, what stands
 * in the room at a moment, and how a group of jellies is measured. Subjects sit in the upper part of
 * the picture: the lower third covers its bottom quarter, the card over the shoulder its upper
 * right. Without three.
 *
 * @module
 */

import type { NewsLook, NewsPose, NewsView } from "./newsCamera.ts";
import type { NewsActor, NewsCast } from "./newsCameraCast.ts";
import type { NewsRoom } from "./newsCameraClear.ts";
import type { FloorPoint } from "./world.ts";

import { measureSpan, standOffInBand } from "./newsCamera.ts";

/** What every framing reads. */
export interface NewsFrameScene extends NewsCast {
  presenterId: number | null;
  /** The pose of the fitted camera, which shows the whole room. */
  home: NewsPose;
  view: NewsView;
}

/** How a framing puts a jelly into the picture, in heights of that jelly. */
export interface Framing extends NewsLook {
  /** How much of the jelly the free band shows from its top to its bottom. */
  frame: number;
  /** The height the camera aims at. */
  aim: number;
  /** The camera stands at least this high, about level with the eyes. */
  eye: number;
  /** The lowest height that has to show over the heads in front. */
  base: number;
}

/** The two studio shots: the presenter with the stage beside it, or closer. */
export type StudioFraming = "medium" | "close";

/** The camera at a point of a shot, from 0 at its start to 1 at its end. */
export type NewsShotFilm = (local: number) => NewsPose;

/**
 * The presenter stands left of the middle: the card over the shoulder fills the upper right. The
 * medium shot shows the upper half of the anchor desk above the lower third, with the logo on its
 * front over the heads in front, and keeps the screen beside the presenter under the card. The close
 * shot leaves all of the desk under the headline, so its logo never peeks out beside the tabs, and
 * room over the head for a cheer: arms up and bouncing it reaches 1.19 of its height.
 */
export const STUDIO: Record<StudioFraming, Framing> = {
  medium: { frame: 1.6, aim: 0.48, eye: 0.7, base: 0.2, fov: 28, down: 0.47, across: -0.28 },
  close: { frame: 1.32, aim: 0.68, eye: 0.76, base: 0.4, fov: 30, down: 0.5, across: -0.22 },
};
/**
 * A long lens from the back of the hall, so the heads in front stay small, and high enough that the
 * jelly shows from its belly up over them.
 */
export const CLOSE: Framing = {
  frame: 1.6,
  aim: 0.58,
  eye: 0.9,
  base: 0.2,
  fov: 20,
  down: 0.36,
  across: 0,
};
/** A group stays left of the card over the shoulder. */
export const GROUP: Framing = {
  frame: 2,
  aim: 0.5,
  eye: 0.9,
  base: 0.2,
  fov: 24,
  down: 0.36,
  across: -0.1,
};
export const TOWER: Framing = {
  frame: 2,
  aim: 0.55,
  eye: 0.9,
  base: 0.2,
  fov: 26,
  down: 0.38,
  across: 0,
};
/** Over furniture a subject has to show from this share of its height up: from its chest. */
export const OVER = 0.45;
/** Of a subject only its middle has to show past the jellies in front: its face and belly. */
export const CORE = 0.6;
/** A push-in ends this much closer. */
export const PUSH = 0.12;
/** A group gets this much room to its sides. */
const GROUP_ROOM = 5;

/** A group of jellies at one moment, as a shot from one direction sees it. */
export interface GroupView {
  middle: FloorPoint;
  /** How far the group reaches to each side, seen from the camera. */
  spread: number;
  height: number;
  floor: number;
  distance: number;
}

/** Returns the middle of some points. */
export function findMiddle(points: FloorPoint[]): FloorPoint {
  const sum = points.reduce((total, point) => ({ x: total.x + point.x, z: total.z + point.z }), {
    x: 0,
    z: 0,
  });
  return { x: sum.x / Math.max(1, points.length), z: sum.z / Math.max(1, points.length) };
}

/** Returns what stands in the room besides some jellies: now, or where they walk at a time. */
export function findRoom(scene: NewsFrameScene, ids: number[], at: number | null): NewsRoom {
  const pillars = [...scene.actors.values()]
    .filter((actor) => !ids.includes(actor.id))
    .map((actor) => ({
      spot: at === null ? actor.now : actor.walk(at),
      top: actor.floor + actor.height,
      half: actor.half,
      reach: actor.reach,
    }));
  return { pillars, blocks: scene.blocks };
}

/** Measures a group where its jellies stand, seen from `direction`, and how far the camera keeps. */
export function viewGroup(
  scene: NewsFrameScene,
  subjects: NewsActor[],
  spots: FloorPoint[],
  direction: FloorPoint,
): GroupView {
  const across = { x: direction.z, z: -direction.x };
  const middle = findMiddle(spots);
  const spread = Math.max(
    0,
    ...subjects.map((subject, index) => {
      const spot = spots[index] ?? subject.now;
      const offset = (spot.x - middle.x) * across.x + (spot.z - middle.z) * across.z;
      return Math.abs(offset) + subject.half;
    }),
  );
  const height = Math.max(0, ...subjects.map((subject) => subject.height));
  const floor = Math.min(...subjects.map((subject) => subject.floor));
  // The bands of the page take height, not width.
  const wide = (2 * spread + GROUP_ROOM) / (2 * measureSpan(GROUP.fov) * scene.view.aspect);
  const distance = Math.max(standOffInBand(GROUP.frame * height, GROUP.fov, scene.view), wide);
  return { middle, spread, height, floor, distance };
}

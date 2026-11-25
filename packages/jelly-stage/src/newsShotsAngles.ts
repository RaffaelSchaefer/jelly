/**
 * Where a shot of the news looks from: of a few directions toward the camera the one that sees its
 * subject with the least look down over the jellies and props in the way. It is judged over the
 * whole take, at fixed server times, because on the server jellies walk slowly to the news and the
 * subjects may still be on their way through the lounge or behind the snack bar. So the choice
 * holds for the whole take. A shot that would have to look down too steeply is not filmed: the
 * presenter stays in the studio. Without three.
 *
 * @module
 */

import type { NewsActor } from "./newsCameraCast.ts";

import { standOffInBand, toDirection } from "./newsCamera.ts";
import { findSightHeight } from "./newsCameraClear.ts";
import {
  CORE,
  findRoom,
  OVER,
  viewGroup,
  type Framing,
  type NewsFrameScene,
} from "./newsShotsLooks.ts";

/** A take is judged at this many times from its start to its end. */
const SAMPLES = 5;
/**
 * The steepest look down a shot may take, in degrees, before the presenter keeps the picture. A
 * prop in the way hides a face completely, so over props the camera rises only so far. Jellies in
 * front are part of a crowd shot, and over them it may look down on its subject from high up.
 */
export const STEEPEST = { props: 52, crowd: 60 };
/** A direction has to look down this much less than an earlier one to win over it, in degrees. */
const BETTER_BY = 2;
/** A group wider than this cannot be filmed together: the shot would show the hall. */
const WIDEST_GROUP = 14;

/** A direction for a shot and how steeply it looks down at worst during its take, in degrees. */
export interface NewsAngle {
  azimuth: number;
  pitch: number;
}

/** When a take runs, in server time. */
export interface TakeSpan {
  from: number;
  to: number;
}

/** The jellies a shot shows and how. */
export interface ShotAim {
  subjects: NewsActor[];
  framing: Framing;
}

/** Returns the server times a take is judged at. */
function listTimes(span: TakeSpan): number[] {
  return Array.from(
    { length: SAMPLES },
    (_, index) => span.from + ((span.to - span.from) * index) / (SAMPLES - 1),
  );
}

/**
 * Returns how steeply a camera from `azimuth` has to look down at its jellies at a time, in degrees:
 * over the props alone and over everything.
 */
function measurePitch(scene: NewsFrameScene, aim: ShotAim, azimuth: number, at: number) {
  const { subjects, framing } = aim;
  const direction = toDirection(azimuth);
  const spots = subjects.map((subject) => subject.walk(at));
  const group = viewGroup(scene, subjects, spots, direction);
  const [alone] = subjects.length === 1 ? subjects : [];
  const { floor, height } = group;
  const distance = alone
    ? standOffInBand(framing.frame * height, framing.fov, scene.view)
    : group.distance;
  const sight = {
    from: group.middle,
    base: floor + framing.base * height,
    over: floor + OVER * height,
    direction,
    distance,
    half: alone ? alone.half * CORE : group.spread,
  };
  const room = findRoom(
    scene,
    subjects.map((subject) => subject.id),
    at,
  );
  const eye = floor + framing.eye * height;
  const toPitch = (need: number) =>
    (Math.atan2(Math.max(eye, need) - (floor + framing.aim * height), distance) * 180) / Math.PI;
  return {
    props: toPitch(findSightHeight(sight, { pillars: [], blocks: room.blocks })),
    all: toPitch(findSightHeight(sight, room)),
  };
}

/**
 * Picks the direction toward the camera, in degrees, that looks down least on the jellies over the
 * whole take. The order of `azimuths` says what the shot prefers: a later one has to be clearly
 * better to win. Null when every direction would have to look down too steeply.
 */
export function pickAngle(
  scene: NewsFrameScene,
  aim: ShotAim,
  azimuths: number[],
  span: TakeSpan,
): NewsAngle | null {
  const times = listTimes(span);
  let best: NewsAngle | null = null;
  for (const azimuth of azimuths) {
    const pitches = times.map((at) => measurePitch(scene, aim, azimuth, at));
    const props = Math.max(...pitches.map((pitch) => pitch.props));
    const pitch = Math.max(...pitches.map((each) => each.all));
    if (props > STEEPEST.props || pitch > STEEPEST.crowd) continue;
    if (!best || pitch < best.pitch - BETTER_BY) best = { azimuth, pitch };
  }
  return best;
}

/** Reports whether some jellies stand too far apart during a take to be filmed together. */
export function isTooWide(subjects: NewsActor[], span: TakeSpan): boolean {
  return listTimes(span).some((at) => {
    const spots = subjects.map((subject) => subject.walk(at));
    return spots.some((first) =>
      spots.some((second) => Math.hypot(first.x - second.x, first.z - second.z) > WIDEST_GROUP),
    );
  });
}

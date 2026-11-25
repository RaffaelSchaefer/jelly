/**
 * The shots the reports of the Jelly-News cut to after the studio: which jellies they show, from
 * where, and whether they can be filmed at all. A jelly the lounge, the snack bar or the crowd hides
 * from every direction, or a group spread over the hall, is not filmed: the report stays with the
 * presenter. Without three.
 *
 * @module
 */

import type { NewsMoment, NewsShow } from "./news.ts";
import type { NewsActor } from "./newsCameraCast.ts";
import type { NewsShotFilm } from "./newsShotsLooks.ts";

import { calculateMotionPose } from "./effects.ts";
import { scramble } from "./news.ts";
import { easeInOut, shakePose } from "./newsCamera.ts";
import { isTooWide, pickAngle, type TakeSpan } from "./newsShotsAngles.ts";
import { frameGroup, frameHall, frameSubject, frameTower } from "./newsShotsFrames.ts";
import { CLOSE, GROUP, TOWER, type NewsFrameScene } from "./newsShotsLooks.ts";

/** The weather shows the hall from above. A test keeps it equal to the rubric `newsLines.ts` writes. */
export const WEATHER_RUBRIC = "RAUMKLIMA";
/** Directions toward the camera, in degrees from straight in front, the preferred side first. */
const ANGLES = {
  front: [15, -15, 30, -30, 45, -45, 60, -60, 0],
  side: [22, 36, 50, 64, 0, -22, -36, -50, -64],
  group: [0, 20, -20, 40, -40, 60, -60],
  tower: [0, 25, -25, 45, -45, 60, -60],
};
/** A live picture shakes like a camera on the shoulder, this far in jelly units. */
const HANDHELD = { position: 0.05, target: 0.07 };
const SECOND_MS = 1000;
/** The jellies a report names hop this long from its start (`HOP_MS` in `newsDirector.ts`). */
export const HOP_MS = 2400;
/**
 * A close-up that sees the hop frames for its top. Once the hop is over it tightens within this
 * share of what is left of the report, and in at most `most` milliseconds.
 */
const SETTLE = { share: 0.6, most: 3000 };
/** The highest a hop lifts a jelly, as a share of its height (`calculateMotionPose` sampled). */
const HOP_PEAK = Math.max(
  ...Array.from({ length: 61 }, (_, step) => calculateMotionPose("hop", step / 60).lift),
);

/** What the camera reads of the report on air. */
export interface NewsReport {
  show: NewsShow;
  moment: NewsMoment;
  card: { playerIds: number[]; isLive: boolean; rubric: string };
}

/** Everything a shot is planned from. */
export interface NewsShotScene extends NewsFrameScene {
  live: NewsReport;
  reducedMotion: boolean;
}

/** A shot before it knows where in its beat it lies. */
export interface Shot {
  film: NewsShotFilm;
  /** Where in the shot the camera rests with reduced motion, from 0 to 1. */
  still: number;
  /** The jellies the shot shows. They look into its lens. */
  subjects: number[];
}

/** One shot of a beat, from one cut to the next. */
export interface Take extends Shot {
  /** Where it starts and ends, as progress through the beat. */
  from: number;
  to: number;
}

/** Places a shot in its beat. */
export function place(shot: Shot, from: number, to: number): Take {
  return { ...shot, from, to };
}

/** Returns the jellies of the report that are in the room. */
function listSubjects(scene: NewsShotScene): NewsActor[] {
  return scene.live.card.playerIds.flatMap((id) => scene.actors.get(id) ?? []);
}

/** Returns the side a shot prefers: achievements take turns, everything else follows the show. */
function findSide(scene: NewsShotScene): number {
  const { beat, index } = scene.live.moment;
  const turn = beat.kind === "achievement" ? index : scramble(scene.live.show.seed ^ index);
  return turn % 2 === 0 ? 1 : -1;
}

/** Returns a list of directions toward the preferred side. */
function mirror(azimuths: number[], side: number): number[] {
  return azimuths.map((azimuth) => azimuth * side);
}

/** Returns a jelly as tall as the top of its hop at a server time, shrinking back after the hop. */
function raiseForHop(scene: NewsShotScene, subject: NewsActor, serverTime: number): NewsActor {
  const { startedAt, endsAt } = scene.live.moment;
  const over = startedAt + HOP_MS;
  const settle = Math.max(1, Math.min(SETTLE.most, SETTLE.share * (endsAt - over)));
  const share = 1 - easeInOut((serverTime - over) / settle);
  return { ...subject, height: subject.height * (1 + HOP_PEAK * share) };
}

/** One jelly close up, pushing in, or null when it cannot be seen well from anywhere. */
function closeShot(
  scene: NewsShotScene,
  subject: NewsActor,
  azimuths: number[],
  span: TakeSpan,
): Shot | null {
  const angle = pickAngle(scene, { subjects: [subject], framing: CLOSE }, azimuths, span);
  if (!angle) return null;
  // With reduced motion nobody hops. Otherwise a take from inside the hop leaves room for it.
  const sees = !scene.reducedMotion && span.from < scene.live.moment.startedAt + HOP_MS;
  const film = (local: number) => {
    const serverTime = span.from + local * (span.to - span.from);
    const shown = sees ? raiseForHop(scene, subject, serverTime) : subject;
    return frameSubject(scene, shown, angle, local);
  };
  return { still: 0, subjects: [subject.id], film };
}

/** Some jellies together, travelling past them, or null when they stand too far apart or hidden. */
function groupShot(scene: NewsShotScene, subjects: NewsActor[], span: TakeSpan): Shot | null {
  if (isTooWide(subjects, span)) return null;
  const azimuths = mirror(ANGLES.group, findSide(scene));
  const angle = pickAngle(scene, { subjects, framing: GROUP }, azimuths, span);
  if (!angle) return null;
  const film = (local: number) => frameGroup(scene, subjects, angle.azimuth, 2 * local - 1);
  return { still: 0.5, subjects: subjects.map((subject) => subject.id), film };
}

/** Reports whether two lists hold the same IDs in the same order. */
function isSameList(first: number[], second: number[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

/** The tallest tower: tilting up along it while it stands, otherwise its jellies as a group. */
function stackShot(
  scene: NewsShotScene,
  memberIds: number[],
  subjects: NewsActor[],
  span: TakeSpan,
): Shot | null {
  const tower = scene.towers.find((candidate) => isSameList(candidate.memberIds, memberIds));
  const bottom = tower && scene.actors.get(tower.memberIds[0] ?? -1);
  if (!tower || !bottom) return groupShot(scene, subjects, span);
  const azimuths = mirror(ANGLES.tower, findSide(scene));
  const angle = pickAngle(scene, { subjects: [bottom], framing: TOWER }, azimuths, span);
  if (!angle) return null;
  const film = (local: number) =>
    frameTower(scene, tower, angle.azimuth, scene.reducedMotion ? null : local);
  return { still: 0, subjects: subjects.map((subject) => subject.id), film };
}

/** A live picture shakes a little, as if the camera were held, except with reduced motion. */
function handHeld(scene: NewsShotScene, shot: Shot): Shot {
  if (scene.reducedMotion) return shot;
  const { startedAt, endsAt } = scene.live.moment;
  const seconds = (endsAt - startedAt) / SECOND_MS;
  return { ...shot, film: (local) => shakePose(shot.film(local), local * seconds, HANDHELD) };
}

/** The color slot: the weather from above, a live report close up, the rest from the studio. */
function extraShot(scene: NewsShotScene, subjects: NewsActor[], span: TakeSpan): Shot | null {
  const { card } = scene.live;
  if (card.rubric === WEATHER_RUBRIC) {
    return { still: 0.5, subjects: [], film: (local) => frameHall(scene, 2 * local - 1) };
  }
  const [first] = subjects;
  if (!card.isLive || !first) return null;
  const azimuths = mirror(ANGLES.front, findSide(scene));
  const shot =
    subjects.length === 1
      ? closeShot(scene, first, azimuths, span)
      : groupShot(scene, subjects, span);
  return shot && handHeld(scene, shot);
}

/**
 * Returns the shot a report cuts to after the studio, during `span` in server time. Null when it
 * stays in the studio: it names nobody in the room, or nobody it names can be filmed well.
 */
export function reportShot(scene: NewsShotScene, span: TakeSpan): Shot | null {
  const { beat } = scene.live.moment;
  const subjects = listSubjects(scene);
  const [first] = subjects;
  if (beat.kind === "extra") return extraShot(scene, subjects, span);
  if (!first) return null;
  if (beat.kind === "stack") return stackShot(scene, beat.memberIds, subjects, span);
  const azimuths = beat.kind === "achievement" ? ANGLES.side : ANGLES.front;
  return closeShot(scene, first, mirror(azimuths, findSide(scene)), span);
}

/**
 * The shot list of the Jelly-News: which shot each report gets, where the picture cuts, how the
 * camera moves in between and where the jellies look meanwhile. A pure function of the show, the
 * moment and where the jellies stand, so all screens show the same picture, also one that joins in
 * the middle of a report. `newsShotsReports.ts` decides what a report shows after the studio,
 * `newsShotsStudio.ts` what stands in for the studio while the presenter is still on its way.
 * Without three.
 *
 * @module
 */

import type { NewsBeat } from "./news.ts";
import type { TakeSpan } from "./newsShotsAngles.ts";
import type { FloorPoint } from "./world.ts";

import { blendPoses, easeInOut, type NewsPose } from "./newsCamera.ts";
import { liftOverCrowd } from "./newsCameraClear.ts";
import { frameStudio } from "./newsShotsFrames.ts";
import { findRoom, type StudioFraming } from "./newsShotsLooks.ts";
import { measureBumper } from "./newsBarTiming.ts";
import {
  HOP_MS,
  place,
  reportShot,
  type NewsShotScene,
  type Shot,
  type Take,
} from "./newsShotsReports.ts";
import { findReady, planStudioPart, waitTake } from "./newsShotsStudio.ts";

export { WEATHER_RUBRIC, type NewsReport, type NewsShotScene } from "./newsShotsReports.ts";

/**
 * Share of a report the presenter announces it in the studio, before the cut into the hall. The cut
 * waits at least until the named jellies have hopped.
 */
const LEAD: Partial<Record<NewsBeat["kind"], number>> = {
  top_xp: 0.3,
  achievement: 0.22,
  stack: 0.25,
  extra: 0.2,
};
/** After the announcement a report shows its jellies this long at least, or cuts to them at once. */
const LEAST_REPORT_MS = 3000;
/**
 * The intro holds the hall, cranes down and lands in the studio, when the presenter stands there
 * before the crane comes `near`. The outro leaves the studio and is home. Both use most of their
 * beat, which can be only three seconds long: under the opening title the crane is out of sight.
 */
const CRANE = { hold: 0.05, near: 0.5, land: 0.9, leave: 0.1, home: 0.95 };
/** A crane faster than this many milliseconds whips: a shorter opening or closing cuts instead. */
const LEAST_CRANE_MS = 2500;
/** Instead of a crane the outro cuts halfway through, the intro under its opening title. */
const CUT = 0.5;
/** The subject of a report that opens on it turns to its camera this share of a report before. */
const TURN_AHEAD = 0.25;

/** Where the jellies look while the news are filmed, instead of into the camera. */
export interface NewsGaze {
  /** The presenter and the jellies of the report look into the lens of their shot. */
  lookers: Map<number, FloorPoint>;
  /** Everybody else looks at the presenter or the stage, null: into the camera. */
  crowd: FloorPoint | null;
}

/** The camera of one frame and where the jellies look. */
export interface NewsShot {
  pose: NewsPose;
  gaze: NewsGaze;
}

/** Studio beats alternate between the two studio shots, so a cut between them is a real cut. */
function findFraming(scene: NewsShotScene): StudioFraming {
  return scene.live.moment.index % 2 === 1 ? "close" : "medium";
}

/** The presenter in the studio, pushing in slowly over `length` of the beat. */
function studioShot(scene: NewsShotScene, length: number): Shot {
  const framing = findFraming(scene);
  return { still: 0, subjects: [], film: (local) => frameStudio(scene, framing, local * length) };
}

/** The whole hall as the normal camera shows it. */
function homeShot(scene: NewsShotScene): Shot {
  return { still: 0, subjects: [], film: () => scene.home };
}

/** A crane between two poses. Its way never runs through a jelly, a tower or a prop. */
function craneShot(scene: NewsShotScene, ends: [NewsPose, NewsPose], span: [number, number]) {
  const [start, end] = span;
  const room = findRoom(scene, [], null);
  const film = (local: number) => {
    const pose = blendPoses(ends[0], ends[1], easeInOut((local - start) / (end - start)));
    return { ...pose, position: liftOverCrowd(pose.position, room) };
  };
  return { still: 0, subjects: [], film };
}

/** Reports whether the beat on air cuts instead of a crane: with reduced motion, or too short. */
function cutsInstead(scene: NewsShotScene): boolean {
  const { startedAt, endsAt } = scene.live.moment;
  return scene.reducedMotion || (CRANE.land - CRANE.hold) * (endsAt - startedAt) < LEAST_CRANE_MS;
}

/**
 * The intro: the hall as the normal camera shows it, then a crane down into the studio. While the
 * presenter is still on its way the crane lands on the stage and the hall instead.
 */
function planIntro(scene: NewsShotScene): Take[] {
  if (cutsInstead(scene)) {
    const { moment } = scene.live;
    const cut = measureBumper(moment) / 2 / Math.max(1, moment.endsAt - moment.startedAt);
    return [place(homeShot(scene), 0, cut), ...planStudioPart(scene, cut, 1, studioShot(scene, 0))];
  }
  if (findReady(scene) <= CRANE.near) {
    const studio = frameStudio(scene, findFraming(scene), 0);
    return [place(craneShot(scene, [scene.home, studio], [CRANE.hold, CRANE.land]), 0, 1)];
  }
  // The crane lands where the stand-in takes over, which pans on with the server time.
  const rest = waitTake(scene, CRANE.land, 1);
  const crane = craneShot(scene, [scene.home, rest.film(0)], [CRANE.hold / CRANE.land, 1]);
  return [place(crane, 0, CRANE.land), rest];
}

/**
 * The outro: the studio, then a crane up into the hall, where the normal camera takes over. A
 * presenter still on its way leaves the studio to the stage and the hall.
 */
function planOutro(scene: NewsShotScene): Take[] {
  const opening =
    findReady(scene) <= 0 ? place(studioShot(scene, 0), 0, CUT) : waitTake(scene, 0, CUT);
  if (cutsInstead(scene)) return [opening, place(homeShot(scene), CUT, 1)];
  const ends: [NewsPose, NewsPose] = [opening.film(0), scene.home];
  return [place(craneShot(scene, ends, [CRANE.leave, CRANE.home]), 0, 1)];
}

/**
 * Returns how long the studio announces a report, as a share of it: not at all between two
 * achievements, nor in a report too short to show its jellies long enough after the hop.
 */
function findLead(scene: NewsShotScene): number {
  const { beat, index, startedAt, endsAt } = scene.live.moment;
  const before = scene.live.show.beats[index - 1];
  const share = beat.kind === "achievement" && before?.kind === "achievement" ? 0 : LEAD[beat.kind];
  if (!share) return 0;
  const length = Math.max(1, endsAt - startedAt);
  const lead = Math.max(share * length, HOP_MS);
  return length - lead < LEAST_REPORT_MS ? 0 : lead / length;
}

/**
 * A report: the presenter announces it, then the camera cuts to the jellies it names. While the
 * presenter is still on its way the stage and the hall stand in for the announcement, so the cut
 * still comes after the named jellies have hopped.
 */
function planReport(scene: NewsShotScene): Take[] {
  const lead = findLead(scene);
  const { startedAt, endsAt } = scene.live.moment;
  const span: TakeSpan = { from: startedAt + lead * (endsAt - startedAt), to: endsAt };
  const shot = reportShot(scene, span);
  if (!shot) return planStudioPart(scene, 0, 1, studioShot(scene, 1));
  if (lead <= 0) return [place(shot, 0, 1)];
  return [...planStudioPart(scene, 0, lead, studioShot(scene, lead)), place(shot, lead, 1)];
}

/** Returns the takes of the beat on air, in their order. */
function planTakes(scene: NewsShotScene): Take[] {
  switch (scene.live.moment.beat.kind) {
    case "intro":
      return planIntro(scene);
    case "outro":
      return planOutro(scene);
    case "next":
      return planStudioPart(scene, 0, 1, studioShot(scene, 0));
    default:
      return planReport(scene);
  }
}

/**
 * Returns the first take of the next beat when the picture will cut straight to a jelly, so that
 * jelly can turn to its camera before the cut. Only achievements follow each other that way.
 */
function listComing(scene: NewsShotScene): Take[] {
  const { moment, show, card } = scene.live;
  const next = show.beats[moment.index + 1];
  if (moment.progress < 1 - TURN_AHEAD || moment.beat.kind !== "achievement") return [];
  if (next?.kind !== "achievement") return [];
  const length = (show.marks[moment.index + 2] ?? 0) - (show.marks[moment.index + 1] ?? 0);
  const coming = {
    ...moment,
    beat: next,
    index: moment.index + 1,
    progress: 0,
    startedAt: moment.endsAt,
    endsAt: moment.endsAt + length,
  };
  const live = { ...scene.live, moment: coming, card: { ...card, playerIds: [next.playerId] } };
  return planTakes({ ...scene, live }).slice(0, 1);
}

/** Returns where everybody who is not on screen looks: at the presenter, or at the stage. */
function findCrowdLook(scene: NewsShotScene): FloorPoint | null {
  const presenter = scene.presenterId === null ? undefined : scene.actors.get(scene.presenterId);
  if (presenter) return presenter.now;
  const { stage } = scene.set;
  return stage ? { ...stage.middle } : null;
}

/**
 * Returns where the jellies look. Each jelly of a take looks where the camera of that take will
 * stand from the start of the beat on, so it has turned before the picture cuts to it.
 */
function findGaze(scene: NewsShotScene, takes: Take[]): NewsGaze {
  const lookers = new Map<number, FloorPoint>();
  for (const take of [...takes, ...listComing(scene)]) {
    if (take.subjects.length === 0) continue;
    const { position } = take.film(take.still);
    for (const id of take.subjects) {
      if (!lookers.has(id)) lookers.set(id, { x: position.x, z: position.z });
    }
  }
  const { presenterId } = scene;
  if (presenterId !== null && scene.actors.has(presenterId) && !lookers.has(presenterId)) {
    const { position } = frameStudio(scene, findFraming(scene), 0);
    lookers.set(presenterId, { x: position.x, z: position.z });
  }
  return { lookers, crowd: findCrowdLook(scene) };
}

/** Plans the camera of a frame of the news: the pose it films with and where the jellies look. */
export function planNewsShot(scene: NewsShotScene): NewsShot {
  const takes = planTakes(scene);
  const { progress } = scene.live.moment;
  const take = takes.find((candidate) => progress < candidate.to) ?? takes[takes.length - 1];
  if (!take) return { pose: scene.home, gaze: findGaze(scene, takes) };
  const share = (progress - take.from) / Math.max(Number.EPSILON, take.to - take.from);
  const local = scene.reducedMotion ? take.still : Math.max(0, Math.min(1, share));
  return { pose: take.film(local), gaze: findGaze(scene, takes) };
}

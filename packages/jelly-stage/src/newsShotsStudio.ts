/**
 * The studio while the presenter may still be on its way. On the server it walks from its desk to
 * the stage at walking pace, in a large hall for most of a show, and faces where it walks: from the
 * hall the studio would film its back. So the studio films it only once its move has ended and it
 * has turned to the hall. Until then an establishing shot of the stage and the hall stands in, where
 * the screens already show the broadcast, also for the announcement of a report before the usual cut
 * to its jellies. All of it follows from the move of the presenter and the server time. Without
 * three.
 *
 * @module
 */

import { frameEstablishing } from "./newsShotsFrames.ts";
import { place, type NewsShotScene, type Shot, type Take } from "./newsShotsReports.ts";

/** After its move ends the presenter takes this long to turn to the hall, in milliseconds. */
const SETTLE_MS = 900;
/** Neither the stand-in nor the studio gets a take shorter than this, in milliseconds: a flash. */
const LEAST_PART_MS = 2000;
/** The stand-in pans to and fro over the stage once in this long, in milliseconds of server time. */
const PAN_MS = 30_000;

/**
 * Returns how far through the beat on air the presenter is ready for the studio: 0 or less from the
 * start of the beat, 1 or more not during it. Without a presenter the studio shows the stage, which
 * is always ready.
 */
export function findReady(scene: NewsShotScene): number {
  const presenter = scene.presenterId === null ? undefined : scene.actors.get(scene.presenterId);
  if (!presenter) return Number.NEGATIVE_INFINITY;
  const { startedAt, endsAt } = scene.live.moment;
  return (presenter.arrival + SETTLE_MS - startedAt) / Math.max(1, endsAt - startedAt);
}

/**
 * The stage and the hall from high up, from `from` to `to` of the beat. It pans with the server
 * time, so stand-ins in a row join without a cut, and holds still with reduced motion.
 */
export function waitTake(scene: NewsShotScene, from: number, to: number): Take {
  const { startedAt, endsAt } = scene.live.moment;
  const film = (local: number) => {
    if (scene.reducedMotion) return frameEstablishing(scene, 0);
    const serverTime = startedAt + (from + local * (to - from)) * (endsAt - startedAt);
    return frameEstablishing(scene, Math.sin((2 * Math.PI * serverTime) / PAN_MS));
  };
  return { still: 0, subjects: [], film, from, to };
}

/**
 * Returns the takes of a studio part of a beat from `from` to `to`: the studio once the presenter is
 * ready, the stage and the hall before. It cuts to the studio only when both takes last long enough.
 */
export function planStudioPart(
  scene: NewsShotScene,
  from: number,
  to: number,
  studio: Shot,
): Take[] {
  const ready = findReady(scene);
  if (ready <= from) return [place(studio, from, to)];
  const { startedAt, endsAt } = scene.live.moment;
  const least = LEAST_PART_MS / Math.max(1, endsAt - startedAt);
  const cut = Math.max(ready, from + least);
  if (to - cut < least) return [waitTake(scene, from, to)];
  return [waitTake(scene, from, cut), place(studio, cut, to)];
}

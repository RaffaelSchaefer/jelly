/**
 * The hall of `apps/server/scripts/demo-room.sh` as areas, for tests of movement and navigation and
 * the map preview of the app. It follows the script step by step: seats first, then desks, then the
 * spine, then the front of the hall. It copies the numbers of the script in meters, so a change there
 * belongs here too.
 *
 * @module
 */

import type { StageArea, StageRoom } from "./types.ts";

/** The size of the demo hall, as the script sets it for the LAN. */
export const DEMO_HALL: Pick<StageRoom, "width_m" | "depth_m" | "jelly_m"> = {
  width_m: 10,
  depth_m: 20.5,
  jelly_m: 0.5,
};

const PERCENT = 100;
/** Every desk is a table of 1 by 0.5 meters. */
const DESK = { width: 1, depth: 0.5 };
/** The floor in front of a row of gaming desks, where its players stand. */
const SEAT_DEPTH = 0.75;
const HALVES = [0.5, 5.5];
/** The spine is a stack of desks from just behind the first row to the end of the last one. */
const SPINE = { x: 4.5, top: 5.5, desks: 26 };
/** Top edge, left half, right half and the side the players stand on, as in the script. */
const ROWS: [number, string, string, "none" | "above" | "below"][] = [
  [6, "DDDD", "DDDD", "none"],
  [6.5, "GGGG", "GGGG", "below"],
  [8.5, "GGGG", "GGGG", "above"],
  [9, "DDDD", "DDDD", "none"],
  [9.5, "GGGG", "GGGG", "below"],
  [11.5, "GGGG", "GGGG", "above"],
  [12, "DDDD", "DDDD", "none"],
  [12.5, "GGGG", "GGGG", "below"],
  [14.5, "GGGG", "GGGG", "above"],
  [15, "DDDD", "DDDD", "none"],
  [15.5, "GGGG", "GGGG", "below"],
  [17.5, "GGGG", "GGGG", "above"],
  [18, "DDGG", "GGDD", "below"],
];

/** x, y, width and height in meters, then kind, blocks, prop and rotation, as in the script. */
type Shape = [number, number, number, number, string, boolean?, string?, number?];

/** A desk: a zone nobody is assigned to, which jellies walk around. */
const DESK_ZONE: [string, boolean, string] = ["none", true, "desk"];

/**
 * The front of the hall: the stage platform with what stands on it, the lounge, the snack bar with
 * its queue, and a turned desk next to the lounge, to compare the model with the obstacle.
 */
const FRONT_ZONES: Shape[] = [
  [0.5, 0.25, 9, 2, "stage", false, "stage-platform"],
  [2.2, 0.44, 2, 0.12, "none", true, "screen"],
  [5.8, 0.44, 2, 0.12, "none", true, "screen"],
  [0.79, 0.38, 0.48, 0.5, "none", true, "speaker"],
  [8.73, 0.38, 0.48, 0.5, "none", true, "speaker"],
  [4.83, 0.41, 0.34, 0.44, "none", true, "pedestal"],
  [0.5, 3, 4, 2.5, "lounge", false, "lounge-set"],
  [6.5, 3.5, 2, 0.75, "none", true, "snack-bar-set"],
  [5, 4.25, 4.5, 1.25, "queue"],
  [4.8, 3.1, DESK.width, DESK.depth, ...DESK_ZONE, 30],
];

/** Returns start and length of every run of `letter` in a row pattern. */
function listRuns(pattern: string, letter: string): [number, number][] {
  return [...pattern.matchAll(new RegExp(`${letter}+`, "g"))].map((run) => [
    run.index,
    run[0].length,
  ]);
}

/** Returns the seats in front of the gaming desks of every row. */
function listSeats(): Shape[] {
  return ROWS.flatMap(([top, left, right, side]) =>
    side === "none"
      ? []
      : [left, right].flatMap((pattern, half) =>
          listRuns(pattern, "G").map(([start, length]): Shape => [
            (HALVES[half] ?? 0) + start * DESK.width,
            side === "above" ? top - SEAT_DEPTH : top + DESK.depth,
            length * DESK.width,
            SEAT_DEPTH,
            "seats",
          ]),
        ),
  );
}

/** Returns one desk per cell of every row. All desks have the same size. */
function listDesks(): Shape[] {
  return ROWS.flatMap(([top, left, right]) =>
    [left, right].flatMap((pattern, half) =>
      [...pattern].map((_, place): Shape => [
        (HALVES[half] ?? 0) + place * DESK.width,
        top,
        DESK.width,
        DESK.depth,
        ...DESK_ZONE,
      ]),
    ),
  );
}

/** Returns the desks of the spine, stacked from the back to the front. */
function listSpine(): Shape[] {
  return Array.from({ length: SPINE.desks }, (_, index): Shape => [
    SPINE.x,
    SPINE.top + index * DESK.depth,
    DESK.width,
    DESK.depth,
    ...DESK_ZONE,
  ]);
}

/** Returns the areas the demo creates, in percent of the stage and with IDs in the same order. */
export function createDemoRoom(): StageArea[] {
  const shapes: Shape[] = [...listSeats(), ...listDesks(), ...listSpine(), ...FRONT_ZONES];
  const perMeterX = PERCENT / DEMO_HALL.width_m;
  const perMeterY = PERCENT / DEMO_HALL.depth_m;
  return shapes.map(([x, y, width, height, kind, blocks, prop, rotation], index) => ({
    id: index + 1,
    x: x * perMeterX,
    y: y * perMeterY,
    width: width * perMeterX,
    height: height * perMeterY,
    rotation: rotation ?? 0,
    kind,
    blocks: blocks ?? false,
    prop: prop ?? "",
    name: null,
  }));
}

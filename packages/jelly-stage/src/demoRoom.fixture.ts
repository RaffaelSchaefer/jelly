/**
 * The hall of the LAN as areas, for tests of the stage and the map preview of the app. It follows the
 * plan of `apps/server/scripts/demo-room.sh`: seats first, then desks, then the spine, then the front
 * of the hall. Its desks are tables of 1 by 0.5 meters in the real hall of {@link DEMO_HALL}, so rows
 * and seats are planned in meters. The front of the hall keeps the percentages of the script.
 *
 * @module
 */

import type { StageArea, StageRoom } from "./types.ts";

/** The real size of the hall and of a jelly, as the server reports it by default. */
export const DEMO_HALL: Pick<StageRoom, "width_m" | "depth_m" | "jelly_m"> = {
  width_m: 22,
  depth_m: 16.1,
  jelly_m: 0.5,
};

const PERCENT = 100;
/** A table of the hall in meters. A gaming desk is a table with a player in front of it. */
const DESK = { width: 1, depth: 0.5 };
/** Depth of the floor in front of gaming desks, where their players stand, in meters. */
const SEAT_DEPTH = 0.75;
/** Where the left and the right half of every row start, in meters from the left wall. */
const HALVES = [2.5, 11.5];
/** The spine runs down the middle between the halves, a stack of desks from the back to the front. */
const SPINE = { x: 10.5, top: 3.6, desks: 20 };
/**
 * Top edge in meters, left half, right half and the side the players stand on. A desk row is 0.5
 * meters deep, and two rows of gaming desks face each other across their seats.
 */
const ROWS: [number, string, string, "none" | "above" | "below"][] = [
  [4.1, "DDDDDDDD", "DDDDDDDD", "none"],
  [4.6, "GGGGGGGG", "GGGGGGGG", "below"],
  [6.6, "GGGGGGGG", "GGGGGGGG", "above"],
  [7.1, "DDDDDDDD", "DDDDDDDD", "none"],
  [7.6, "GGGGGGGG", "GGGGGGGG", "below"],
  [9.6, "GGGGGGGG", "GGGGGGGG", "above"],
  [10.1, "DDDDDDDD", "DDDDDDDD", "none"],
  [10.6, "GGGGGGGG", "GGGGGGGG", "below"],
  [12.6, "GGGGGGGG", "GGGGGGGG", "above"],
  [13.1, "DDDDGGGG", "GGGGDDDD", "below"],
];

/** x, y, width, height in percent, then kind, blocks, prop and rotation, as in the script. */
type Shape = [number, number, number, number, string, boolean?, string?, number?];

/** A desk: a zone nobody is assigned to, which jellies walk around. */
const DESK_ZONE: [string, boolean, string] = ["none", true, "desk"];

/** Converts a rectangle in meters of the hall to percent of the stage. */
function inPercent(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number, number, number] {
  const perMeterX = PERCENT / DEMO_HALL.width_m;
  const perMeterY = PERCENT / DEMO_HALL.depth_m;
  return [x * perMeterX, y * perMeterY, width * perMeterX, height * perMeterY];
}

/**
 * The front of the hall in percent: the stage platform with what stands on it, the lounge, the snack
 * bar with its queue, and a turned desk next to the lounge, to compare the model with the obstacle.
 */
const FRONT_ZONES: Shape[] = [
  [5, 1, 90, 8, "stage", false, "stage-platform"],
  [22, 1.75, 20, 0.5, "none", true, "screen"],
  [58, 1.75, 20, 0.5, "none", true, "screen"],
  [7.86, 1.5, 4.76, 2, "none", true, "speaker"],
  [87.38, 1.5, 4.76, 2, "none", true, "speaker"],
  [48.33, 1.63, 3.33, 1.75, "none", true, "pedestal"],
  [5, 12, 40, 10, "lounge", false, "lounge-set"],
  [65, 14, 20, 3, "none", true, "snack-bar-set"],
  [50, 17, 45, 5, "queue"],
  [...inPercent(11.2, 1.9, DESK.width, DESK.depth), ...DESK_ZONE, 30],
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
            ...inPercent(
              (HALVES[half] ?? 0) + start * DESK.width,
              side === "above" ? top - SEAT_DEPTH : top + DESK.depth,
              length * DESK.width,
              SEAT_DEPTH,
            ),
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
        ...inPercent((HALVES[half] ?? 0) + place * DESK.width, top, DESK.width, DESK.depth),
        ...DESK_ZONE,
      ]),
    ),
  );
}

/** Returns the desks of the spine, stacked from the back to the front. */
function listSpine(): Shape[] {
  return Array.from({ length: SPINE.desks }, (_, index): Shape => [
    ...inPercent(SPINE.x, SPINE.top + index * DESK.depth, DESK.width, DESK.depth),
    ...DESK_ZONE,
  ]);
}

/** Returns the areas of the hall, with IDs in the order of the script. */
export function createDemoRoom(): StageArea[] {
  const shapes: Shape[] = [...listSeats(), ...listDesks(), ...listSpine(), ...FRONT_ZONES];
  return shapes.map(([x, y, width, height, kind, blocks, prop, rotation], index) => ({
    id: index + 1,
    x,
    y,
    width,
    height,
    rotation: rotation ?? 0,
    kind,
    blocks: blocks ?? false,
    prop: prop ?? "",
    name: null,
  }));
}

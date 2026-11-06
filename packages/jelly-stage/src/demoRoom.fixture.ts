/**
 * The hall of `apps/server/scripts/demo-room.sh` as areas, for tests of movement and navigation and
 * the map preview of the app. It follows the script step by step: seats first, then desks, then the
 * spine, then the front of the hall. It copies the numbers of the script, so a change there
 * belongs here too.
 *
 * @module
 */

import type { StageArea } from "./types.ts";

const HALVES = [5, 55];
const PLACE_WIDTH = 10;
const ROW_DEPTH = 2;
const SEAT_DEPTH = 5;
const SPINE_X = 45;
const SPINE_TOP = 22;
const SPINE_BOTTOM = 90;
/** Top edge, left half, right half and the side the players stand on, as in the script. */
const ROWS: [number, string, string, "none" | "above" | "below"][] = [
  [24, "DDDD", "DDDD", "none"],
  [26, "GGGG", "GGGG", "below"],
  [38, "GGGG", "GGGG", "above"],
  [40, "DDDD", "DDDD", "none"],
  [42, "GGGG", "GGGG", "below"],
  [54, "GGGG", "GGGG", "above"],
  [56, "DDDD", "DDDD", "none"],
  [58, "GGGG", "GGGG", "below"],
  [70, "GGGG", "GGGG", "above"],
  [72, "DDDD", "DDDD", "none"],
  [74, "GGGG", "GGGG", "below"],
  [86, "GGGG", "GGGG", "above"],
  [88, "DDGG", "GGDD", "below"],
];

/** x, y, width, height, kind, blocks, prop and rotation, as in the script. */
type Shape = [number, number, number, number, string, boolean?, string?, number?];

/** A desk: a zone nobody is assigned to, which jellies walk around. */
const DESK: [string, boolean, string] = ["none", true, "desk"];

/**
 * The front of the hall: the stage platform with what stands on it, the lounge, the snack bar with
 * its queue, and a turned desk next to the lounge, to compare the model with the obstacle.
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
  [48, 12.5, 10, 2, ...DESK, 30],
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
            (HALVES[half] ?? 0) + start * PLACE_WIDTH,
            side === "above" ? top - SEAT_DEPTH : top + ROW_DEPTH,
            length * PLACE_WIDTH,
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
        (HALVES[half] ?? 0) + place * PLACE_WIDTH,
        top,
        PLACE_WIDTH,
        ROW_DEPTH,
        ...DESK,
      ]),
    ),
  );
}

/** Returns the desks of the spine, stacked from the back to the front. */
function listSpine(): Shape[] {
  const count = (SPINE_BOTTOM - SPINE_TOP) / ROW_DEPTH;
  return Array.from({ length: count }, (_, index): Shape => {
    return [SPINE_X, SPINE_TOP + index * ROW_DEPTH, PLACE_WIDTH, ROW_DEPTH, ...DESK];
  });
}

/** Returns the areas the demo creates, with IDs in the same order. */
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

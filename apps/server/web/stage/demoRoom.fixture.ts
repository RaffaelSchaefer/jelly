/**
 * The hall of `scripts/demo-room.sh` as areas, for tests of movement and navigation. It follows the
 * script step by step: seats first, then desks, then the spine, then stage, lounge and snack bar.
 *
 * @module
 */

import type { AreaKind, StageArea } from "./types.ts";

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

type Shape = [number, number, number, number, AreaKind];

/** The stage, the lounge and the snack bar counter at the front of the hall. */
const FRONT_ZONES: Shape[] = [
  [5, 1, 90, 8, "stage"],
  [5, 12, 40, 10, "lounge"],
  [65, 14, 20, 3, "snackbar"],
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
        "desk",
      ]),
    ),
  );
}

/** Returns the desks of the spine, stacked from the back to the front. */
function listSpine(): Shape[] {
  const count = (SPINE_BOTTOM - SPINE_TOP) / ROW_DEPTH;
  return Array.from({ length: count }, (_, index): Shape => {
    return [SPINE_X, SPINE_TOP + index * ROW_DEPTH, PLACE_WIDTH, ROW_DEPTH, "desk"];
  });
}

/** Returns the areas the demo creates, with IDs in the same order. */
export function createDemoRoom(): StageArea[] {
  const shapes: Shape[] = [...listSeats(), ...listDesks(), ...listSpine(), ...FRONT_ZONES];
  return shapes.map(([x, y, width, height, kind], index) => ({
    id: index + 1,
    x,
    y,
    width,
    height,
    kind,
  }));
}

import type { StageMove, StagePoint } from "@jelly/stage";

import { createDemoRoom, DEMO_HALL } from "@jelly/stage/demo-room";
import { describe, expect, it } from "vitest";

import {
  createRouteMove,
  findPresenterSpot,
  findWalkway,
  isNearArea,
  listCrowdSpots,
  planRoute,
  positionAt,
} from "./previewNewsWalks";

const AREAS = createDemoRoom();
const STAGE = AREAS.find((area) => area.kind === "stage")!;
const SEATS = AREAS.filter((area) => area.kind === "seats");
const BLOCKING = AREAS.filter((area) => area.blocks);

/** Abstand zweier Punkte in Metern der Demo-Halle. */
function meters(a: StagePoint, b: StagePoint) {
  const dx = ((a.x - b.x) * DEMO_HALL.width_m) / 100;
  const dy = ((a.y - b.y) * DEMO_HALL.depth_m) / 100;
  return Math.hypot(dx, dy);
}

/** Punkte alle 10 cm entlang eines Wegs aus Eckpunkten. */
function sample(corners: StagePoint[]): StagePoint[] {
  return corners.slice(1).flatMap((corner, index) => {
    const before = corners[index]!;
    const steps = Math.ceil(meters(before, corner) / 0.1);
    return Array.from({ length: steps + 1 }, (_, step) => ({
      x: before.x + ((corner.x - before.x) * step) / steps,
      y: before.y + ((corner.y - before.y) * step) / steps,
    }));
  });
}

/** Die Mitte eines Sitzplatzes, wie die Vorschau dort ein Jelly hinstellt. */
function seatSpot(index: number): StagePoint {
  const seat = SEATS[index]!;
  return { x: seat.x + seat.width / 4, y: seat.y + seat.height / 2 };
}

describe("isNearArea", () => {
  /** Ein Balken, 2 m breit und 0,5 m tief, mit seiner Mitte bei 5 m und 8,2 m. */
  const depth = (meters: number) => (meters * 100) / DEMO_HALL.depth_m;
  const bar = { ...STAGE, x: 40, y: depth(7.95), width: 20, height: depth(0.5), rotation: 0 };
  /** Ein Punkt um so viele Meter neben der Mitte des Balkens. */
  const beside = (dx: number, dy: number) => ({ x: 50 + dx * 10, y: depth(8.2 + dy) });

  it("counts the inside and a margin around it, in meters", () => {
    expect(isNearArea(beside(0.9, 0.2), bar, 0)).toBe(true);
    // 0,2 m links neben dem Balken: drin mit 0,3 m Rand, draußen ohne.
    expect(isNearArea(beside(-1.2, 0), bar, 0.3)).toBe(true);
    expect(isNearArea(beside(-1.2, 0), bar, 0)).toBe(false);
  });

  it("turns the zone clockwise around its middle, seen from above", () => {
    const upright = { ...bar, rotation: 90 };
    expect(isNearArea(beside(0, 0.8), upright, 0)).toBe(true);
    expect(isNearArea(beside(0.8, 0), upright, 0)).toBe(false);
    // Im Uhrzeigersinn sinkt das rechte Ende zur Halle hin.
    const turned = { ...bar, rotation: 45 };
    expect(isNearArea(beside(0.6, 0.6), turned, 0)).toBe(true);
    expect(isNearArea(beside(0.6, -0.6), turned, 0)).toBe(false);
  });
});

describe("findPresenterSpot", () => {
  it("puts the presenter on the stage, in the middle and toward the hall", () => {
    const spot = findPresenterSpot(AREAS)!;
    expect(isNearArea(spot, STAGE, 0)).toBe(true);
    expect(spot.x).toBeCloseTo(STAGE.x + STAGE.width / 2);
    expect(spot.y).toBeGreaterThan(STAGE.y + STAGE.height / 2);
    expect(BLOCKING.some((area) => isNearArea(spot, area, 0.25))).toBe(false);
  });

  it("has no spot without a stage", () => {
    expect(findPresenterSpot(SEATS)).toBeNull();
  });
});

describe("listCrowdSpots", () => {
  const spots = listCrowdSpots(AREAS);

  it("finds room for a crowd in front of the stage", () => {
    expect(spots.length).toBeGreaterThanOrEqual(16);
    for (const spot of spots) expect(spot.y).toBeGreaterThan(STAGE.y + STAGE.height);
  });

  it("keeps every spot clear of all zones, the lounge and the turned desk included", () => {
    for (const spot of spots) {
      expect(AREAS.filter((area) => isNearArea(spot, area, 0.25))).toEqual([]);
    }
  });

  it("leaves a jelly of room between two spots", () => {
    for (const [index, spot] of spots.entries()) {
      for (const other of spots.slice(index + 1)) expect(meters(spot, other)).toBeGreaterThan(0.5);
    }
  });

  it("fills the front row first, from the middle", () => {
    const front = Math.min(...spots.map((spot) => spot.y));
    expect(spots[0]!.y).toBe(front);
    expect(Math.abs(spots[0]!.x - 50)).toBeLessThan(5);
  });
});

describe("planRoute", () => {
  const walkway = findWalkway(AREAS);
  const spots = listCrowdSpots(AREAS);

  it("walks from every seat to every spot without crossing a desk, the spine or the snack bar", () => {
    const goals = [...spots, findPresenterSpot(AREAS)!];
    for (const [index] of SEATS.entries()) {
      for (const goal of goals) {
        const points = sample(planRoute(seatSpot(index), goal, walkway));
        const crossed = points.filter((point) =>
          BLOCKING.some((area) => isNearArea(point, area, 0)),
        );
        expect(crossed).toEqual([]);
      }
    }
  });

  it("takes the aisle on the near side and drops empty steps", () => {
    const left = planRoute({ x: 15, y: 40 }, { x: 70, y: walkway }, walkway);
    expect(left[1]!.x).toBeLessThan(5);
    expect(left).toHaveLength(4);
    const right = planRoute({ x: 85, y: 40 }, { x: 30, y: walkway + 3 }, walkway);
    expect(right[1]!.x).toBeGreaterThan(95);
    expect(right).toHaveLength(5);
  });
});

describe("createRouteMove", () => {
  it("counts the time of every corner from the length of the way", () => {
    const move = createRouteMove(
      3,
      [
        { x: 0, y: 0 },
        { x: 18, y: 0 },
        { x: 18, y: 0 },
      ],
      "news",
      500,
    );
    expect(move).toMatchObject({ player_id: 3, kind: "news", start_at: 500, stack_level: 0 });
    // 1,8 m bei 1,8 m/s.
    expect(move.points.map((point) => point.t)).toEqual([0, 1000, 1000]);
  });
});

describe("positionAt", () => {
  const move: StageMove = {
    player_id: 1,
    kind: "wander",
    start_at: 1000,
    stack_level: 0,
    points: [
      { x: 10, y: 10, t: 0 },
      { x: 20, y: 10, t: 1000 },
      { x: 20, y: 30, t: 3000 },
    ],
  };
  const home = { x: 50, y: 50 };

  it("stays at home without a walk", () => {
    expect(positionAt(undefined, home, 0)).toEqual(home);
  });

  it("stands at the start before the walk and at the end after it", () => {
    expect(positionAt(move, home, 0)).toEqual({ x: 10, y: 10 });
    expect(positionAt(move, home, 9000)).toEqual({ x: 20, y: 30 });
  });

  it("goes straight between two points", () => {
    expect(positionAt(move, home, 1500)).toEqual({ x: 15, y: 10 });
    expect(positionAt(move, home, 3000)).toEqual({ x: 20, y: 20 });
  });
});

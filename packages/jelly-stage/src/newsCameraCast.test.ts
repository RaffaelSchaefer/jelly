import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageMove, StagePlayer } from "./types.ts";

import { createDemoRoom, DEMO_HALL } from "./demoRoom.fixture.ts";
import { castNews, type NewsCastInput } from "./newsCameraCast.ts";
import { measureRoom, toFloorPoint } from "./world.ts";
import { listPlatforms } from "./zones.ts";

const ROOM = measureRoom(DEMO_HALL);
const AREAS = createDemoRoom();
const SIZES = { jellyHeight: 2.33, presenterScale: 1.8 };

function player(id: number, x: number, y: number): StagePlayer {
  return {
    id,
    name: `Jelly ${id}`,
    color: "mint",
    equipped: {},
    level: 1,
    sign: null,
    follow: null,
    area_id: null,
    is_visitor: false,
    home_x: x,
    home_y: y,
  };
}

function move(playerId: number, kind: string, points: [number, number, number][], level = 0) {
  return {
    player_id: playerId,
    kind,
    start_at: 1000,
    stack_level: level,
    points: points.map(([x, y, t]) => ({ x, y, t })),
  } satisfies StageMove;
}

function createInput(): NewsCastInput {
  const players = [player(1, 50, 8.5), player(2, 30, 20), player(3, 80, 25), player(4, 80, 25)];
  const moves = new Map<number, StageMove>([
    [
      2,
      move(2, "news", [
        [30, 40, 0],
        [30, 20, 4000],
      ]),
    ],
    [3, move(3, "stack", [[86, 22, 0]], 0)],
    [4, move(4, "stack", [[86, 22, 0]], 1)],
  ]);
  return {
    players,
    moves,
    stacks: [{ id: 5, x: 86, y: 22, ends_at: 99_000, member_ids: [3, 4] }],
    areas: AREAS,
    platforms: listPlatforms(AREAS, ROOM),
    room: ROOM,
    positions: new Map([[2, toFloorPoint({ x: 30, y: 30 }, ROOM)]]),
    presenterId: 1,
    sizes: SIZES,
  };
}

test("the cast stands where the moves end, the presenter large on the stage, a tower stacked", () => {
  const { actors, towers } = castNews(createInput());
  const presenter = actors.get(1)!;
  assert.equal(presenter.floor, 0.35);
  assert.ok(Math.abs(presenter.height - 2.33 * 1.8) < 1e-9);
  const walker = actors.get(2)!;
  assert.deepEqual(walker.goal, toFloorPoint({ x: 30, y: 20 }, ROOM));
  assert.deepEqual(walker.now, toFloorPoint({ x: 30, y: 30 }, ROOM));
  assert.equal(actors.get(3)!.floor, 0);
  assert.ok(Math.abs(actors.get(4)!.floor - 0.92 * 2.33) < 1e-9);
  assert.deepEqual(towers[0]?.memberIds, [3, 4]);
  assert.deepEqual(towers[0]?.foot, toFloorPoint({ x: 86, y: 22 }, ROOM));
});

test("the set of the demo hall has its stage at the back and two screens on it", () => {
  const { set } = castNews(createInput());
  assert.ok(set.stage);
  assert.ok(set.stage.front < 0 && set.stage.front > set.stage.middle.z);
  assert.ok(Math.abs(set.stage.width - ROOM.width * 0.9) < 1e-9);
  assert.equal(set.screens.length, 2);
  for (const screen of set.screens) {
    assert.ok(Math.abs(screen.y - (0.35 + 0.55 + 1.15)) < 1e-9);
    assert.ok(screen.z < set.stage.middle.z);
  }
  assert.ok((set.screens[0]?.x ?? 0) < 0 && (set.screens[1]?.x ?? 0) > 0);
});

test("a room without a stage has no set", () => {
  const input = { ...createInput(), areas: [], platforms: [] };
  assert.deepEqual(castNews(input).set, { stage: null, screens: [] });
});

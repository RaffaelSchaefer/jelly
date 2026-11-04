import assert from "node:assert/strict";
import { test } from "node:test";

import type { EventPayload, StageCatalog, StageEvent } from "./types.ts";

import {
  calculateMotionPose,
  createEffects,
  findMotionPose,
  findVisitors,
  isFreshEvent,
  isPulseEvent,
  updateEffects,
} from "./effects.ts";

const catalog: StageCatalog = {
  signs: [],
  achievements: [{ key: "hatched", title: "Frisch geschlüpft" }],
};

function makeEvent(type: string, payload: EventPayload, playerId: number | null = 1): StageEvent {
  return { id: 1, type, player_id: playerId, payload, created_at: 1000 };
}

test("an emote shows its bubble, and a lively emote also moves the jelly", () => {
  const wave = createEffects(makeEvent("emote", { key: "wave" }), catalog, 0);
  assert.deepEqual(
    wave.map((effect) => effect.kind),
    ["bubble"],
  );
  const cheer = createEffects(makeEvent("emote", { key: "cheer" }), catalog, 0);
  assert.deepEqual(
    cheer.map((effect) => effect.kind),
    ["bubble", "motion"],
  );
});

test("an unknown emote from a newer server does nothing", () => {
  assert.deepEqual(createEffects(makeEvent("emote", { key: "new" }), catalog, 0), []);
});

test("a partner emote moves both partners together", () => {
  const effects = createEffects(
    makeEvent("partner.emote", { key: "hop", partner_id: 2 }),
    catalog,
    50,
  );
  assert.deepEqual(
    effects.map((effect) => effect.playerId),
    [1, 2],
  );
  assert.equal(effects[0]?.startedAt, effects[1]?.startedAt);
});

test("a secret achievement does not reveal itself", () => {
  const known = createEffects(makeEvent("achievement.earned", { key: "hatched" }), catalog, 0);
  const secret = createEffects(makeEvent("achievement.earned", { key: "hidden" }), catalog, 0);
  assert.ok(known[0]?.kind === "toast" && known[0].text === "Frisch geschlüpft");
  assert.ok(secret[0]?.kind === "toast" && secret[0].text === "Geheimes Achievement");
});

test("lasting changes and events without a player trigger nothing", () => {
  assert.deepEqual(createEffects(makeEvent("sign.changed", { key: "cs2" }), catalog, 0), []);
  assert.deepEqual(createEffects(makeEvent("stage.changed", {}, null), catalog, 0), []);
});

test("old replayed events are not animated", () => {
  const event = makeEvent("emote", { key: "wave" });
  assert.ok(isFreshEvent(event, 5000));
  assert.ok(!isFreshEvent(event, 60_000));
});

test("finished effects disappear and the list stays bounded", () => {
  const added = createEffects(makeEvent("emote", { key: "wave" }), catalog, 0);
  assert.equal(updateEffects([], added, 1000).length, 1);
  assert.equal(updateEffects(added, [], 60_000).length, 0);
  const flood = Array.from({ length: 500 }, () => added[0]!);
  assert.equal(updateEffects([], flood, 1000).length, 200);
});

test("every motion starts and ends at rest", () => {
  for (const motion of ["hop", "wiggle"] as const) {
    for (const progress of [0, 1]) {
      const pose = calculateMotionPose(motion, progress);
      const isResting = [pose.lift, pose.turn, pose.tilt].every((value) => Math.abs(value) < 1e-9);
      assert.ok(isResting, `${motion} ${progress}`);
    }
  }
  assert.ok(Math.abs(calculateMotionPose("spin", 1).turn - 2 * Math.PI) < 1e-9);
});

test("a spin turns the jelly around, a wiggle tilts it, others rest", () => {
  const effects = createEffects(
    {
      id: 1,
      type: "partner.emote",
      player_id: 4,
      payload: { key: "spin", partner_id: 9 },
      created_at: 0,
    },
    { signs: [], achievements: [] },
    1000,
  );
  assert.ok(findMotionPose(effects, 9, 1600).turn > 0);
  assert.deepEqual(findMotionPose(effects, 5, 1600), { lift: 0, turn: 0, tilt: 0 });
});

test("rewards make a jelly bounce, emotes do not", () => {
  const event = { id: 1, player_id: 4, payload: {}, created_at: 0 };
  assert.equal(isPulseEvent({ ...event, type: "xp.gained" }), true);
  assert.equal(isPulseEvent({ ...event, type: "level.up" }), true);
  assert.equal(isPulseEvent({ ...event, type: "emote" }), false);
});

test("food and drink send the jelly on a snack run, a poke does not", () => {
  const catalog = { signs: [], achievements: [] };
  const event = { id: 1, type: "xp.gained", player_id: 4, created_at: 0 };
  const food = createEffects({ ...event, payload: { amount: 15, source: "food" } }, catalog, 1000);
  const poke = createEffects({ ...event, payload: { amount: 3, source: "poke" } }, catalog, 1000);
  assert.deepEqual([...findVisitors(food, 5000)], [4]);
  assert.equal(findVisitors(food, 20_000).size, 0, "the run ends");
  assert.equal(findVisitors(poke, 5000).size, 0);
});

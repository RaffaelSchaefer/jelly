import assert from "node:assert/strict";
import { test } from "node:test";

import type { EventPayload, StageCatalog, StageEvent } from "./types.ts";

import { calculateMotionPose, createEffects, isFreshEvent, updateEffects } from "./effects.ts";

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
      assert.ok(Math.abs(pose.lift) < 1e-9 && Math.abs(pose.angle) < 1e-9, `${motion} ${progress}`);
    }
  }
  assert.ok(Math.abs(calculateMotionPose("spin", 1).angle - 2 * Math.PI) < 1e-9);
});

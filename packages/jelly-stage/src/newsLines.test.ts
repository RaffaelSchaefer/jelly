import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageCatalog, StagePlayer } from "./types.ts";

import { NEWS_PICTURES, writeCard, type NewsScene } from "./newsLines.ts";

const catalog: StageCatalog = {
  signs: [{ key: "cs2", label: "Suche CS2" }],
  achievements: [
    { key: "hatched", title: "Frisch geschlüpft" },
    { key: "hydrated", title: "Gut hydriert" },
  ],
};

function makePlayer(id: number, more: Partial<StagePlayer> = {}): StagePlayer {
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
    home_x: 10,
    home_y: 20,
    ...more,
  };
}

function makeScene(more: Partial<NewsScene> = {}): NewsScene {
  return {
    players: [1, 2, 3, 4].map((id) => makePlayer(id)),
    catalog,
    presenterId: 1,
    named: new Set([1, 2]),
    seed: 12345,
    hour: 14,
    formatTime: () => "20:00",
    ...more,
  };
}

test("the opening greets by the time of day and names the presenter", () => {
  const day = writeCard({ kind: "intro" }, makeScene());
  assert.equal(day.headline, "Guten Tag. Hier sind die Jelly-News.");
  assert.equal(day.sub, "IM STUDIO: Jelly 1");
  assert.match(writeCard({ kind: "intro" }, makeScene({ hour: 2 })).headline, /^Gute Nacht/);
  assert.match(writeCard({ kind: "intro" }, makeScene({ hour: 8 })).headline, /^Guten Morgen/);
  assert.equal(writeCard({ kind: "outro" }, makeScene({ presenterId: null })).sub, "IM STUDIO");
});

test("the XP report names the jelly and its number", () => {
  const card = writeCard({ kind: "top_xp", playerId: 2, xp: 420 }, makeScene());
  assert.match(card.headline, /Jelly 2/);
  assert.match(card.headline, /420 XP/);
  assert.equal(card.figure, "420 XP");
  assert.deepEqual(card.playerIds, [2]);
});

test("a jelly that left keeps its report, but gets no light", () => {
  const card = writeCard({ kind: "top_xp", playerId: 99, xp: 5 }, makeScene());
  assert.match(card.headline, /Ein Jelly/);
  assert.deepEqual(card.playerIds, []);
});

test("an achievement has its own report, a usual one or stays secret", () => {
  const special = writeCard({ kind: "achievement", playerId: 2, key: "hydrated" }, makeScene());
  assert.equal(special.headline, "Wasserwerke schlagen Alarm: Jelly 2 ist gut hydriert.");
  const usual = writeCard({ kind: "achievement", playerId: 2, key: "hatched" }, makeScene());
  assert.match(usual.headline, /Frisch geschlüpft/);
  const secret = writeCard({ kind: "achievement", playerId: 2, key: "hidden" }, makeScene());
  assert.match(secret.headline, /Geheimes Achievement/);
  assert.doesNotMatch(secret.headline, /hidden/);
});

test("the tower counts its jellies and lights those in the room", () => {
  const card = writeCard({ kind: "stack", memberIds: [3, 4, 99] }, makeScene());
  assert.match(card.headline, /3 Jellies/);
  assert.equal(card.sub, "Jelly 3, Jelly 4, Ein Jelly");
  assert.deepEqual(card.playerIds, [3, 4]);
});

test("the next point tells its time, and orga and tournaments are urgent", () => {
  const item = {
    starts_at: 1,
    ends_at: null,
    title: "CS2-Turnier",
    detail: "Finale",
    kind: "orga",
  };
  const urgent = writeCard({ kind: "next", item }, makeScene());
  assert.match(urgent.headline, /^Um 20:00 Uhr: CS2-Turnier\./);
  assert.equal(urgent.sub, "Finale");
  assert.equal(urgent.isUrgent, true);
  const unknown = writeCard(
    { kind: "next", item: { ...item, kind: "new", detail: null } },
    makeScene(),
  );
  assert.equal(unknown.rubric, "PROGRAMM");
  assert.equal(unknown.headline, "Um 20:00 Uhr: CS2-Turnier.");
  assert.equal(unknown.isUrgent, false);
});

test("the color slot always has a report, also in an empty hall", () => {
  for (let seed = 0; seed < 40; seed++) {
    const empty = writeCard({ kind: "extra" }, makeScene({ seed, players: [] }));
    assert.equal(empty.rubric, "RAUMKLIMA");
    const full = writeCard({ kind: "extra" }, makeScene({ seed }));
    assert.ok(full.headline.length > 0);
    assert.doesNotMatch(full.headline, /\{/);
    // Nobody the show names is asked again.
    assert.ok(full.playerIds.every((id) => id === 3 || id === 4));
  }
});

test("the color slot finds signs, company and the stolen hat", () => {
  const players = [
    makePlayer(3, { sign: "cs2" }),
    makePlayer(4, { sign: "cs2", follow: { player_id: 3, ends_at: 9 } }),
    makePlayer(5, { equipped: { head: { key: "wizard-hat", color: null } } }),
  ];
  const rubrics = new Set<string>();
  for (let seed = 0; seed < 200; seed++) {
    const card = writeCard({ kind: "extra" }, makeScene({ seed, players, named: new Set() }));
    rubrics.add(card.rubric);
    if (card.rubric === "MITSPIELER-BÖRSE") {
      assert.equal(card.headline, "2 Jellies halten gerade das Schild „Suche CS2“.");
    }
    if (card.rubric === "KLATSCH") assert.match(card.headline, /Jelly 4 steht bei Jelly 3/);
    if (card.rubric === "KRIMINALITÄT") assert.deepEqual(card.playerIds, [5]);
  }
  for (const rubric of ["MITSPIELER-BÖRSE", "KLATSCH", "KRIMINALITÄT", "RAUMKLIMA"]) {
    assert.ok(rubrics.has(rubric), `${rubric} never showed`);
  }
});

test("the same show writes the same card on every screen", () => {
  const first = writeCard({ kind: "extra" }, makeScene({ seed: 77 }));
  const again = writeCard({ kind: "extra" }, makeScene({ seed: 77 }));
  assert.deepEqual(first, again);
});

test("every report has a picture, only opening and closing show the logo", () => {
  const item = { starts_at: 1, ends_at: null, title: "Yoga", detail: null, kind: "yoga" };
  assert.equal(writeCard({ kind: "intro" }, makeScene()).picture, null);
  assert.equal(writeCard({ kind: "outro" }, makeScene()).picture, null);
  assert.equal(writeCard({ kind: "top_xp", playerId: 2, xp: 1 }, makeScene()).picture, "xp");
  assert.equal(writeCard({ kind: "stack", memberIds: [3, 4] }, makeScene()).picture, "tower");
  assert.equal(writeCard({ kind: "next", item }, makeScene()).picture, "yoga");
  assert.equal(
    writeCard({ kind: "next", item: { ...item, kind: "new" } }, makeScene()).picture,
    "program",
  );
  const night = writeCard({ kind: "extra" }, makeScene({ players: [], hour: 2 }));
  assert.equal(night.picture, "weather-night");
  for (let seed = 0; seed < 60; seed++) {
    const { picture } = writeCard({ kind: "extra" }, makeScene({ seed }));
    assert.ok(picture !== null && NEWS_PICTURES.includes(picture));
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageGathering, StageNews } from "./types.ts";

import { findMoment, listNamed, planShow, scramble, type NewsShow } from "./news.ts";

const ENDS_AT = 1_795_000_090_000;

const fullNews: StageNews = {
  top_xp: { player_id: 3, xp: 420 },
  achievements: [5, 6, 7, 8, 9].map((id) => ({ player_id: id, key: "hatched" })),
  tallest_stack: [1, 2],
  next_item: { starts_at: ENDS_AT, ends_at: null, title: "Yoga", detail: null, kind: "yoga" },
};

function makeGathering(news: StageNews | null, more: Partial<StageGathering> = {}): StageGathering {
  return { kind: "news", winner_id: null, ends_at: ENDS_AT, presenter_id: 4, news, ...more };
}

function listKinds(gathering: StageGathering): string[] {
  return planShow(gathering)?.beats.map((beat) => beat.kind) ?? [];
}

test("only news with something to tell are a show", () => {
  assert.equal(planShow(null), null);
  assert.equal(planShow(makeGathering(null)), null);
  assert.equal(planShow(makeGathering(fullNews, { kind: "ceremony" })), null);
  // A server before the Jelly-News sends neither presenter nor news.
  assert.equal(planShow({ kind: "news", winner_id: null, ends_at: ENDS_AT }), null);
});

test("a show opens, reports in order and closes", () => {
  const gathering = makeGathering(fullNews, { starts_at: ENDS_AT - 300_000 });
  assert.deepEqual(listKinds(gathering), [
    "intro",
    "top_xp",
    ...Array.from({ length: 5 }, () => "achievement"),
    "stack",
    "extra",
    "next",
    "outro",
  ]);
});

test("empty parts leave no report", () => {
  const news = { top_xp: null, achievements: [], tallest_stack: [], next_item: null };
  assert.deepEqual(listKinds(makeGathering(news)), ["intro", "extra", "outro"]);
});

/** Returns the jellies of the achievements a show kept, in their order. */
function listKept(show: NewsShow | null | undefined): number[] {
  return show?.beats.flatMap((beat) => (beat.kind === "achievement" ? [beat.playerId] : [])) ?? [];
}

/** Reports whether a show kept its color report. */
function hasColor(show: NewsShow | null | undefined): boolean {
  return show?.beats.some((beat) => beat.kind === "extra") ?? false;
}

test("a show that would rush drops the color first, then the oldest achievements", () => {
  // The gathering shrinks second by second, so the test needs no length of a report.
  const plans = Array.from({ length: 90 }, (_, index) =>
    planShow(makeGathering(fullNews, { starts_at: ENDS_AT - (90 - index) * 1000 })),
  );
  // The usual 90 seconds hold everything.
  assert.equal(plans[0]?.beats.length, 11);
  const colorless = plans.find((show) => !hasColor(show));
  assert.deepEqual(listKept(colorless), [5, 6, 7, 8, 9]);
  const fewer = plans.find((show) => listKept(show).length < 5);
  assert.equal(hasColor(fewer), false);
  assert.deepEqual(listKept(fewer), [5, 6, 7, 8]);
  // The newest stays, and what the hour was about is never dropped.
  const shortest = plans.at(-1);
  assert.deepEqual(listKept(shortest), [5]);
  assert.deepEqual(
    shortest?.beats.map((beat) => beat.kind),
    ["intro", "top_xp", "achievement", "stack", "next", "outro"],
  );
});

test("the last run ends with the gathering", () => {
  for (const seconds of [30, 90, 200, 600, 3600]) {
    const show = planShow(makeGathering(fullNews, { starts_at: ENDS_AT - seconds * 1000 }));
    assert.ok(show);
    const length = show.marks.at(-1) ?? 0;
    const runs = (seconds * 1000) / length;
    assert.ok(Math.abs(runs - Math.round(runs)) < 1e-9, `${seconds} s has ${runs} runs`);
    const last = findMoment(show, ENDS_AT - 1);
    assert.equal(last?.beat.kind, "outro");
    assert.equal(last?.run, 1);
    assert.equal(findMoment(show, ENDS_AT), null);
  }
});

test("every screen finds the same moment, whenever it loads", () => {
  const show = planShow(makeGathering(fullNews, { starts_at: ENDS_AT - 200_000 }));
  assert.ok(show);
  const [, second = 0, , , , , , , , , , length = 0] = show.marks;
  const at = (time: number) => {
    const moment = findMoment(show, time);
    assert.ok(moment);
    return moment;
  };
  const opening = at(ENDS_AT - length + 1);
  assert.equal(opening.beat.kind, "intro");
  assert.ok(opening.progress < 0.001);
  const report = at(ENDS_AT - length + second + 10);
  assert.equal(report.index, 1);
  assert.ok(Math.abs(report.startedAt - (ENDS_AT - length + second)) < 1e-3);
  // A run earlier the same beat is on, and tells which run it is.
  const earlier = at(ENDS_AT - 2 * length + second + 10);
  assert.equal(earlier.index, 1);
  assert.equal(earlier.run, 2);
});

test("a show without a known start repeats until its gathering ends", () => {
  const show = planShow(makeGathering(fullNews));
  assert.ok(show);
  // An admin started it nine minutes before the end: a run begins there, nine minutes of runs ago.
  const early = findMoment(show, ENDS_AT - 540_000 + 1);
  assert.equal(early?.beat.kind, "intro");
  assert.equal(early?.run, 540_000 / (show.marks.at(-1) ?? 1));
});

test("two shows differ in key and seed, the same show never", () => {
  const first = planShow(makeGathering(fullNews));
  const again = planShow(makeGathering(fullNews));
  const other = planShow(makeGathering(fullNews, { ends_at: ENDS_AT + 60_000 }));
  assert.equal(first?.key, again?.key);
  assert.equal(first?.seed, again?.seed);
  assert.notEqual(first?.key, other?.key);
  assert.notEqual(first?.seed, other?.seed);
  assert.equal(scramble(7), scramble(7));
});

test("the named jellies are the presenter and everybody in a report", () => {
  const show = planShow(makeGathering(fullNews, { starts_at: ENDS_AT - 300_000 }));
  assert.ok(show);
  assert.deepEqual([...listNamed(show)].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

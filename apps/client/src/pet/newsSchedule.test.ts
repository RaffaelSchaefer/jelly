import { findMoment, planShow } from "@jelly/stage/news";
import { describe, expect, it } from "vitest";

import {
  anchorVoice,
  JINGLE_ACCENT_MS,
  listAnchorPhrases,
  nextAnchorStep,
  notesSeconds,
  planAnchor,
  readNewsGathering,
  type AnchorPlan,
  type ServerEvent,
} from ".";

const ENDS_AT = 1_795_000_090_000;
const VOICE = anchorVoice(1, 2);

/** Alles, was der Server melden kann. */
const NEWS = {
  top_xp: { player_id: 2, xp: 420 },
  achievements: [
    { player_id: 3, key: "hydrated" },
    { player_id: 4, key: "hatched" },
  ],
  tallest_stack: [20, 21, 22],
  next_item: { starts_at: ENDS_AT, ends_at: null, title: "CS2", detail: null, kind: "tournament" },
};

/** Der Beginn einer Sendung von `seconds` Sekunden, wie ihn der Server meldet. */
function started(seconds = 90, more: Record<string, unknown> = {}): ServerEvent {
  const payload = { kind: "news", winner_id: null, ends_at: ENDS_AT, presenter_id: 1, news: NEWS };
  return {
    id: 1,
    type: "gathering.changed",
    player_id: null,
    payload: { ...payload, ...more },
    created_at: ENDS_AT - seconds * 1000,
  };
}

/** Die Sendung von `seconds` Sekunden. */
function plan(seconds = 90): AnchorPlan {
  const planned = planAnchor(started(seconds));
  if (!planned) throw new Error("Keine Sendung");
  return planned;
}

describe("the show the presenter reads", () => {
  it("starts with the event like on the stage, while the server sends no start", () => {
    const { show, startedAt } = plan();
    expect(startedAt).toBe(ENDS_AT - 90_000);
    const gathering = { ...readNewsGathering(started().payload)!, starts_at: startedAt };
    expect(show).toEqual(planShow(gathering));
  });

  it("takes the start of a newer server", () => {
    const event = started(90, { starts_at: ENDS_AT - 60_000 });
    expect(planAnchor(event)?.startedAt).toBe(ENDS_AT - 60_000);
  });

  it("reads empty parts as null and drops anything malformed", () => {
    const empty = {
      top_xp: null,
      achievements: null,
      tallest_stack: null,
      next_item: NEWS.next_item,
    };
    expect(planAnchor(started(90, { news: empty }))).not.toBeNull();
    const broken = [
      { news: { ...NEWS, achievements: [null] } },
      { news: { ...NEWS, tallest_stack: "20" } },
      { news: { ...NEWS, top_xp: { player_id: "2", xp: 1 } } },
      { news: "x" },
      { presenter_id: "1" },
      { ends_at: "bald" },
      { kind: "food" },
    ];
    for (const more of broken) expect(planAnchor(started(90, more))).toBeNull();
    expect(planAnchor({ ...started(), type: "stack.changed" })).toBeNull();
    expect(planAnchor({ ...started(), payload: null })).toBeNull();
  });
});

describe("the phrases of a show", () => {
  it.each([20, 45, 90, 300])("follow the planned beats of a %i s show", (seconds) => {
    const current = plan(seconds);
    for (const phrase of listAnchorPhrases(current, VOICE)) {
      const moment = findMoment(current.show, phrase.at)!;
      expect(moment.beat).toEqual(phrase.beat);
      expect(phrase.at + notesSeconds(phrase.notes) * 1000).toBeLessThan(moment.endsAt);
    }
  });

  it("come once per beat and again in each repeat, never overlapping", () => {
    const current = plan(300);
    const runs = Math.round(300_000 / current.show.marks.at(-1)!);
    expect(runs).toBeGreaterThan(1);
    const phrases = listAnchorPhrases(current, VOICE);
    expect(new Set(phrases.map((phrase) => phrase.key)).size).toBe(phrases.length);
    // Vom ersten Durchlauf fehlt nur, was in die Eröffnung des Jingles fiele.
    expect(phrases.length).toBeGreaterThan(current.show.beats.length * (runs - 1));
    phrases.slice(1).forEach((phrase, index) => {
      const before = phrases[index]!;
      expect(before.at + notesSeconds(before.notes) * 1000).toBeLessThan(phrase.at);
    });
  });

  it("repeat the same phrase for the same beat", () => {
    const phrases = listAnchorPhrases(plan(300), VOICE);
    const outros = phrases.filter((phrase) => phrase.beat.kind === "outro");
    expect(outros.length).toBeGreaterThan(1);
    expect(outros[1]!.notes).toEqual(outros[0]!.notes);
  });

  it("start with the cut, also the greeting, and keep the accent of the jingle free", () => {
    const current = plan();
    const phrases = listAnchorPhrases(current, VOICE);
    expect(phrases[0]!.beat.kind).toBe("intro");
    for (const phrase of phrases) {
      expect(phrase.at - findMoment(current.show, phrase.at)!.startedAt).toBeLessThan(50);
      const end = phrase.at + notesSeconds(phrase.notes) * 1000;
      const accentFrom = current.startedAt + JINGLE_ACCENT_MS.from;
      const accentTo = current.startedAt + JINGLE_ACCENT_MS.to;
      expect(end <= accentFrom || phrase.at >= accentTo).toBe(true);
    }
  });

  it("wait for the accent of the jingle when a report begins on it", () => {
    // 20 s Sendung: Beiträge von gut 2,4 s, der zweite beginnt mitten im Schlag.
    const current = plan(20);
    const inside = listAnchorPhrases(current, VOICE).filter(
      (phrase) => findMoment(current.show, phrase.at)!.startedAt < current.startedAt + 3200,
    );
    for (const phrase of inside.slice(1)) {
      expect(phrase.at).toBeGreaterThanOrEqual(current.startedAt + JINGLE_ACCENT_MS.to);
    }
  });

  it("shrink or drop out in a short show", () => {
    const short = listAnchorPhrases(plan(20), VOICE);
    const long = listAnchorPhrases(plan(90), VOICE);
    expect(short.length).toBeGreaterThan(0);
    const longest = (phrases: typeof short) =>
      Math.max(...phrases.map((phrase) => notesSeconds(phrase.notes)));
    expect(longest(short)).toBeLessThan(longest(long));
  });
});

describe("the next step of the presenter", () => {
  const current = plan();
  const [first, second] = listAnchorPhrases(current, VOICE);

  it("waits until the show begins and until the phrase is due", () => {
    expect(nextAnchorStep(current, current.startedAt - 500, null, VOICE)).toEqual({
      phrase: null,
      wakeAt: current.startedAt,
    });
    const step = nextAnchorStep(current, first!.at - 2000, null, VOICE);
    expect(step.phrase).toBeNull();
  });

  it("speaks when the phrase is due and then waits for the next beat", () => {
    const step = nextAnchorStep(current, first!.at, null, VOICE);
    expect(step.phrase?.key).toBe(first!.key);
    expect(step.phrase?.notes).toEqual(first!.notes);
    expect(step.wakeAt).toBeGreaterThan(first!.at);
    expect(step.wakeAt).toBeLessThanOrEqual(second!.at);
  });

  it("never speaks a phrase twice", () => {
    expect(nextAnchorStep(current, first!.at + 100, first!.key, VOICE).phrase).toBeNull();
  });

  it("drops a phrase that comes too late for its beat", () => {
    expect(nextAnchorStep(current, first!.at + 1500, null, VOICE).phrase).toBeNull();
    expect(nextAnchorStep(current, first!.at + 400, null, VOICE).phrase?.key).toBe(first!.key);
  });

  it("stops after the show", () => {
    expect(nextAnchorStep(current, ENDS_AT + 1, null, VOICE)).toEqual({
      phrase: null,
      wakeAt: null,
    });
  });
});

describe("the pet and the rendered show", () => {
  it.each([90, 300])("say the same phrases at the same times in a %i s show", (seconds) => {
    const current = plan(seconds);
    const heard: { key: string; at: number }[] = [];
    let now = current.startedAt;
    let done: string | null = null;
    for (let wake = 0; wake < 500; wake++) {
      const step = nextAnchorStep(current, now, done, VOICE);
      if (step.phrase) {
        done = step.phrase.key;
        heard.push({ key: step.phrase.key, at: step.phrase.at });
      }
      if (step.wakeAt === null) break;
      now = Math.max(now, step.wakeAt);
    }
    const listed = listAnchorPhrases(current, VOICE).map(({ key, at }) => ({ key, at }));
    expect(heard).toEqual(listed);
  });
});

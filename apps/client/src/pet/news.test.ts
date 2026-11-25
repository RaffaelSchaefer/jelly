import { describe, expect, it } from "vitest";

import { newsCue, PREVIEW_CATALOG, previewNewsEvent, type NewsViewer, type ServerEvent } from ".";

/** Das eigene Jelly. `0` wie in der Vorschau: eine gültige ID, die `Number(null)` auch ergäbe. */
const OWN = 0;

/** Die Uhr des Servers, eine Minute vor dem Ende der Sendung. */
const NOW = 1_000_000;

/** Wer zuschaut. */
const VIEWER: NewsViewer = { id: OWN, now: NOW, catalog: PREVIEW_CATALOG };

/** Was die News melden, ohne das eigene Jelly. */
const NEWS = {
  top_xp: { player_id: 9, xp: 80 },
  achievements: [{ player_id: 8, key: "tournament" }],
  tallest_stack: [8, 9],
  next_item: null,
};

/** Ein `gathering.changed` mit diesem Gathering. */
function changed(payload: Record<string, unknown> | null): ServerEvent {
  return { id: 1, type: "gathering.changed", player_id: null, payload, created_at: 0 };
}

/** Der Beginn der Jelly-News mit Mo als Vorleser, `patch` ändert daran. */
function news(patch: Record<string, unknown> = {}) {
  return changed({
    kind: "news",
    winner_id: null,
    ends_at: NOW + 60_000,
    presenter_id: 7,
    news: NEWS,
    ...patch,
  });
}

describe("the role of the jelly in the news", () => {
  it("is proud to present them", () => {
    expect(newsCue(news({ presenter_id: OWN }), VIEWER)).toEqual({
      show: NOW + 60_000,
      role: "presenter",
      message: "Ich moderiere die Jelly-News! Schau mir auf der Karte zu.",
      hops: true,
      jingle: true,
      anchor: true,
      bed: true,
    });
  });

  it("presents news it is in itself", () => {
    const cue = newsCue(
      news({ presenter_id: OWN, news: { ...NEWS, tallest_stack: [8, OWN] } }),
      VIEWER,
    );
    expect(cue?.role).toBe("presenter");
    expect(cue?.message).toBe("Ich moderiere die Jelly-News und komme selbst drin vor!");
  });

  it("points everybody else to the map without a hop", () => {
    expect(newsCue(news(), VIEWER)).toEqual({
      show: NOW + 60_000,
      role: "watching",
      message: "Die Jelly-News laufen. Schau auf die Karte!",
      hops: false,
      jingle: true,
      anchor: true,
      bed: true,
    });
  });
});

describe("being named in the news", () => {
  /** Was das eigene Jelly sagt, wenn die News `parts` melden. */
  const line = (parts: Record<string, unknown>) =>
    newsCue(news({ news: { ...NEWS, ...parts } }), VIEWER);

  it("names the most XP of the hour with their number", () => {
    expect(line({ top_xp: { player_id: OWN, xp: 120 } })).toMatchObject({
      role: "named",
      message: "Ich bin in den News: 120 XP in einer Stunde!",
      hops: true,
    });
    expect(line({ top_xp: { player_id: OWN, xp: "viel" } })?.message).toBe(
      "Ich bin in den News: die meisten XP der Stunde!",
    );
  });

  it("names the tallest tower with its height", () => {
    expect(line({ tallest_stack: [8, OWN, 9] })?.message).toBe(
      "Ich bin in den News: unser Turm, 3 Jellies hoch!",
    );
    expect(line({ tallest_stack: [OWN] })?.message).toBe(
      "Ich bin in den News: unser Turm war der höchste!",
    );
  });

  it("names an achievement with its title, and an unknown one without", () => {
    const earned = (key: string) => line({ achievements: [{ player_id: OWN, key }] })?.message;
    expect(earned("hydrated")).toBe("Ich bin in den News: mein Erfolg „Gut hydriert“!");
    expect(earned("future")).toBe("Ich bin in den News: mein neuer Erfolg!");
  });

  it("tells only the most notable part: XP, then tower, then achievement", () => {
    const everywhere = {
      top_xp: { player_id: OWN, xp: 50 },
      tallest_stack: [OWN, 8],
      achievements: [{ player_id: OWN, key: "hydrated" }],
    };
    expect(line(everywhere)?.message).toBe("Ich bin in den News: 50 XP in einer Stunde!");
    expect(line({ ...everywhere, top_xp: null })?.message).toBe(
      "Ich bin in den News: unser Turm, 2 Jellies hoch!",
    );
  });
});

describe("what is no news to the pet", () => {
  it("stays quiet about other events, other gatherings and the end", () => {
    const food = changed({ kind: "food", winner_id: null, ends_at: NOW + 1 });
    const ceremony = changed({ kind: "ceremony", winner_id: OWN, ends_at: NOW + 1 });
    for (const event of [{ ...news(), type: "stack.changed" }, food, ceremony, changed(null)]) {
      expect(newsCue(event, VIEWER)).toBeNull();
    }
  });

  it("stays quiet about a show that is already over", () => {
    expect(newsCue(news({ ends_at: NOW }), VIEWER)).toBeNull();
    expect(newsCue(news({ ends_at: "bald" }), VIEWER)).toBeNull();
  });
});

describe("a newer or older server", () => {
  it("leaves the jelly unnamed when parts are missing or malformed", () => {
    const odd = [
      { news: "x" },
      { news: null },
      { news: undefined },
      { news: { top_xp: { player_id: String(OWN), xp: 1 } } },
      { news: { achievements: [null, 5, { player_id: String(OWN) }] } },
      { news: { tallest_stack: String(OWN), achievements: { player_id: OWN } } },
    ];
    for (const patch of odd) expect(newsCue(news(patch), VIEWER)?.role).toBe("watching");
  });

  it("knows no presenter without one or with a missing field", () => {
    expect(newsCue(news({ presenter_id: null }), VIEWER)?.role).toBe("watching");
    expect(newsCue(changed({ kind: "news", ends_at: NOW + 1 }), VIEWER)?.role).toBe("watching");
  });
});

describe("the news of the browser preview", () => {
  const role = (hash: string) => {
    const event = previewNewsEvent(hash, OWN, NOW);
    return event && newsCue(event, VIEWER)?.role;
  };

  it("shows every role", () => {
    expect(role("#news")).toBe("named");
    expect(role("#news-tower")).toBe("named");
    expect(role("#news-achievement")).toBe("named");
    expect(role("#news-presenter")).toBe("presenter");
    expect(role("#news-watching")).toBe("watching");
  });

  it("starts no news for other hashes", () => {
    expect(previewNewsEvent("#levelup", OWN, NOW)).toBeNull();
    expect(previewNewsEvent("#toString", OWN, NOW)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  idleViewNow,
  isPresent,
  nextPresence,
  NOBODY,
  onlyReveals,
  presenceEndsAt,
  TOUCH_SHOW_MS,
  type IdleNeeds,
} from "./idleView";

/** Nichts ist offen. */
const NOTHING: IdleNeeds = {
  panel: false,
  joining: false,
  hatching: false,
  invite: false,
  update: false,
  error: false,
};

describe("idleViewNow", () => {
  it("blendet ohne Zeiger nach der Einstellung aus", () => {
    expect(idleViewNow("bubble", false, NOTHING)).toBe("bubble");
    expect(idleViewNow("none", false, NOTHING)).toBe("none");
  });

  it("zeigt mit Zeiger über dem Fenster alles", () => {
    expect(idleViewNow("none", true, NOTHING)).toBe("all");
  });

  it("zeigt mit „Alles zeigen“ immer alles", () => {
    expect(idleViewNow("all", false, NOTHING)).toBe("all");
  });

  it.each(Object.keys(NOTHING) as (keyof IdleNeeds)[])("bleibt sichtbar bei %s", (need) => {
    expect(idleViewNow("none", false, { ...NOTHING, [need]: true })).toBe("all");
  });
});

describe("nextPresence", () => {
  it("zählt Maus und Stift, solange sie über dem Fenster schweben", () => {
    const over = nextPresence(NOBODY, { kind: "point", inside: true });
    expect(isPresent(over, 0)).toBe(true);
    expect(isPresent(nextPresence(over, { kind: "leave" }), 0)).toBe(false);
    expect(isPresent(nextPresence(over, { kind: "point", inside: false }), 0)).toBe(false);
  });

  it("hält nach dem letzten Finger einige Sekunden lang alles sichtbar", () => {
    const down = nextPresence(NOBODY, { kind: "touch", inside: true });
    expect(isPresent(down, 1e6)).toBe(true);
    expect(presenceEndsAt(down, 1000)).toBeNull();
    const up = nextPresence(down, { kind: "lift", at: 1000 });
    expect(isPresent(up, 1000 + TOUCH_SHOW_MS - 1)).toBe(true);
    expect(isPresent(up, 1000 + TOUCH_SHOW_MS)).toBe(false);
    expect(presenceEndsAt(up, 2000)).toBe(1000 + TOUCH_SHOW_MS);
    expect(presenceEndsAt(up, 1000 + TOUCH_SHOW_MS)).toBeNull();
  });

  it("beginnt die Zeit mit jedem neuen Finger von vorn", () => {
    let presence = nextPresence(NOBODY, { kind: "touch", inside: true });
    presence = nextPresence(presence, { kind: "lift", at: 0 });
    presence = nextPresence(presence, { kind: "touch", inside: true });
    presence = nextPresence(presence, { kind: "lift", at: 4000 });
    expect(isPresent(presence, 4000 + TOUCH_SHOW_MS - 1)).toBe(true);
  });

  it("übersieht Finger außerhalb des Fensters und ein Heben ohne Finger", () => {
    expect(nextPresence(NOBODY, { kind: "touch", inside: false })).toEqual(NOBODY);
    expect(nextPresence(NOBODY, { kind: "lift", at: 0 })).toEqual(NOBODY);
  });

  it("lässt den Zeiger beim Verlust des Fokus draußen, der Finger wirkt nach", () => {
    const over = nextPresence(NOBODY, { kind: "point", inside: true });
    expect(isPresent(nextPresence(over, { kind: "blur", at: 0 }), 0)).toBe(false);
    const down = nextPresence(NOBODY, { kind: "touch", inside: true });
    expect(isPresent(nextPresence(down, { kind: "blur", at: 0 }), 100)).toBe(true);
  });
});

describe("onlyReveals", () => {
  it("lässt den ersten Tipp auf einen ausgeblendeten Knopf nur einblenden", () => {
    expect(onlyReveals("touch", true, false)).toBe(true);
    expect(onlyReveals("pen", true, false)).toBe(true);
  });

  it("lässt das Jelly, sichtbare Knöpfe und die Maus in Ruhe", () => {
    expect(onlyReveals("touch", true, true)).toBe(false);
    expect(onlyReveals("touch", false, false)).toBe(false);
    expect(onlyReveals("mouse", true, false)).toBe(false);
  });
});

import type { CongaPlayer } from "@jelly/stage/conga";

import { describe, expect, it } from "vitest";

import { chooseFollow, countConga, describeFollow, type CongaScene } from "./conga";

const OWN = 1;
const NOW = 50_000;

/** Ein Jelly, das `targetId` folgt, bis `ends_at`. */
function following(id: number, targetId: number, ends_at = NOW + 1000): CongaPlayer {
  return { id, follow: { player_id: targetId, ends_at } };
}

/** Der Stand mit dem eigenen Jelly, das niemandem folgt, und `others`. */
function scene(...others: CongaPlayer[]): CongaScene {
  return { players: [{ id: OWN, follow: null }, ...others], ownId: OWN, serverTime: NOW };
}

const ALONE: CongaPlayer = { id: 2, follow: null };
const HEAD: CongaPlayer = { id: 3, follow: null };

describe("chooseFollow", () => {
  it("offers a plain follow at a jelly that stands alone", () => {
    expect(chooseFollow(scene(ALONE), 2, false)).toEqual({ label: "Dazustellen", isConga: false });
  });

  it("names the Polonaise at a jelly that already has a follower", () => {
    const choice = chooseFollow(scene(HEAD, following(4, 3)), 3, false);
    expect(choice).toEqual({ label: "Polonaise mitmachen", isConga: true });
  });

  it("names the Polonaise at a jelly that follows someone", () => {
    expect(chooseFollow(scene(HEAD, following(4, 3)), 4, false).label).toBe("Polonaise mitmachen");
  });

  it("offers to leave the Polonaise the own jelly is in", () => {
    const inLine: CongaScene = {
      players: [following(OWN, 3), HEAD, following(4, 3)],
      ownId: OWN,
      serverTime: NOW,
    };
    expect(chooseFollow(inLine, 3, true)).toEqual({ label: "Polonaise verlassen", isConga: true });
    expect(chooseFollow(scene(ALONE), 2, true).label).toBe("Weggehen");
  });

  it("does not count a follow that has run out", () => {
    const stale = scene(HEAD, following(4, 3, NOW));
    expect(chooseFollow(stale, 3, false).label).toBe("Dazustellen");
  });
});

describe("countConga", () => {
  it("counts everybody in the line the own jelly joins", () => {
    expect(countConga(scene(HEAD, following(4, 3), following(5, 4)), 5)).toBe(4);
    expect(countConga(scene(ALONE), 2)).toBe(0);
  });

  it("leaves nothing to leave for the head of a line", () => {
    const led = scene(following(4, OWN), following(5, OWN));
    expect(countConga(led, null)).toBe(0);
    // Dem eigenen Folgenden zu folgen wäre ein Kreis, den der Server ablehnt.
    expect(chooseFollow(led, 4, false).label).toBe("Dazustellen");
  });

  it("brings its own followers along", () => {
    expect(countConga(scene(ALONE, following(4, OWN)), 2)).toBe(3);
  });

  it("knows no line before the own jelly is known", () => {
    const unknown = { ...scene(HEAD, following(4, 3)), ownId: null };
    expect(countConga(unknown, 3)).toBe(0);
  });
});

describe("describeFollow", () => {
  it("confirms a plain follow by name", () => {
    expect(describeFollow(0, "Mo")).toBe("Dein Jelly stellt sich zu Mo.");
  });

  it("celebrates the Polonaise with its size in words", () => {
    expect(describeFollow(3, "Mo")).toBe("Polonaise! Ihr seid zu dritt.");
    expect(describeFollow(4, "Mo")).toBe("Polonaise! Ihr seid zu viert.");
    expect(describeFollow(12, "Mo")).toBe("Polonaise! Ihr seid zu zwölft.");
    expect(describeFollow(13, "Mo")).toBe("Polonaise! Ihr seid 13 Jellies.");
  });
});

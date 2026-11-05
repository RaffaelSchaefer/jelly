import { describe, expect, it } from "vitest";

import {
  awayMessage,
  findPlayersByName,
  followMessage,
  partnerLook,
  PET_COLORS,
  stagePlayerHex,
  type StagePlayer,
} from ".";

/** Ein Jelly mit Mütze auf der Bühne. */
const GLIBBER: StagePlayer = {
  id: 1,
  name: "Glibber",
  color: "lilac",
  equipped: { head: { key: "beanie", color: "#ffffff" } },
  level: 2,
  sign: null,
  follow: null,
  area_id: null,
  is_visitor: true,
  home_x: 0,
  home_y: 0,
};

describe("searching a jelly by name", () => {
  const players = [
    { id: 1, name: "Zora" },
    { id: 2, name: "Änne" },
    { id: 3, name: "Max" },
    { id: 4, name: "Mara" },
  ];
  const namesFor = (query: string, ownId: number | null = null) =>
    findPlayersByName(players, query, ownId).map((player) => player.name);

  it("sorts by name and finds everyone for an empty text", () => {
    expect(namesFor("")).toEqual(["Änne", "Mara", "Max", "Zora"]);
    expect(namesFor("   ")).toEqual(["Änne", "Mara", "Max", "Zora"]);
  });
  it("puts numbers in a name in their natural order", () => {
    const numbered = [
      { id: 1, name: "Jelly 10" },
      { id: 2, name: "Jelly 2" },
    ];
    const names = findPlayersByName(numbered, "", null).map((player) => player.name);
    expect(names).toEqual(["Jelly 2", "Jelly 10"]);
  });
  it("ignores case and spaces around the text, also with umlauts", () => {
    expect(namesFor(" MA ")).toEqual(["Mara", "Max"]);
    expect(namesFor("ÄN")).toEqual(["Änne"]);
  });
  it("leaves out the own jelly and finds nobody for an unknown name", () => {
    expect(namesFor("ma", 3)).toEqual(["Mara"]);
    expect(namesFor("glibber")).toEqual([]);
  });
});

describe("stage players", () => {
  it("finds the colour of a jelly and falls back for those of a newer server", () => {
    expect(stagePlayerHex("mint")).toBe(PET_COLORS.mint.hex);
    expect(stagePlayerHex("future")).toBeUndefined();
    expect(stagePlayerHex("constructor")).toBeUndefined();
  });
  it("finds the look of a partner and falls back for an unknown colour", () => {
    const beanie = { head: { key: "beanie", color: "#ffffff" } };
    expect(partnerLook([GLIBBER], 1)).toEqual({ color: "lilac", equipped: beanie });
    expect(partnerLook([GLIBBER], 99)).toBeNull();
    const future = [{ ...GLIBBER, id: 7, color: "future", equipped: {} }];
    expect(partnerLook(future, 7)).toEqual({ color: "mint", equipped: {} });
  });
  it("comments on a new target, also when the server ends it", () => {
    expect(followMessage(null, 7)).toBe("Ich stell mich dazu.");
    expect(followMessage(7, 8)).toBe("Ich stell mich dazu.");
    expect(followMessage(7, null)).toBe("Ich geh wieder meiner Wege.");
  });
  it("stays quiet about what is no news", () => {
    expect(followMessage(7, 7)).toBeNull();
    expect(followMessage(null, null)).toBeNull();
    expect(followMessage(undefined, 7)).toBeNull();
    expect(followMessage(7)).toBeNull();
  });
  it("comments on a trip and on coming back", () => {
    const home = { follow: null, tripUntil: null };
    const away = { follow: null, tripUntil: 5 };
    expect(awayMessage(home, away)).toBe("Ich mach einen Ausflug.");
    expect(awayMessage(away, { follow: null, tripUntil: 9 })).toBe("Ich mach einen Ausflug.");
    expect(awayMessage(away, home)).toBe("Ich bin wieder da.");
  });
  it("only names what begins when a trip and a target replace each other", () => {
    const following = { follow: 7, tripUntil: null };
    const away = { follow: null, tripUntil: 5 };
    expect(awayMessage(following, away)).toBe("Ich mach einen Ausflug.");
    expect(awayMessage(away, following)).toBe("Ich stell mich dazu.");
  });
  it("keeps commenting on a target and stays quiet without news", () => {
    const home = { follow: null, tripUntil: null };
    const following = { follow: 7, tripUntil: null };
    expect(awayMessage(home, following)).toBe("Ich stell mich dazu.");
    expect(awayMessage(following, home)).toBe("Ich geh wieder meiner Wege.");
    expect(awayMessage(following, following)).toBeNull();
    expect(awayMessage({}, { follow: null, tripUntil: 5 })).toBeNull();
    expect(awayMessage({ follow: null, tripUntil: 5 }, {})).toBeNull();
  });
});

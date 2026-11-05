import { describe, expect, it } from "vitest";

import { followMessage, partnerLook, PET_COLORS, stagePlayerHex, type StagePlayer } from ".";

/** Ein Jelly mit Mütze auf der Bühne. */
const GLIBBER: StagePlayer = {
  id: 1,
  name: "Glibber",
  color: "lilac",
  equipped: { head: { key: "beanie", color: "#ffffff" } },
  level: 2,
  sign: null,
  follow_player_id: null,
  follow_until: null,
  last_seen_at: 0,
  area_id: null,
  is_visitor: true,
  trip: null,
  home_x: 0,
  home_y: 0,
};

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
});

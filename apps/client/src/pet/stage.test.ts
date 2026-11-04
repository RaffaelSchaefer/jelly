import { describe, expect, it } from "vitest";

import {
  filterStagePlayers,
  PET_COLORS,
  PREVIEW_PLAYERS,
  sortStagePlayers,
  stagePlayerHex,
} from ".";

describe("stage players", () => {
  it("lists the others by name, without the own jelly", () => {
    const player = PREVIEW_PLAYERS[0];
    const own = { ...player, id: 7, name: "Aaa" };
    const umlaut = { ...player, id: 8, name: "Äpfel" };
    const later = { ...player, id: 9, name: "Birne" };
    const sorted = sortStagePlayers([later, own, umlaut], own.id);
    expect(sorted.map((player) => player.name)).toEqual(["Äpfel", "Birne"]);
  });
  it("keeps everyone without an own jelly and leaves the input alone", () => {
    const input = [...PREVIEW_PLAYERS].reverse();
    const before = [...input];
    expect(sortStagePlayers(input)).toHaveLength(input.length);
    expect(input).toEqual(before);
  });
  it("searches names anywhere, ignoring case and surrounding spaces", () => {
    const names = (query: string) =>
      filterStagePlayers(PREVIEW_PLAYERS, query).map((player) => player.name);
    expect(names("GLIB")).toEqual(["Glibber"]);
    expect(names("  bbel ")).toEqual(["Wabbel"]);
    expect(names("bb")).toEqual(["Wabbel", "Glibber"]);
    expect(names("   ")).toHaveLength(PREVIEW_PLAYERS.length);
    expect(names("niemand")).toEqual([]);
    const umlaut = [{ ...PREVIEW_PLAYERS[0], name: "ÄRGER" }];
    expect(filterStagePlayers(umlaut, "ärg")).toHaveLength(1);
  });
  it("finds the colour of a jelly and falls back for those of a newer server", () => {
    expect(stagePlayerHex("mint")).toBe(PET_COLORS.mint.hex);
    expect(stagePlayerHex("future")).toBeUndefined();
    expect(stagePlayerHex("constructor")).toBeUndefined();
  });
});

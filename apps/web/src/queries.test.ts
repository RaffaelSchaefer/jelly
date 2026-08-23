import { describe, expect, test } from "vitest";
import { optimisticMemberships } from "./queries";

describe("optimistische Teilnahme", () => {
  const existing = [{ id: "a", lobby: "lobby-1", discordUserId: "user-1" }];

  test("fügt genau einen temporären Eintrag hinzu", () => {
    const joined = optimisticMemberships(existing, "lobby-1", "user-2", true);
    expect(joined).toHaveLength(2);
    expect(optimisticMemberships(joined, "lobby-1", "user-2", true)).toEqual(joined);
  });

  test("entfernt nur die eigene Teilnahme und lässt den Snapshot unberührt", () => {
    const left = optimisticMemberships(existing, "lobby-1", "user-1", false);
    expect(left).toEqual([]);
    expect(existing).toHaveLength(1);
  });
});

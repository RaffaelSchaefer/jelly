import { describe, expect, test } from "vitest";
import { eventFormSchema, lobbyFormSchema } from "./validation";

const event = {
  title: "Community Abend",
  description: "Zusammen spielen",
  type: "game" as const,
  startsAt: "2026-09-10T19:00",
  endsAt: "2026-09-10T21:00",
  location: "Discord",
  game: "Counter-Strike 2",
  gameUrl: "https://store.steampowered.com/app/730/",
  playersWanted: 5,
};

describe("Formularvalidierung", () => {
  test("akzeptiert ein vollständiges Game-Event", () => {
    expect(eventFormSchema.safeParse(event).success).toBe(true);
  });

  test("weist fehlendes Spiel und ein Ende vor dem Start zurück", () => {
    const result = eventFormSchema.safeParse({ ...event, game: "", endsAt: "2026-09-10T18:00" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["game", "endsAt"]),
      );
  });

  test("validiert Lobby-Plätze und HTTPS-Links", () => {
    expect(
      lobbyFormSchema.safeParse({
        game: "Portal 2",
        gameUrl: "http://example.com",
        playersWanted: 0,
        startsAt: "",
        location: "",
      }).success,
    ).toBe(false);
    expect(
      lobbyFormSchema.safeParse({
        game: "Portal 2",
        gameUrl: "https://example.com",
        playersWanted: 2,
        startsAt: "",
        location: "",
      }).success,
    ).toBe(true);
  });
});

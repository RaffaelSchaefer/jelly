import assert from "node:assert/strict";
import test from "node:test";
import {
  isLobbyFull,
  lobbyChoiceLabel,
  lobbyComponents,
  lobbyToEmbed,
  parseLobbyCustomId,
  parseLobbyOptions,
} from "./commands/lobby";
import type { Lobby } from "./lobbies";

const lobby: Lobby = {
  id: "lobby",
  game: "Counter-Strike 2",
  gameUrl: "",
  playersWanted: 5,
  startsAt: "2026-08-23T20:00:00.000Z",
  location: "123456789012345678",
  discordCreatorId: "creator",
  discordMessageId: "",
  discordThreadId: "",
  isClosed: false,
};

test("lobby options require a game and validate all inputs", () => {
  const parsed = parseLobbyOptions({
    spiel: "  Counter-Strike 2 ",
    gameLink: "730",
    mitspieler: 5,
    start: "23.08.2026 20:00",
    ort: "123456789012345678",
  });
  assert.equal(parsed.game, "Counter-Strike 2");
  assert.equal(parsed.gameUrl, "https://store.steampowered.com/app/730/");
  assert.equal(parsed.playersWanted, 5);
  assert.ok(parsed.startsAt instanceof Date);
  assert.equal(parsed.location, "123456789012345678");

  assert.throws(
    () =>
      parseLobbyOptions({ spiel: null, gameLink: null, mitspieler: null, start: null, ort: null }),
    /spiel/,
  );
  assert.throws(
    () =>
      parseLobbyOptions({
        spiel: "G".repeat(101),
        gameLink: null,
        mitspieler: null,
        start: null,
        ort: null,
      }),
    /100/,
  );
  assert.throws(
    () =>
      parseLobbyOptions({
        spiel: "Game",
        gameLink: "steam://x",
        mitspieler: null,
        start: null,
        ort: null,
      }),
    /Game-Link/,
  );
  assert.throws(
    () =>
      parseLobbyOptions({ spiel: "Game", gameLink: null, mitspieler: 100, start: null, ort: null }),
    /1 und 99/,
  );
  assert.throws(
    () =>
      parseLobbyOptions({
        spiel: "Game",
        gameLink: null,
        mitspieler: null,
        start: "morgen",
        ort: null,
      }),
    /morgen/,
  );

  const now = parseLobbyOptions({
    spiel: "Game",
    gameLink: null,
    mitspieler: null,
    start: "",
    ort: null,
  });
  assert.equal(now.startsAt, null);
});

test("lobby labels distinguish scheduled and immediate lobbies", () => {
  assert.match(lobbyChoiceLabel(lobby), /\(\d{2}\.\d{2}\. · \d{2}:\d{2} Uhr\)$/);
  assert.match(lobbyChoiceLabel({ ...lobby, startsAt: "" }), /\(jetzt\)$/);
  const label = lobbyChoiceLabel({ ...lobby, game: "G".repeat(120) });
  assert.equal(label.length, 100);
  assert.ok(label.endsWith("..."));
});

test("lobby embeds show participant target and full state", () => {
  const open = lobbyToEmbed(lobby, 3).toJSON();
  assert.match(open.title ?? "", /🎮 Counter-Strike 2/);
  assert.equal(open.fields?.find((field) => field.name === "Mitspieler")?.value, "3 / 5");
  assert.equal(
    open.fields?.find((field) => field.name === "Status"),
    undefined,
  );
  assert.equal(open.fields?.find((field) => field.name === "Ort")?.value, "<#123456789012345678>");

  const full = lobbyToEmbed(lobby, 5).toJSON();
  assert.match(full.fields?.find((field) => field.name === "Status")?.value ?? "", /Voll/);

  const immediate = lobbyToEmbed({ ...lobby, startsAt: "", playersWanted: 0 }, 1).toJSON();
  assert.equal(
    immediate.fields?.find((field) => field.name === "Start"),
    undefined,
  );
  assert.equal(immediate.fields?.find((field) => field.name === "Mitspieler")?.value, "1");
});

test("lobby buttons disable joining only when the lobby is closed or full", () => {
  const components = lobbyComponents(lobby, 3)[0]?.toJSON().components ?? [];
  assert.deepEqual(
    components.map((button) => (button as { custom_id?: string }).custom_id),
    ["lobby:join:lobby", "lobby:leave:lobby"],
  );
  assert.equal((components[0] as { disabled?: boolean }).disabled, false);
  assert.equal(
    (lobbyComponents(lobby, 5)[0]?.toJSON().components[0] as { disabled?: boolean }).disabled,
    true,
  );
  assert.deepEqual(lobbyComponents({ ...lobby, isClosed: true }, 0), []);

  assert.equal(isLobbyFull(lobby, 4), false);
  assert.equal(isLobbyFull(lobby, 5), true);
  assert.equal(isLobbyFull({ playersWanted: 0 }, 10), false);
});

test("lobby custom ids route join and leave actions", () => {
  assert.deepEqual(parseLobbyCustomId("lobby:join:abc123"), { action: "join", lobbyId: "abc123" });
  assert.deepEqual(parseLobbyCustomId("lobby:leave:abc123"), {
    action: "leave",
    lobbyId: "abc123",
  });
  assert.equal(parseLobbyCustomId("event:join:abc123"), null);
  assert.equal(parseLobbyCustomId("lobby:start:abc123"), null);
  assert.equal(parseLobbyCustomId("lobby:join"), null);
});

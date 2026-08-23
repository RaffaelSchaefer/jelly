import assert from "node:assert/strict";
import test from "node:test";
import {
  isMarkerOnlyChange,
  markHandled,
  shouldPostLobby,
  unmarkHandled,
  wasRecentlyHandled,
} from "./lobby-sync";

test("shouldPostLobby gilt nur für offene, unverlinkte Web-Lobbys", () => {
  assert.equal(
    shouldPostLobby({ createdBy: "user1", discordMessageId: "", isClosed: false }),
    true,
  );
  assert.equal(shouldPostLobby({ createdBy: "", discordMessageId: "", isClosed: false }), false);
  assert.equal(
    shouldPostLobby({ createdBy: "user1", discordMessageId: "m1", isClosed: false }),
    false,
  );
  assert.equal(
    shouldPostLobby({ createdBy: "user1", discordMessageId: "", isClosed: true }),
    false,
  );
});

test("isMarkerOnlyChange erkennt reine Marker-Updates des Bots", () => {
  const before = { discordMessageId: "", discordThreadId: "", isClosed: false };
  const after = { discordMessageId: "m1", discordThreadId: "t1", isClosed: false };
  assert.equal(isMarkerOnlyChange(before, after), true);
  assert.equal(isMarkerOnlyChange(after, after), false);
  assert.equal(isMarkerOnlyChange(after, { ...after, isClosed: true }), false);
});

test("recent-Map verfällt nach TTL", () => {
  const now = Date.now();
  markHandled("create:lobby1:user1", now);
  assert.equal(wasRecentlyHandled("create:lobby1:user1", now + 1_000), true);
  assert.equal(wasRecentlyHandled("create:lobby1:user1", now + 20_000), false);
  assert.equal(wasRecentlyHandled("create:lobby1:user2", now + 1_000), false);
});

test("fehlgeschlagene eigene Writes geben den Marker wieder frei", () => {
  markHandled("create:lobby2:user1");
  unmarkHandled("create:lobby2:user1");
  assert.equal(wasRecentlyHandled("create:lobby2:user1"), false);
});

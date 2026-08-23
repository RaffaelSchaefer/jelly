import assert from "node:assert/strict"
import test from "node:test"
import { normalizeQuery, pickBestSteamMatch } from "../pb_hooks/games-utils.js"

test("normalizeQuery trimmt und begrenzt die Eingabe", () => {
  assert.equal(normalizeQuery("  Counter-Strike 2  "), "Counter-Strike 2")
  assert.equal(normalizeQuery(null), "")
  assert.equal(normalizeQuery("x".repeat(250)).length, 100)
})

test("pickBestSteamMatch bevorzugt exakte Treffer", () => {
  const items = [
    { id: 1, name: "Counter-Strike 2" },
    { id: 2, name: "Counter-Strike: Global Offensive" },
  ]
  assert.equal(pickBestSteamMatch(items, "counter-strike 2")?.id, 1)
})

test("pickBestSteamMatch erlaubt Präfix- und Teiltreffer", () => {
  const items = [
    { id: 10, name: "VALORANT" },
    { id: 11, name: "Rocket League" },
  ]
  assert.equal(pickBestSteamMatch(items, "rocket")?.id, 11)
  assert.equal(pickBestSteamMatch(items, "valorant")?.id, 10)
})

test("pickBestSteamMatch liefert null bei irrelevanter Liste", () => {
  const items = [{ id: 1, name: "Dota 2" }, { id: 2, name: "Terraria" }]
  assert.equal(pickBestSteamMatch(items, "fifa"), null)
  assert.equal(pickBestSteamMatch(undefined, "fifa"), null)
})

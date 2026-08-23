# Plan A: Backend & Discord-Sync Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PocketBase schema/rules/hooks for the web interface (games Steam cache, public read rules, creator-bound writes, join validation, `users.discordId`) plus bot sync workers so web-created lobbies/events appear in Discord and web joins/leaves/closes propagate.

**Architecture:** PocketBase stays the single source of truth. pb_hooks add a Steam-backed `games` cache with a public search route, best-effort `gameRef` enrichment, creator binding and join validation. The bot gains a lobby sync worker (realtime on `lobbies`/`lobby_participants`) and links web-created events to Discord guild events. Discord remains bot-only-writer.

**Tech Stack:** PocketBase v0.39.11 (JSVM pb_hooks), discord.js v14, TypeScript (tsx), `node --test`.

**Spec:** `docs/superpowers/specs/2026-08-23-web-interface-design.md`

---

## File Structure

```
apps/backend/
  pb_migrations/1787001100_web_interface.js   # games-Collection, Felder, API-Regeln (NEU)
  pb_hooks/games-utils.js                     # reine Funktionen (node-testbar) (NEU)
  pb_hooks/games.pb.js                        # Steam-Suche-Route + gameRef-Anreicherung (NEU)
  pb_hooks/lobbies.pb.js                      # Creator-Binding + Beitritts-Validierung (NEU)
  pb_hooks/events.pb.js                       # + Attendee-Validierung (ÄNDERUNG)
  pb_hooks/events-utils.js                    # Game-Validierung gelockert (ÄNDERUNG)
  pb_hooks/auth.pb.js                         # + discordId-Sync (ÄNDERUNG)
  tests/games-utils.test.mjs                  # Node-Tests für games-utils (NEU)
  package.json                                # + test-Script (ÄNDERUNG)
apps/bot/src/
  lobby-post.ts                               # Discord-Posting-Helper (aus commands/lobby.ts verschoben) (NEU)
  lobby-sync.ts                               # Realtime-Worker Web→Discord für Lobbys (NEU)
  lobby-sync.test.ts                          # Tests für reine Helper (NEU)
  commands/lobby.ts                           # nutzt lobby-post.ts, markHandled (ÄNDERUNG)
  events.ts                                   # + setEventLinks() (ÄNDERUNG)
  realtime.ts                                 # Event-Linking für Web-Events (ÄNDERUNG)
  index.ts                                    # startLobbySync() aufrufen (ÄNDERUNG)
```

**Konventionen:** Deutsche Commit-Messages (Repo-Standard), deutsche Fehlermeldungen, Tests mit `node:test` + `node:assert/strict`, Imports ohne Dateiendung in TS (`./lobby-sync`).

---

### Task 1: Migration — games-Collection, neue Felder, API-Regeln

**Files:**
- Create: `apps/backend/pb_migrations/1787001100_web_interface.js`

- [ ] **Step 1: Migration anlegen**

```js
/// <reference path="../pb_data/types.d.ts" />

// Web-Interface-Grundlage (siehe docs/superpowers/specs/2026-08-23-web-interface-design.md):
// - games: Steam-Metadaten-Cache (öffentlich lesbar, nur Hooks/Superuser schreiben)
// - lobbies/events: gameRef-Relation + öffentliche Lese-Rechte + Creator-Regeln
// - lobby_participants/event_attendees: öffentliche Lesen, Beitreten nur mit
//   eigener discordId (Regel), Löschen nur des eigenen Eintrags
// - users: discordId (wird beim Discord-Login befüllt, siehe auth.pb.js)
migrate(
  (app) => {
    const games = new Collection(
      /** @type {any} */ ({
        type: "base",
        name: "games",
        listRule: "",
        viewRule: "",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: "name", type: "text", required: true, min: 1, max: 150 },
          { name: "steamAppId", type: "text", max: 16 },
          { name: "headerUrl", type: "url" },
          { name: "capsuleUrl", type: "url" },
          { name: "shortDescription", type: "text", max: 400 },
          { name: "lastEnrichedAt", type: "date" },
        ],
        indexes: [
          "CREATE UNIQUE INDEX `idx_games_name` ON `games` (`name`)",
          "CREATE INDEX `idx_games_steamAppId` ON `games` (`steamAppId`)",
        ],
      }),
    )
    app.save(games)

    const users = app.findCollectionByNameOrId("users")
    users.fields.add(new TextField({ name: "discordId", max: 32 }))
    app.save(users)

    const lobbies = app.findCollectionByNameOrId("lobbies")
    lobbies.fields.add(
      new RelationField({ name: "gameRef", collectionId: games.id, maxSelect: 1 }),
    )
    lobbies.fields.add(
      new RelationField({ name: "createdBy", collectionId: users.id, maxSelect: 1 }),
    )
    lobbies.listRule = ""
    lobbies.viewRule = ""
    lobbies.createRule = ""
    lobbies.updateRule = "createdBy = @request.auth.id"
    lobbies.deleteRule = "createdBy = @request.auth.id"
    app.save(lobbies)

    const participants = app.findCollectionByNameOrId("lobby_participants")
    participants.listRule = ""
    participants.viewRule = ""
    participants.createRule =
      "@request.auth.discordId != '' && @request.auth.discordId = discordUserId"
    participants.deleteRule =
      "@request.auth.discordId != '' && @request.auth.discordId = discordUserId"
    app.save(participants)

    const events = app.findCollectionByNameOrId("events")
    events.fields.add(
      new RelationField({ name: "gameRef", collectionId: games.id, maxSelect: 1 }),
    )
    events.listRule = ""
    events.viewRule = ""
    events.createRule = ""
    events.updateRule = "createdBy = @request.auth.id"
    events.deleteRule = "createdBy = @request.auth.id"
    app.save(events)

    const attendees = app.findCollectionByNameOrId("event_attendees")
    attendees.listRule = ""
    attendees.viewRule = ""
    attendees.createRule = "@request.auth.discordId != '' && @request.auth.discordId = discordUserId"
    attendees.deleteRule = "@request.auth.discordId != '' && @request.auth.discordId = discordUserId"
    app.save(attendees)
  },
  (app) => {
    const attendees = app.findCollectionByNameOrId("event_attendees")
    attendees.listRule = null
    attendees.viewRule = null
    attendees.createRule = null
    attendees.deleteRule = null
    app.save(attendees)

    const events = app.findCollectionByNameOrId("events")
    events.fields.removeByName("gameRef")
    events.listRule = null
    events.viewRule = null
    events.createRule = null
    events.updateRule = null
    events.deleteRule = null
    app.save(events)

    const participants = app.findCollectionByNameOrId("lobby_participants")
    participants.listRule = null
    participants.viewRule = null
    participants.createRule = null
    participants.deleteRule = null
    app.save(participants)

    const lobbies = app.findCollectionByNameOrId("lobbies")
    lobbies.fields.removeByName("gameRef")
    lobbies.fields.removeByName("createdBy")
    lobbies.listRule = null
    lobbies.viewRule = null
    lobbies.createRule = null
    lobbies.updateRule = null
    lobbies.deleteRule = null
    app.save(lobbies)

    const users = app.findCollectionByNameOrId("users")
    users.fields.removeByName("discordId")
    app.save(users)

    app.delete(app.findCollectionByNameOrId("games"))
  },
)
```

Hinweis: Leere Regel `""` = öffentlich in PocketBase; `null` = nur Superuser.

- [ ] **Step 2: Migration einspielen und prüfen**

```bash
pnpm --filter @joint/backend exec node scripts/download-pocketbase.mjs
pnpm --filter @joint/backend db:migrate
```

Expected: `Applied 1 migration successfully` (oder bereits angewendet). Bei Fehler: Meldung lesen, Migration fixen, mit `./pocketbase migrate down` zurück und erneut.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/pb_migrations/1787001100_web_interface.js
git commit -m "Füge games-Cache, Web-Felder und öffentliche API-Regeln hinzu"
```

---

### Task 2: games-utils.js (rein) + Node-Tests + Backend-test-Infrastruktur

**Files:**
- Create: `apps/backend/pb_hooks/games-utils.js`
- Create: `apps/backend/tests/games-utils.test.mjs`
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Failing test schreiben**

`apps/backend/tests/games-utils.test.mjs`:

```js
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
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Add to `apps/backend/package.json` scripts first:

```json
"test": "node --test tests/"
```

```bash
pnpm --filter @joint/backend test
```

Expected: FAIL — `Cannot find module '../pb_hooks/games-utils.js'`

- [ ] **Step 3: games-utils.js implementieren (pure, keine PB-APIs!)**

`apps/backend/pb_hooks/games-utils.js`:

```js
// Reine Hilfsfunktionen für die Steam-Spiele-Suche.
// WICHTIG: Keine PocketBase-APIs verwenden — Datei wird auch mit
// `node --test` (apps/backend/tests/) außerhalb der JSVM ausgeführt.

/**
 * Normalisiert eine Suchanfrage: trimmt und begrenzt auf 100 Zeichen.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .slice(0, 100)
}

/**
 * Scoret einen Steam-Storesearch-Treffer gegen die Anfrage.
 * @param {{ id?: unknown, name?: unknown }} item
 * @param {string} query
 * @returns {number}
 */
function scoreSteamItem(item, query) {
  const name = String(item.name || "").toLowerCase()
  const q = query.toLowerCase()
  if (!name || !q) return -1
  if (name === q) return 100
  if (name.startsWith(q)) return 75
  if (name.includes(q)) return 50
  return 10
}

/**
 * Wählt den besten Steam-Treffer (Score >= 50) oder null.
 * @param {unknown} items
 * @param {string} query
 * @returns {{ id?: unknown, name?: unknown, tiny_image?: unknown } | null}
 */
function pickBestSteamMatch(items, query) {
  let best = null
  let bestScore = 0
  for (const item of Array.isArray(items) ? items : []) {
    const score = scoreSteamItem(item, query)
    if (score > bestScore) {
      best = item
      bestScore = score
    }
  }
  return bestScore >= 50 ? best : null
}

module.exports = { normalizeQuery, pickBestSteamMatch }
```

- [ ] **Step 4: Test laufen lassen — muss passen**

```bash
pnpm --filter @joint/backend test
```

Expected: `# pass 4` / `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add apps/backend/pb_hooks/games-utils.js apps/backend/tests/games-utils.test.mjs apps/backend/package.json
git commit -m "Füge Steam-Match-Utilities mit Node-Tests hinzu"
```

---

### Task 3: games.pb.js — Steam-Suche-Route + gameRef-Anreicherung

**Files:**
- Create: `apps/backend/pb_hooks/games.pb.js`

- [ ] **Step 1: Hook-Datei anlegen**

`apps/backend/pb_hooks/games.pb.js`:

```js
/// <reference path="../pb_data/types.d.ts" />

// Steam-Spiele: öffentliche Suchroute für die Web-Combobox + best-effort
// gameRef-Anreicherung für Lobbys/Events, die ohne relation angelegt werden.
// Steam-Ausfälle dürfen Saves NIEMALS blockieren (Spec: nicht-blockierend).

const STEAM_STORESEARCH = "https://store.steampowered.com/api/storesearch"
const STEAM_APPDETAILS = "https://store.steampowered.com/api/appdetails"

/**
 * Lokale Spiele im Cache suchen (LIKE %query%).
 * @param {string} query
 * @param {number} limit
 * @returns {Array<core.Record>}
 */
function findCachedGames(query, limit) {
  return $app.recordQuery("games").andWhere($dbx.like("name", query)).limit(limit).all()
}

/**
 * Spiel exakt nach Name finden (Unique-Index auf name).
 * @param {string} name
 * @returns {core.Record | null}
 */
function findGameByName(name) {
  const records = $app.recordQuery("games").andWhere($dbx.eq("name", name)).limit(1).all()
  return records.length > 0 ? records[0] : null
}

/**
 * Steam-Treffer in den Cache upserten und Record zurückgeben.
 * @param {string} name
 * @param {string} steamAppId
 * @param {string} capsuleUrl
 * @returns {core.Record}
 */
function upsertSteamItem(name, steamAppId, capsuleUrl) {
  const existing = findGameByName(name)
  if (existing) {
    if (steamAppId && !existing.getString("steamAppId")) {
      existing.set("steamAppId", steamAppId)
      if (capsuleUrl) existing.set("capsuleUrl", capsuleUrl)
      $app.save(existing)
    }
    return existing
  }
  const record = new Record($app.findCollectionByNameOrId("games"))
  record.set("name", name)
  if (steamAppId) record.set("steamAppId", steamAppId)
  if (capsuleUrl) record.set("capsuleUrl", capsuleUrl)
  $app.save(record)
  return record
}

/**
 * Header + Kurzbeschreibung für den besten Treffer nachladen (1 Request).
 * @param {core.Record} record
 * @param {string} steamAppId
 */
function enrichWithAppDetails(record, steamAppId) {
  if (!steamAppId || record.getString("headerUrl")) return
  const res = $http.send({
    method: "GET",
    url: `${STEAM_APPDETAILS}?appids=${steamAppId}&l=german`,
    timeout: 3,
  })
  if (res.statusCode !== 200 || !res.json) return
  const payload = res.json[steamAppId]
  if (!payload || !payload.success || !payload.data) return
  record.set("headerUrl", String(payload.data.header_image || ""))
  record.set("shortDescription", String(payload.data.short_description || "").slice(0, 400))
  record.set("lastEnrichedAt", new Date().toISOString())
  $app.save(record)
}

/**
 * @param {core.Record} record
 * @returns {{ id: string, name: string, steamAppId: string, headerUrl: string, capsuleUrl: string }}
 */
function toSuggestion(record) {
  return {
    id: record.id,
    name: record.getString("name"),
    steamAppId: record.getString("steamAppId"),
    headerUrl: record.getString("headerUrl"),
    capsuleUrl: record.getString("capsuleUrl"),
  }
}

// GET /api/joint/games/search?q=...  (öffentlich)
routerAdd("GET", "/api/joint/games/search", (e) => {
  const { normalizeQuery, pickBestSteamMatch } = require(`${__hooks}/games-utils.js`)

  const query = normalizeQuery(e.request.url.query().get("q"))
  if (query.length < 2) return e.json(200, { suggestions: [] })

  const suggestions = []
  const seenNames = new Set()

  // 1) Lokaler Cache zuerst (schnell, funktioniert offline von Steam)
  for (const record of findCachedGames(query, 8)) {
    seenNames.add(record.getString("name").toLowerCase())
    suggestions.push(toSuggestion(record))
  }

  // 2) Steam storesearch (best effort)
  let steamItems = []
  try {
    const res = $http.send({
      method: "GET",
      url: `${STEAM_STORESEARCH}/?term=${encodeURIComponent(query)}&l=german&cc=DE`,
      timeout: 3,
    })
    if (res.statusCode === 200 && res.json && Array.isArray(res.json.items)) {
      steamItems = res.json.items
    }
  } catch (error) {
    console.log("[joint] Steam storesearch nicht erreichbar:", error)
  }

  const best = pickBestSteamMatch(steamItems, query)
  for (const item of steamItems) {
    if (suggestions.length >= 10) break
    const name = String(item.name || "")
    if (!name || seenNames.has(name.toLowerCase())) continue
    seenNames.add(name.toLowerCase())
    const record = upsertSteamItem(name, String(item.id || ""), String(item.tiny_image || ""))
    if (best && String(item.id) === String(best.id)) {
      try {
        enrichWithAppDetails(record, String(item.id))
      } catch (error) {
        console.log("[joint] Steam appdetails fehlgeschlagen:", error)
      }
    }
    suggestions.push(toSuggestion(record))
  }

  return e.json(200, { suggestions })
})

// Best-effort gameRef für Lobbys/Events ohne relation (z. B. vom Bot
// befüllte Freitext-Spiele). Lokaler Cache zuerst; nur bei Cache-Miss ein
// Steam-Request mit kurzem Timeout. Fehler werden geschluckt.
function bestEffortGameRef(e) {
  if (e.record.getString("gameRef")) return
  const game = e.record.getString("game").trim()
  if (!game) return

  const exact = findGameByName(game)
  if (exact) {
    e.record.set("gameRef", exact.id)
    return
  }
  const like = findCachedGames(game, 1)
  if (like.length > 0) {
    e.record.set("gameRef", like[0].id)
    return
  }

  try {
    const { pickBestSteamMatch } = require(`${__hooks}/games-utils.js`)
    const res = $http.send({
      method: "GET",
      url: `${STEAM_STORESEARCH}/?term=${encodeURIComponent(game)}&l=german&cc=DE`,
      timeout: 2,
    })
    const best =
      res.statusCode === 200 && res.json ? pickBestSteamMatch(res.json.items || [], game) : null
    if (best && best.name) {
      const record = upsertSteamItem(
        String(best.name),
        String(best.id || ""),
        String(best.tiny_image || ""),
      )
      e.record.set("gameRef", record.id)
    }
  } catch (error) {
    console.log("[joint] Game-Anreicherung übersprungen:", error)
  }
}

onRecordCreateRequest((e) => {
  bestEffortGameRef(e)
  e.next()
}, "lobbies")

onRecordUpdateRequest((e) => {
  bestEffortGameRef(e)
  e.next()
}, "lobbies")

onRecordCreateRequest((e) => {
  bestEffortGameRef(e)
  e.next()
}, "events")

onRecordUpdateRequest((e) => {
  bestEffortGameRef(e)
  e.next()
}, "events")
```

- [ ] **Step 2: Hook laden prüfen**

```bash
pnpm --filter @joint/backend dev
```

Expected in Logs: `[joint] PocketBase ready` und KEIN Hook-Fehler. Dann in zweitem Terminal:

```bash
curl -s "http://127.0.0.1:8090/api/joint/games/search?q=counter" | head -c 600
```

Expected: JSON `{"suggestions":[...]}` mit Counter-Strike-Treffern (Steam erreichbar vorausgesetzt; bei Steam-Ausfall `{"suggestions":[]}` — auch OK, dann Logs prüfen).

```bash
curl -s "http://127.0.0.1:8090/api/joint/games/search?q=x"
```

Expected: `{"suggestions":[]}`

- [ ] **Step 3: Commit**

```bash
git add apps/backend/pb_hooks/games.pb.js
git commit -m "Füge Steam-Spielsuche-Route und gameRef-Anreicherung hinzu"
```

---

### Task 4: lobbies.pb.js — Creator-Binding + Beitrritts-Validierung

**Files:**
- Create: `apps/backend/pb_hooks/lobbies.pb.js`

- [ ] **Step 1: Hook-Datei anlegen**

`apps/backend/pb_hooks/lobbies.pb.js`:

```js
/// <reference path="../pb_data/types.d.ts" />

// Web-erstellte Lobbys: bindet createdBy + discordCreatorId an den
// angemeldeten Benutzer (discordId kommt aus dem OAuth-Login, siehe
// auth.pb.js). Der Bot erstellt Lobbys als Superuser — Hook greift nicht.

onRecordCreateRequest((e) => {
  if (e.auth && e.auth.collection().name === "users") {
    const discordId = e.auth.getString("discordId")
    if (!discordId) {
      throw new BadRequestError(
        "Dein Konto hat keine verknüpfte Discord-ID. Bitte melde dich erneut mit Discord an.",
      )
    }
    e.record.set("createdBy", e.auth.id)
    e.record.set("discordCreatorId", discordId)
  }
  e.next()
}, "lobbies")

// Beitreten validieren: Lobby muss existieren, offen und nicht voll sein.
// Duplikate verhindert der Unique-Index idx_lobby_participants_lobby_user
// (PocketBase liefert dann einen 400-Validierungsfehler).
onRecordCreateRequest((e) => {
  const lobbyId = e.record.getString("lobby")
  let lobby
  try {
    lobby = $app.findRecordById("lobbies", lobbyId)
  } catch {
    throw new BadRequestError("Diese Lobby existiert nicht mehr.", { reason: "missing" })
  }
  if (lobby.getBool("isClosed")) {
    throw new BadRequestError("Diese Lobby ist bereits geschlossen.", { reason: "closed" })
  }
  const wanted = lobby.getInt("playersWanted")
  if (wanted > 0) {
    const joined = $app.countRecords(
      $app.recordQuery("lobby_participants").andWhere($dbx.eq("lobby", lobbyId)),
    )
    if (joined >= wanted) {
      throw new BadRequestError("Diese Lobby ist leider schon voll.", { reason: "full" })
    }
  }
  e.next()
}, "lobby_participants")
```

- [ ] **Step 2: Hook laden prüfen**

Backend neu starten (`pnpm --filter @joint/backend dev`) — Expected: Start ohne Hook-Fehler. (Verhalten wird in Plan B per E2E gegen die echte App geprüft.)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/pb_hooks/lobbies.pb.js
git commit -m "Füge Lobby-Creator-Binding und Beitrritts-Validierung hinzu"
```

---

### Task 5: auth.pb.js — discordId synchronisieren + events.pb.js Attendee-Validierung + events-utils lockern

**Files:**
- Modify: `apps/backend/pb_hooks/auth.pb.js`
- Modify: `apps/backend/pb_hooks/events.pb.js`
- Modify: `apps/backend/pb_hooks/events-utils.js`

- [ ] **Step 1: auth.pb.js erweitern**

In `onRecordAuthWithOAuth2Request` (unterhalb von `const discordUsername = ...`) ändern auf:

```js
  const profile = /** @type {auth.AuthUser} */ (e.oAuth2User || {})
  const discordUsername = profile.username || profile.name || ""
  const discordId = String(profile.id || "")

  if (e.isNewRecord) {
    e.createData.nickname = discordUsername || "Spieler"
    e.createData.discordUsername = discordUsername
    e.createData.discordId = discordId
  } else if (discordId && e.record.getString("discordId") !== discordId) {
    // Bestehende Konten bekommen die discordId nachträglich (Feld ist neu).
    e.record.set("discordId", discordId)
  }
```

- [ ] **Step 2: events.pb.js um Attendee-Validierung erweitern**

Ans Ende von `apps/backend/pb_hooks/events.pb.js` anhängen:

```js
// An einem Event teilnehmen: Event muss existieren, nicht abgesagt und
// (falls playersWanted gesetzt) nicht voll sein. Duplikate/Rückzug nur
// für die eigene discordId — das regeln die API-Regeln der Collection.
onRecordCreateRequest((e) => {
  const eventId = e.record.getString("event")
  let event
  try {
    event = $app.findRecordById("events", eventId)
  } catch {
    throw new BadRequestError("Dieses Event existiert nicht mehr.", { reason: "missing" })
  }
  if (event.getBool("isCanceled")) {
    throw new BadRequestError("Dieses Event wurde abgesagt.", { reason: "closed" })
  }
  const wanted = event.getInt("playersWanted")
  if (wanted > 0) {
    const joined = $app.countRecords(
      $app.recordQuery("event_attendees").andWhere($dbx.eq("event", eventId)),
    )
    if (joined >= wanted) {
      throw new BadRequestError("Dieses Event ist leider schon voll.", { reason: "full" })
    }
  }
  e.next()
}, "event_attendees")
```

- [ ] **Step 3: events-utils.js gameValidationError lockern**

Web-erstellte Game-Events haben noch keine Discord-IDs — der Bot linkt sie
nachträglich (Task 9). In `gameValidationError` die beiden ID-Pflichtprüfungen
entfernen. Neuer Block ab `if (!game) ...`:

```js
  if (!game) return "'game' ist für Game-Events erforderlich."
  if (gameUrl && !/^https:\/\//i.test(gameUrl)) return "'gameUrl' muss HTTPS verwenden."

  return ""
```

(Die Zeilen mit `discordGuildEventId`- und `discordThreadId`-Regex-Prüfung löschen.)

- [ ] **Step 4: Backend neu starten und prüfen**

```bash
pnpm --filter @joint/backend dev
```

Expected: Start ohne Hook-Fehler.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/pb_hooks/auth.pb.js apps/backend/pb_hooks/events.pb.js apps/backend/pb_hooks/events-utils.js
git commit -m "Synchronisiere discordId und validiere Event-Teilnahmen"
```

---

### Task 6: Bot — Discord-Posting-Helper in lobby-post.ts extrahieren

**Files:**
- Create: `apps/bot/src/lobby-post.ts`
- Modify: `apps/bot/src/commands/lobby.ts`

- [ ] **Step 1: lobby-post.ts anlegen (Code 1:1 aus commands/lobby.ts verschieben)**

`apps/bot/src/lobby-post.ts`:

```ts
import {
  ChannelType,
  PermissionsBitField,
  ThreadAutoArchiveDuration,
  type AnyThreadChannel,
  type Client,
  type GuildTextBasedChannel,
  type Message,
  type PublicThreadChannel,
} from "discord.js";
import { lobbyComponents, lobbyToEmbed } from "./commands/lobby";
import { isChannelId } from "./embeds";
import { env } from "./env";
import { listLobbyParticipantUserIds, type Lobby } from "./lobbies";

const LOBBY_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.CreatePublicThreads,
  PermissionsBitField.Flags.SendMessagesInThreads,
  PermissionsBitField.Flags.ManageThreads,
];

export interface LobbyPostResources {
  message: Message<true>;
  thread: PublicThreadChannel<false>;
}

export async function resolveLobbyChannel(client: Client): Promise<GuildTextBasedChannel> {
  if (!env.guildId) throw new Error("Für Lobbys muss DISCORD_GUILD_ID gesetzt sein.");
  if (!env.lobbyChannelId) throw new Error("Für Lobbys muss LOBBY_CHANNEL_ID gesetzt sein.");

  const channel = await client.channels.fetch(env.lobbyChannelId);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new Error("Der Lobby-Channel muss ein threadfähiger Server-Textkanal sein.");
  }
  if (channel.guildId !== env.guildId) {
    throw new Error("Lobby-Channel und DISCORD_GUILD_ID müssen zum selben Server gehören.");
  }

  const me = channel.guild.members.me ?? client.user;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!permissions || !LOBBY_PERMISSIONS.every((permission) => permissions.has(permission))) {
    throw new Error(
      "Im Lobby-Channel fehlen Rechte zum Senden, Einbetten oder Verwalten öffentlicher Threads.",
    );
  }

  return channel;
}

export async function createLobbyPost(
  channel: GuildTextBasedChannel,
  lobby: Lobby,
): Promise<LobbyPostResources> {
  const resources: Partial<LobbyPostResources> = {};
  try {
    resources.message = await channel.send({
      embeds: [lobbyToEmbed(lobby, 0)],
      components: lobbyComponents(lobby, 0),
    });
    resources.thread = await resources.message.startThread({
      name: clamp(`🎮 ${lobby.game}`, 100),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: "Neue Lobby",
    });
    await resources.thread.members.add(lobby.discordCreatorId);
    await resources.thread.send({
      content:
        `Organisiert euch hier für **${lobby.game}** – ` +
        "Teilnehmen geht über die Buttons direkt am Lobby-Post.",
    });
    return resources as LobbyPostResources;
  } catch (error) {
    try {
      await resources.thread?.delete("Lobby-Erstellung zurückgerollt");
    } catch (cleanupError) {
      console.error("[joint-bot] Verwaister Lobby-Thread:", cleanupError);
    }
    try {
      await resources.message?.delete();
    } catch (cleanupError) {
      console.error("[joint-bot] Verwaister Lobby-Post:", cleanupError);
    }
    throw error;
  }
}

export async function fetchLobbyThread(client: Client, lobby: Lobby): Promise<AnyThreadChannel | null> {
  if (!lobby.discordThreadId) return null;
  const channel = await client.channels.fetch(lobby.discordThreadId).catch(() => null);
  return channel?.isThread() ? channel : null;
}

export async function fetchLobbyMessage(client: Client, lobby: Lobby): Promise<Message | null> {
  if (!env.lobbyChannelId || !lobby.discordMessageId) return null;
  const channel = await client.channels.fetch(env.lobbyChannelId).catch(() => null);
  if (!channel || !("messages" in channel)) return null;
  return channel.messages.fetch(lobby.discordMessageId).catch(() => null);
}

export async function syncLobbyThreadMember(
  client: Client,
  lobby: Lobby,
  discordUserId: string,
  joined: boolean,
): Promise<void> {
  const thread = await fetchLobbyThread(client, lobby);
  if (!thread) return;
  if (thread.archived) await thread.setArchived(false, "Lobby-Teilnehmer aktualisiert");

  if (joined || discordUserId === lobby.discordCreatorId) {
    await thread.members.add(discordUserId);
  } else {
    await thread.members.remove(discordUserId);
  }
}

export async function closeLobbyThread(client: Client, lobby: Lobby): Promise<void> {
  try {
    const thread = await fetchLobbyThread(client, lobby);
    if (!thread || (thread.archived && thread.locked)) return;
    if (thread.archived) await thread.setArchived(false, "Lobby geschlossen");
    if (!thread.locked) await thread.setLocked(true, "Lobby geschlossen");
    await thread.setArchived(true, "Lobby geschlossen");
  } catch (error) {
    console.warn(`[joint-bot] Lobby-Thread konnte nicht geschlossen werden: ${lobby.game}`, error);
  }
}

export async function refreshLobbyPost(client: Client, lobby: Lobby): Promise<void> {
  const [message, participants] = await Promise.all([
    fetchLobbyMessage(client, lobby),
    listLobbyParticipantUserIds(lobby.id),
  ]);
  await message?.edit({
    embeds: [lobbyToEmbed(lobby, participants.length)],
    components: lobbyComponents(lobby, participants.length),
  });
}

export function lobbyMessageUrl(guildId: string | null | undefined, lobby: Lobby): string | null {
  if (!guildId || !env.lobbyChannelId || !lobby.discordMessageId) return null;
  return `https://discord.com/channels/${guildId}/${env.lobbyChannelId}/${lobby.discordMessageId}`;
}
```

**Wichtig:** `lobbyToEmbed`, `lobbyComponents` und `clamp` bleiben in `commands/lobby.ts` und werden dort mit `export` versehen; `lobby-post.ts` importiert sie (Importblock oben bereits enthalten). Der zirkuläre Import `commands/lobby ↔ lobby-post` ist in ESM unproblematisch, da nur Funktionen zur Laufzeit verwendet werden.

- [ ] **Step 2: commands/lobby.ts bereinigen**

In `apps/bot/src/commands/lobby.ts`:
1. Die jetzt verschobenen Funktionen/Interfaces **löschen**: `LOBBY_PERMISSIONS`, `resolveLobbyChannel`, `LobbyPostResources`, `createLobbyPost`, `fetchLobbyThread`, `fetchLobbyMessage`, `syncLobbyThreadMember`, `closeLobbyThread`, `refreshLobbyPost`, `lobbyMessageUrl`.
2. `clamp`, `lobbyToEmbed` und `lobbyComponents` mit `export` versehen.
3. Imports anpassen — neu:

```ts
import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from "discord.js";
import { parseDateInput } from "../dates";
import { isChannelId } from "../embeds";
import { env } from "../env";
import { normalizeGameDestination } from "../events";
import {
  closeLobbyThread,
  createLobbyPost,
  fetchLobbyMessage,
  refreshLobbyPost,
  syncLobbyThreadMember,
} from "../lobby-post";
import {
  addLobbyParticipant,
  closeLobby,
  createLobby,
  deleteLobby,
  findOpenLobbiesByGame,
  getLobby,
  getLobbyParticipantCounts,
  listLobbyParticipantUserIds,
  removeLobbyParticipant,
  setLobbyPost,
  type Lobby,
} from "../lobbies";
import { confirmAction } from "./confirm";
import type { Command } from "./types";
```

(`ChannelType`, `PermissionsBitField`, `ThreadAutoArchiveDuration`, `Client`, `Message`, `AnyThreadChannel`, `PublicThreadChannel` und `env` aus den Imports entfernen — werden nur noch in lobby-post.ts gebraucht. `isChannelId` bleibt (wird in `lobbyToEmbed` genutzt).)

- [ ] **Step 3: Tests + Typecheck — müssen passen (reiner Refactor)**

```bash
pnpm --filter @joint/bot test && pnpm --filter @joint/bot check-types
```

Expected: alle Tests pass, Typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add apps/bot/src/lobby-post.ts apps/bot/src/commands/lobby.ts
git commit -m "Verschiebe Lobby-Posting-Helper in eigenes Modul"
```

---

### Task 7: Bot — setEventLinks() in events.ts

**Files:**
- Modify: `apps/bot/src/events.ts`

- [ ] **Step 1: Funktion nach `cancelEvent` einfügen**

```ts
export async function setEventLinks(
  id: string,
  links: { discordGuildEventId?: string; discordThreadId?: string },
): Promise<void> {
  await ensureSuperuser();
  await pb.collection("events").update(id, {
    ...(links.discordGuildEventId ? { discordGuildEventId: links.discordGuildEventId } : {}),
    ...(links.discordThreadId ? { discordThreadId: links.discordThreadId } : {}),
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @joint/bot check-types
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/bot/src/events.ts
git commit -m "Ergänze setEventLinks zum Nachverlinken von Events"
```

---

### Task 8: Bot — lobby-sync.ts mit Tests (reine Helper zuerst)

**Files:**
- Create: `apps/bot/src/lobby-sync.ts`
- Modify: `apps/bot/src/lobbies.ts`
- Test: `apps/bot/src/lobby-sync.test.ts`

- [ ] **Step 1: Failing tests schreiben**

`apps/bot/src/lobby-sync.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  isMarkerOnlyChange,
  markHandled,
  shouldPostLobby,
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
  assert.equal(shouldPostLobby({ createdBy: "user1", discordMessageId: "", isClosed: true }), false);
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
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

```bash
pnpm --filter @joint/bot test
```

Expected: FAIL (`Cannot find module './lobby-sync'`)

- [ ] **Step 3: lobbies.ts um createdBy erweitern**

In `apps/bot/src/lobbies.ts` das `Lobby`-Interface ergänzen:

```ts
export interface Lobby {
  id: string;
  game: string;
  gameUrl: string;
  playersWanted: number;
  startsAt: string;
  location: string;
  discordCreatorId: string;
  discordMessageId: string;
  discordThreadId: string;
  isClosed: boolean;
  createdBy: string;
}
```

Und in `toLobby` das Mapping ergänzen (vor der schließenden Klammer):

```ts
    isClosed: Boolean(record.isClosed),
    createdBy: String(record.createdBy ?? ""),
```

- [ ] **Step 4: lobby-sync.ts implementieren**

`apps/bot/src/lobby-sync.ts`:

```ts
import type { Client } from "discord.js";
import { env } from "./env";
import { getLobby, listOpenLobbies, setLobbyPost, toLobby, type Lobby } from "./lobbies";
import {
  closeLobbyThread,
  createLobbyPost,
  fetchLobbyMessage,
  fetchLobbyThread,
  refreshLobbyPost,
  resolveLobbyChannel,
  syncLobbyThreadMember,
} from "./lobby-post";
import { ensureSuperuser, pb } from "./pocketbase";

// --- Reine Helper (getestet) ---

export interface LobbyMarkers {
  discordMessageId: string;
  discordThreadId: string;
  isClosed: boolean;
}

/** Nur Web-Lobbys (createdBy gesetzt) ohne Discord-Post und offen werden gepostet. */
export function shouldPostLobby(
  lobby: Pick<Lobby, "createdBy" | "discordMessageId" | "isClosed">,
): boolean {
  return lobby.createdBy !== "" && lobby.discordMessageId === "" && !lobby.isClosed;
}

/** True, wenn ein Update nur die vom Bot zurückgeschriebenen Marker ändert. */
export function isMarkerOnlyChange(before: LobbyMarkers, after: LobbyMarkers): boolean {
  return (
    before.isClosed === after.isClosed &&
    (before.discordMessageId !== after.discordMessageId ||
      before.discordThreadId !== after.discordThreadId)
  );
}

const RECENT_TTL_MS = 15_000;
const recent = new Map<string, number>();

/** Debounce-Guard gegen Doppel-Syncs eigener Button-Flow-Schreibvorgänge. */
export function wasRecentlyHandled(key: string, now = Date.now()): boolean {
  const at = recent.get(key);
  if (at === undefined) return false;
  if (now - at > RECENT_TTL_MS) {
    recent.delete(key);
    return false;
  }
  return true;
}

export function markHandled(key: string, now = Date.now()): void {
  for (const [existing, at] of recent) {
    if (now - at > RECENT_TTL_MS) recent.delete(existing);
  }
  recent.set(key, now);
}

// --- Realtime-Worker ---

const lobbyMarkers = new Map<string, LobbyMarkers>();

function toMarkers(lobby: Lobby): LobbyMarkers {
  return {
    discordMessageId: lobby.discordMessageId,
    discordThreadId: lobby.discordThreadId,
    isClosed: lobby.isClosed,
  };
}

async function postWebLobby(client: Client, lobby: Lobby): Promise<void> {
  const channel = await resolveLobbyChannel(client);
  const post = await createLobbyPost(channel, lobby);
  await setLobbyPost(lobby.id, {
    discordMessageId: post.message.id,
    discordThreadId: post.thread.id,
  });
  console.log(`[joint-bot] Web-Lobby gepostet: ${lobby.game}`);
}

async function reconcileUnpostedLobbies(client: Client): Promise<void> {
  const lobbies = await listOpenLobbies(100);
  for (const lobby of lobbies) {
    lobbyMarkers.set(lobby.id, toMarkers(lobby));
    if (shouldPostLobby(lobby)) {
      try {
        await postWebLobby(client, lobby);
      } catch (error) {
        console.warn(`[joint-bot] Web-Lobby konnte nicht gepostet werden: ${lobby.game}`, error);
      }
    }
  }
}

async function handleLobbyChange(client: Client, lobby: Lobby): Promise<void> {
  const before = lobbyMarkers.get(lobby.id);
  const after = toMarkers(lobby);
  lobbyMarkers.set(lobby.id, after);

  if (before && isMarkerOnlyChange(before, after)) return;

  if (!before && shouldPostLobby(lobby)) {
    await postWebLobby(client, lobby);
    return;
  }

  if (!lobby.discordMessageId) return;

  if (lobby.isClosed && before && !before.isClosed) {
    await closeLobbyThread(client, lobby);
  }
  await refreshLobbyPost(client, lobby);
}

async function handleParticipantChange(
  client: Client,
  lobbyId: string,
  discordUserId: string,
  joined: boolean,
): Promise<void> {
  const lobby = await getLobby(lobbyId);
  if (!lobby || !lobby.discordMessageId || lobby.isClosed) return;
  await syncLobbyThreadMember(client, lobby, discordUserId, joined);
  await refreshLobbyPost(client, lobby);
}

async function subscribeLobbies(client: Client): Promise<void> {
  await pb.collection("lobbies").subscribe("*", (data) => {
    void (async () => {
      try {
        if (data.action === "delete") {
          lobbyMarkers.delete(data.record.id);
          const lobby = toLobby(data.record);
          const [message, thread] = await Promise.all([
            fetchLobbyMessage(client, lobby),
            fetchLobbyThread(client, lobby),
          ]);
          await thread?.delete("Lobby gelöscht").catch(() => {});
          await message?.delete().catch(() => {});
          return;
        }
        if (data.action !== "create" && data.action !== "update") return;
        await handleLobbyChange(client, toLobby(data.record));
      } catch (error) {
        console.error("[joint-bot] Lobby-Sync fehlgeschlagen:", error);
      }
    })();
  });
}

async function subscribeLobbyParticipants(client: Client): Promise<void> {
  await pb.collection("lobby_participants").subscribe("*", (data) => {
    if (data.action !== "create" && data.action !== "delete") return;
    const lobbyId = String(data.record.lobby ?? "");
    const discordUserId = String(data.record.discordUserId ?? "");
    if (!lobbyId || !discordUserId) return;
    const key = `${data.action}:${lobbyId}:${discordUserId}`;
    if (wasRecentlyHandled(key)) return;
    markHandled(key);
    void handleParticipantChange(client, lobbyId, discordUserId, data.action === "create").catch(
      (error) => {
        console.error("[joint-bot] Lobby-Teilnehmer-Sync fehlgeschlagen:", error);
      },
    );
  });
}

export async function startLobbySync(client: Client): Promise<void> {
  if (!env.lobbyChannelId) {
    console.log("[joint-bot] Kein LOBBY_CHANNEL_ID gesetzt – Web-Lobby-Sync deaktiviert");
    return;
  }
  await ensureSuperuser();
  await reconcileUnpostedLobbies(client);
  await subscribeLobbies(client);
  await subscribeLobbyParticipants(client);
  console.log("[joint-bot] Lobby-Sync aktiv (Web → Discord)");
}
```

- [ ] **Step 5: Tests laufen lassen — müssen passen**

```bash
pnpm --filter @joint/bot test
```

Expected: alle Tests pass (inkl. der 3 neuen).

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/lobby-sync.ts apps/bot/src/lobbies.ts apps/bot/src/lobby-sync.test.ts
git commit -m "Füge Lobby-Sync-Worker für Web-Lobbys hinzu"
```

---

### Task 9: Bot — Button-Flow markiert eigene Schreibvorgänge

**Files:**
- Modify: `apps/bot/src/commands/lobby.ts` (handleJoin / handleLeave)

- [ ] **Step 1: markHandled einbauen**

Import ergänzen:

```ts
import { markHandled } from "../lobby-sync";
```

In `handleJoin` nach `await addLobbyParticipant(lobby.id, interaction.user.id);`:

```ts
  markHandled(`create:${lobby.id}:${interaction.user.id}`);
```

In `handleLeave` nach `await removeLobbyParticipant(lobby.id, interaction.user.id);`:

```ts
  markHandled(`delete:${lobby.id}:${interaction.user.id}`);
```

- [ ] **Step 2: Tests + Typecheck**

```bash
pnpm --filter @joint/bot test && pnpm --filter @joint/bot check-types
```

Expected: pass / clean.

- [ ] **Step 3: Commit**

```bash
git add apps/bot/src/commands/lobby.ts
git commit -m "Verhindere Doppel-Sync bei eigenen Lobby-Button-Aktionen"
```

---

### Task 10: Bot — Web-Events an Discord-Guild-Events linken + Worker verdrahten

**Files:**
- Modify: `apps/bot/src/realtime.ts`
- Modify: `apps/bot/src/index.ts`

- [ ] **Step 1: realtime.ts — Imports erweitern**

```ts
import {
  // bestehende Imports behalten, ergänzen:
  createGuildEvent,
} from "./guild-events";
import { setEventLinks } from "./events";
```

(`createGuildEvent` zur bestehenden guild-events-Importliste hinzufügen; `setEventLinks` zur events-Importliste.)

- [ ] **Step 2: announceAfterDiscordLink ersetzen durch linkEventToGuild**

Die Funktion `announceAfterDiscordLink` (Zeilen ~63-75) **löschen** und stattdessen einfügen:

```ts
async function fetchBanner(event: JointEvent): Promise<Buffer | null> {
  if (!event.bannerUrl) return null;
  try {
    // PocketBase-File-Fields liefern nur den Dateinamen — URL hier auflösen.
    const absolute = event.bannerUrl.startsWith("http")
      ? event.bannerUrl
      : `${env.pocketbaseUrl}/api/files/events/${event.id}/${event.bannerUrl}`;
    const response = await fetch(absolute);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Erstellt für ein (web-)Event ohne discordGuildEventId das Discord-
 * Server-Event und schreibt die ID zurück. Die Ankündigung übernimmt
 * anschließend der Update-Realtime-Event (announced-Guard).
 */
async function linkEventToGuild(client: Client, event: JointEvent): Promise<void> {
  const image = await fetchBanner(event);
  const guildEventId = await createGuildEvent(client, event, image);
  if (!guildEventId) {
    await announce(client, event);
    return;
  }
  await setEventLinks(event.id, { discordGuildEventId: guildEventId });
  console.log(`[joint-bot] Web-Event verlinkt: ${event.title}`);
}
```

- [ ] **Step 3: handleRecordChange-Zweig anpassen**

Den Block

```ts
    if (syncEnabled() && !record.discordGuildEventId) {
      announceAfterDiscordLink(client, record.id);
      return;
    }
```

ersetzen durch:

```ts
    if (syncEnabled() && !record.discordGuildEventId) {
      await linkEventToGuild(client, record);
      return;
    }
```

- [ ] **Step 4: Boot-Reconcile für unverlinkte Web-Events**

In `startEventRealtime`, direkt nach `await seedState();` einfügen:

```ts
  if (syncEnabled()) {
    const unlinked = (await listAllEvents()).filter(
      (event) =>
        !event.isCanceled &&
        !event.discordGuildEventId &&
        Date.parse(event.startsAt) > Date.now(),
    );
    for (const event of unlinked) {
      try {
        await linkEventToGuild(client, event);
      } catch (error) {
        console.warn(`[joint-bot] Web-Event konnte nicht verlinkt werden: ${event.title}`, error);
      }
    }
  }
```

- [ ] **Step 5: index.ts — Lobby-Sync starten**

In `apps/bot/src/index.ts`:

```ts
import { startLobbySync } from "./lobby-sync";
```

Im `ClientReady`-Handler, nach `await startEventRealtime(client);` (innerhalb des `else`-Zweigs von `hasSuperuser()` ist `startEventRealtime` NICHT — es steht außerhalb; daher):

Nach dem bestehenden `await startEventRealtime(client);` einfügen:

```ts
  if (hasSuperuser()) {
    await startLobbySync(client);
  }
```

- [ ] **Step 6: Tests + Typecheck**

```bash
pnpm --filter @joint/bot test && pnpm --filter @joint/bot check-types
```

Expected: pass / clean.

- [ ] **Step 7: Commit**

```bash
git add apps/bot/src/realtime.ts apps/bot/src/index.ts
git commit -m "Linke Web-Events an Discord-Server-Events und starte Lobby-Sync"
```

---

### Task 11: Gesamtverifikation

- [ ] **Step 1: Alle Tests + Typechecks im Workspace**

```bash
pnpm test && pnpm check-types && pnpm lint
```

Expected: alles grün. (`lint` läuft via turbo in allen Apps; falls das Backend kein lint-Script hat, ist das OK — turbo überspringt fehlende Tasks nicht lautlos: prüfen, dass `apps/backend/package.json` ggf. `"lint": "echo ok"` nicht nötig ist, weil turbo nur Pakete mit Task laufen lässt.)

- [ ] **Step 2: Backend-Smoke-Test (Regeln + Route live)**

```bash
pnpm --filter @joint/backend dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8090/api/collections/records/events
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8090/api/collections/records/lobbies
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8090/api/collections/records/games
curl -s "http://127.0.0.1:8090/api/joint/games/search?q=portal" | head -c 300
```

Expected: `200` für events/lobbies/games (öffentlich lesbar), JSON-Suggestions für die Suche. Anschließend Backend stoppen.

- [ ] **Step 3: Endergebnis festhalten**

Wenn alles grün: kurze Zusammenfassung im Chat (nicht committen). Live-Discord-E2E (Web-Lobby → Discord-Post) erfolgt in Plan B gegen die laufende App.

---

## Risiken & Hinweise für die Ausführung

- **Migration-Rückweg:** Task 1 hat einen vollständigen Down-Teil; bei Fehlern `./pocketbase migrate down` (in `apps/backend`) und neu anwenden.
- **Zirkulärer Import** `commands/lobby.ts ↔ lobby-post.ts`: nur Funktionsreferenzen zur Laufzeit — mit ESM/tsx unproblematisch; falls der Bundler/Typecheck meckert, `lobbyToEmbed`/`lobbyComponents`/`clamp` stattdessen in eine dritte Datei `lobby-embed.ts` ziehen und aus beiden importieren.
- **Steam-Rate-Limits:** storesearch ist großzügig; der 2-3s-Timeout + Cache-First schützen. Keine weiteren Maßnahmen nötig (YAGNI).
- **PocketBase-JSVM:** `$http.send` → `{statusCode, json}`; `new Record(collection)` + `$app.save` für Inserts; `$dbx.like/$dbx.eq` + `$app.recordQuery` für Abfragen; `BadRequestError(msg, data)` → 400 mit `data.reason` (maschinenlesbar fürs Frontend).

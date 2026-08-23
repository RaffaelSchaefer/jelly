/// <reference path="../pb_data/types.d.ts" />

// Steam-Spiele: öffentliche Suchroute für die Web-Combobox + best-effort
// gameRef-Anreicherung für Lobbys/Events, die ohne relation angelegt werden.
// Steam-Ausfälle dürfen Saves NIEMALS blockieren (Spec: nicht-blockierend).

// GET /api/joint/games/search?q=...  (öffentlich)
routerAdd("GET", "/api/joint/games/search", (e) => {
  const { normalizeQuery } = require(`${__hooks}/games-utils.js`)
  const { searchGames } = require(`${__hooks}/games-store.js`)

  const query = normalizeQuery(e.request.url.query().get("q"))
  if (query.length < 2) return e.json(200, { suggestions: [] })
  return e.json(200, { suggestions: searchGames(query) })
})

// Best-effort gameRef für Lobbys/Events ohne relation (z. B. vom Bot
// befüllte Freitext-Spiele). Lokaler Cache zuerst; nur bei Cache-Miss ein
// Steam-Request mit kurzem Timeout. Fehler werden geschluckt.
onRecordCreateRequest((e) => {
  const { bestEffortGameRef } = require(`${__hooks}/games-store.js`)
  bestEffortGameRef(e)
  e.next()
}, "lobbies")

onRecordUpdateRequest((e) => {
  const { bestEffortGameRef } = require(`${__hooks}/games-store.js`)
  bestEffortGameRef(e)
  e.next()
}, "lobbies")

onRecordCreateRequest((e) => {
  const { bestEffortGameRef } = require(`${__hooks}/games-store.js`)
  bestEffortGameRef(e)
  e.next()
}, "events")

onRecordUpdateRequest((e) => {
  const { bestEffortGameRef } = require(`${__hooks}/games-store.js`)
  bestEffortGameRef(e)
  e.next()
}, "events")

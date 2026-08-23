const STEAM_STORESEARCH = "https://store.steampowered.com/api/storesearch"
const STEAM_APPDETAILS = "https://store.steampowered.com/api/appdetails"

function findCachedGames(query, limit) {
  return $app.findRecordsByFilter("games", "name ~ {:query}", "name", limit, 0, { query })
}

function findGameByName(name) {
  const records = $app.findRecordsByFilter("games", "name = {:name}", "", 1, 0, { name })
  return records.length > 0 ? records[0] : null
}

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

function toSuggestion(record) {
  return {
    id: record.id,
    name: record.getString("name"),
    steamAppId: record.getString("steamAppId"),
    headerUrl: record.getString("headerUrl"),
    capsuleUrl: record.getString("capsuleUrl"),
  }
}

function searchGames(query) {
  const { pickBestSteamMatch } = require(`${__hooks}/games-utils.js`)
  const suggestions = []
  const seenNames = new Set()

  for (const record of findCachedGames(query, 8)) {
    seenNames.add(record.getString("name").toLowerCase())
    suggestions.push(toSuggestion(record))
  }

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

  return suggestions
}

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

module.exports = { bestEffortGameRef, searchGames }

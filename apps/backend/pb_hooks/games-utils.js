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

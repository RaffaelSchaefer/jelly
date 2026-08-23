/// <reference path="../pb_data/types.d.ts" />

/**
 * @param {core.Record} record
 */
function hasInvalidTimeRange(record) {
  const startsAt = record.getDateTime("startsAt")
  const endsAt = record.getDateTime("endsAt")

  if (startsAt.isZero() || endsAt.isZero()) {
    return false
  }

  return endsAt.string() <= startsAt.string()
}

/**
 * @param {core.Record} record
 */
function gameValidationError(record) {
  const isGame = record.getString("type") === "game"
  const game = record.getString("game").trim()
  const gameUrl = record.getString("gameUrl")
  const playersWanted = record.getInt("playersWanted")
  const threadId = record.getString("discordThreadId")

  if (!isGame) {
    return game || gameUrl || playersWanted || threadId
      ? "Game-Felder sind nur für Events vom Typ 'game' erlaubt."
      : ""
  }

  if (!game) return "'game' ist für Game-Events erforderlich."
  if (gameUrl && !/^https:\/\//i.test(gameUrl)) return "'gameUrl' muss HTTPS verwenden."

  return ""
}

module.exports = { gameValidationError, hasInvalidTimeRange }

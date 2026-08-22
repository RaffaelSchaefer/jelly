/// <reference path="../pb_data/types.d.ts" />

/**
 * @param {core.App} app
 * @param {string} tournamentId
 * @returns {core.Record}
 */
function findTournament(app, tournamentId) {
  try {
    return app.findRecordById("tournaments", tournamentId)
  } catch (err) {
    throw new BadRequestError("Turnier wurde nicht gefunden.")
  }
}

/**
 * @param {core.RecordEvent} e
 */
function ensureTournamentDefaults(e) {
  if (e.record.getInt("teamSize") < 1) {
    e.record.set("teamSize", 1)
  }
  if (e.record.getString("format") === "") {
    e.record.set("format", "single_elimination")
  }
  if (e.record.getString("status") === "") {
    e.record.set("status", "draft")
  }
}

/**
 * @param {core.App} app
 * @param {string} tournamentId
 * @returns {Array<core.Record>}
 */
function listParticipants(app, tournamentId) {
  return app.findRecordsByFilter(
    "tournament_participants",
    "tournament = {:tournamentId}",
    "-created",
    0,
    0,
    { tournamentId },
  )
}

onRecordCreate((e) => {
  ensureTournamentDefaults(e)

  e.next()
}, "tournaments")

onRecordUpdate((e) => {
  ensureTournamentDefaults(e)

  e.next()
}, "tournaments")

onRecordCreate((e) => {
  const tournament = findTournament(e.app, e.record.getString("tournament"))

  if (tournament.getString("status") !== "registration_open") {
    throw new BadRequestError("Die Anmeldung für dieses Turnier ist geschlossen.")
  }

  const participants = listParticipants(e.app, tournament.id)
  const userId = e.record.getString("user")

  for (const participant of participants) {
    if (participant.getString("user") === userId) {
      throw new BadRequestError("Du bist für dieses Turnier bereits angemeldet.")
    }
  }

  if (participants.length >= tournament.getInt("maxParticipants")) {
    throw new BadRequestError("Dieses Turnier ist bereits ausgebucht.")
  }

  e.next()
}, "tournament_participants")

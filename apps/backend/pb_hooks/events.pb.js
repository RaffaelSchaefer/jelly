/// <reference path="../pb_data/types.d.ts" />

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
}, "events")

onRecordCreate((e) => {
  const { gameValidationError, hasInvalidTimeRange } = require(`${__hooks}/events-utils.js`)

  if (hasInvalidTimeRange(e.record)) {
    throw new BadRequestError("'endsAt' muss nach 'startsAt' liegen.")
  }
  const gameError = gameValidationError(e.record)
  if (gameError) throw new BadRequestError(gameError)

  e.next()
}, "events")

onRecordUpdate((e) => {
  const { gameValidationError, hasInvalidTimeRange } = require(`${__hooks}/events-utils.js`)

  if (hasInvalidTimeRange(e.record)) {
    throw new BadRequestError("'endsAt' muss nach 'startsAt' liegen.")
  }
  const gameError = gameValidationError(e.record)
  if (gameError) throw new BadRequestError(gameError)

  e.next()
}, "events")

// Hinweis: Die Teilnahme an Events wird ausschließlich über Discord verwaltet
// (Guild Scheduled Events). Der Bot spiegelt die Teilnehmer nach
// event_attendees; Web-Benutzer haben nur Leserechte (siehe Migration
// 1787001700_remove_web_event_join.js). Bewusste Verzicht auf eine
// Kapazitätsprüfung, damit die Bot-Synchronisation nie scheitert.

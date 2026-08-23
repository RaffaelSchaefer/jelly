/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  if (e.auth && e.auth.collection().name === "users") {
    e.record.set("createdBy", e.auth.id)
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
      "event_attendees",
      $dbx.hashExp({ event: eventId }),
    )
    if (joined >= wanted) {
      throw new BadRequestError("Dieses Event ist leider schon voll.", { reason: "full" })
    }
  }
  e.next()
}, "event_attendees")

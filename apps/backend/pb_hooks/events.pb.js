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

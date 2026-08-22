/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  if (e.auth && e.auth.collection().name === "users") {
    e.record.set("createdBy", e.auth.id)
  }

  e.next()
}, "events")

onRecordCreate((e) => {
  const { hasInvalidTimeRange } = require(`${__hooks}/events-utils.js`)

  if (hasInvalidTimeRange(e.record)) {
    throw new BadRequestError("'endsAt' muss nach 'startsAt' liegen.")
  }

  e.next()
}, "events")

onRecordUpdate((e) => {
  const { hasInvalidTimeRange } = require(`${__hooks}/events-utils.js`)

  if (hasInvalidTimeRange(e.record)) {
    throw new BadRequestError("'endsAt' muss nach 'startsAt' liegen.")
  }

  e.next()
}, "events")

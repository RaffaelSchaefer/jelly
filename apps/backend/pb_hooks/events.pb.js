/// <reference path="../pb_data/types.d.ts" />

/**
 * @param {core.Record} record
 */
function validateTimeRange(record) {
  const startsAt = record.getDateTime("startsAt")
  const endsAt = record.getDateTime("endsAt")

  if (startsAt.isZero() || endsAt.isZero()) {
    return
  }

  if (endsAt.string() <= startsAt.string()) {
    throw new BadRequestError("'endsAt' muss nach 'startsAt' liegen.")
  }
}

onRecordCreateRequest((e) => {
  if (e.auth) {
    e.record.set("createdBy", e.auth.id)
  }

  e.next()
}, "events")

onRecordCreate((e) => {
  if (e.record.getString("status") === "") {
    e.record.set("status", "draft")
  }

  validateTimeRange(e.record)

  e.next()
}, "events")

onRecordUpdate((e) => {
  validateTimeRange(e.record)

  e.next()
}, "events")

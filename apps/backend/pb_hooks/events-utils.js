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

module.exports = { hasInvalidTimeRange }

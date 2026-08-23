/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    const type = /** @type {SelectField} */ (events.fields.getByName("type"))
    type.values = [...type.values, "game"]
    events.fields.add(new TextField({ name: "game", max: 100 }))
    events.fields.add(new URLField({ name: "gameUrl" }))
    events.fields.add(new NumberField({ name: "playersWanted", onlyInt: true, min: 1, max: 99 }))
    events.fields.add(new TextField({ name: "discordThreadId", max: 32 }))
    app.save(events)
  },
  (app) => {
    for (const record of app.findRecordsByFilter("events", "type = 'game'", "", 0, 0)) {
      if (!record) continue
      record.set("game", "")
      record.set("gameUrl", "")
      record.set("playersWanted", 0)
      record.set("discordThreadId", "")
      record.set("type", "other")
      app.save(record)
    }

    const events = app.findCollectionByNameOrId("events")
    const type = /** @type {SelectField} */ (events.fields.getByName("type"))
    type.values = type.values.filter((value) => value !== "game")
    events.fields.removeByName("game")
    events.fields.removeByName("gameUrl")
    events.fields.removeByName("playersWanted")
    events.fields.removeByName("discordThreadId")
    app.save(events)
  },
)

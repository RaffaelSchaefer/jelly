/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    events.fields.add(new TextField({ name: "discordGuildEventId", max: 32 }))
    app.save(events)
  },
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    events.fields.removeByName("discordGuildEventId")
    app.save(events)
  },
)

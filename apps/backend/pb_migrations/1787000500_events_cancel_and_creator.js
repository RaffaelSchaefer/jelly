/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    events.fields.add(new BoolField({ name: "isCanceled" }))
    events.fields.add(new TextField({ name: "discordCreatorId", max: 32 }))
    app.save(events)
  },
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    events.fields.removeByName("isCanceled")
    events.fields.removeByName("discordCreatorId")
    app.save(events)
  },
)

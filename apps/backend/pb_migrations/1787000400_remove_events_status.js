/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    events.fields.removeByName("status")
    events.listRule = ""
    events.viewRule = ""
    app.save(events)
  },
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    events.fields.add(
      new SelectField({
        name: "status",
        maxSelect: 1,
        values: ["draft", "published", "cancelled"],
      }),
    )
    events.listRule = "status = 'published'"
    events.viewRule = "status = 'published'"
    app.save(events)
  },
)

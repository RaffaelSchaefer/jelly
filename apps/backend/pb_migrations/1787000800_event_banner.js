/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    events.fields.add(
      new FileField({
        name: "banner",
        maxSize: 5 * 1024 * 1024,
        maxSelect: 1,
        mimeTypes: ["image/png", "image/jpeg", "image/webp"],
      }),
    )
    app.save(events)
  },
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    events.fields.removeByName("banner")
    app.save(events)
  },
)

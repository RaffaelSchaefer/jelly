/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    const attendees = new Collection(
      /** @type {any} */ ({
        type: "base",
        name: "event_attendees",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: "event",
            type: "relation",
            required: true,
            collectionId: events.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: "discordUserId", type: "text", required: true, max: 32 },
        ],
        indexes: [
          "CREATE UNIQUE INDEX `idx_event_attendees_event_user` ON `event_attendees` (`event`, `discordUserId`)",
        ],
      }),
    )
    app.save(attendees)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("event_attendees"))
  },
)

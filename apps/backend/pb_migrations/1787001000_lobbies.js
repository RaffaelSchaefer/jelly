/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const lobbies = new Collection(
      /** @type {any} */ ({
        type: "base",
        name: "lobbies",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: "game", type: "text", required: true, min: 1, max: 100 },
          { name: "gameUrl", type: "url" },
          { name: "playersWanted", type: "number", onlyInt: true, min: 1, max: 99 },
          { name: "startsAt", type: "date" },
          { name: "location", type: "text", max: 120 },
          { name: "discordCreatorId", type: "text", required: true, max: 32 },
          { name: "discordMessageId", type: "text", max: 32 },
          { name: "discordThreadId", type: "text", max: 32 },
          { name: "isClosed", type: "bool" },
        ],
        indexes: ["CREATE INDEX `idx_lobbies_isClosed` ON `lobbies` (`isClosed`)"],
      }),
    )
    app.save(lobbies)

    const participants = new Collection(
      /** @type {any} */ ({
        type: "base",
        name: "lobby_participants",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: "lobby",
            type: "relation",
            required: true,
            collectionId: lobbies.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: "discordUserId", type: "text", required: true, max: 32 },
        ],
        indexes: [
          "CREATE UNIQUE INDEX `idx_lobby_participants_lobby_user` ON `lobby_participants` (`lobby`, `discordUserId`)",
        ],
      }),
    )
    app.save(participants)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("lobby_participants"))
    app.delete(app.findCollectionByNameOrId("lobbies"))
  },
)

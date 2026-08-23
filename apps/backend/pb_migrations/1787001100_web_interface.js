/// <reference path="../pb_data/types.d.ts" />

// Web-Interface-Grundlage (siehe docs/superpowers/specs/2026-08-23-web-interface-design.md):
// - games: Steam-Metadaten-Cache (öffentlich lesbar, nur Hooks/Superuser schreiben)
// - lobbies/events: gameRef-Relation + öffentliche Lese-Rechte + Creator-Regeln
// - lobby_participants/event_attendees: öffentliche Lesen, Beitreten nur mit
//   eigener discordId (Regel), Löschen nur des eigenen Eintrags
// - users: discordId (wird beim Discord-Login befüllt, siehe auth.pb.js)
migrate(
  (app) => {
    const games = new Collection(
      /** @type {any} */ ({
        type: "base",
        name: "games",
        listRule: "",
        viewRule: "",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: "name", type: "text", required: true, min: 1, max: 150 },
          { name: "steamAppId", type: "text", max: 16 },
          { name: "headerUrl", type: "url" },
          { name: "capsuleUrl", type: "url" },
          { name: "shortDescription", type: "text", max: 400 },
          { name: "lastEnrichedAt", type: "date" },
        ],
        indexes: [
          "CREATE UNIQUE INDEX `idx_games_name` ON `games` (`name`)",
          "CREATE INDEX `idx_games_steamAppId` ON `games` (`steamAppId`)",
        ],
      }),
    )
    app.save(games)

    const users = app.findCollectionByNameOrId("users")
    users.fields.add(new TextField({ name: "discordId", max: 32 }))
    app.save(users)

    const lobbies = app.findCollectionByNameOrId("lobbies")
    lobbies.fields.add(
      new RelationField({ name: "gameRef", collectionId: games.id, maxSelect: 1 }),
    )
    lobbies.fields.add(
      new RelationField({ name: "createdBy", collectionId: users.id, maxSelect: 1 }),
    )
    lobbies.listRule = ""
    lobbies.viewRule = ""
    lobbies.createRule = ""
    lobbies.updateRule = "createdBy = @request.auth.id"
    lobbies.deleteRule = "createdBy = @request.auth.id"
    app.save(lobbies)

    const participants = app.findCollectionByNameOrId("lobby_participants")
    participants.listRule = ""
    participants.viewRule = ""
    participants.createRule =
      "@request.auth.discordId != '' && @request.auth.discordId = discordUserId"
    participants.deleteRule =
      "@request.auth.discordId != '' && @request.auth.discordId = discordUserId"
    app.save(participants)

    const events = app.findCollectionByNameOrId("events")
    events.fields.add(
      new RelationField({ name: "gameRef", collectionId: games.id, maxSelect: 1 }),
    )
    events.listRule = ""
    events.viewRule = ""
    events.createRule = ""
    events.updateRule = "createdBy = @request.auth.id"
    events.deleteRule = "createdBy = @request.auth.id"
    app.save(events)

    const attendees = app.findCollectionByNameOrId("event_attendees")
    attendees.listRule = ""
    attendees.viewRule = ""
    attendees.createRule = "@request.auth.discordId != '' && @request.auth.discordId = discordUserId"
    attendees.deleteRule = "@request.auth.discordId != '' && @request.auth.discordId = discordUserId"
    app.save(attendees)
  },
  (app) => {
    const attendees = app.findCollectionByNameOrId("event_attendees")
    attendees.listRule = null
    attendees.viewRule = null
    attendees.createRule = null
    attendees.deleteRule = null
    app.save(attendees)

    const events = app.findCollectionByNameOrId("events")
    events.fields.removeByName("gameRef")
    events.listRule = null
    events.viewRule = null
    events.createRule = null
    events.updateRule = null
    events.deleteRule = null
    app.save(events)

    const participants = app.findCollectionByNameOrId("lobby_participants")
    participants.listRule = null
    participants.viewRule = null
    participants.createRule = null
    participants.deleteRule = null
    app.save(participants)

    const lobbies = app.findCollectionByNameOrId("lobbies")
    lobbies.fields.removeByName("gameRef")
    lobbies.fields.removeByName("createdBy")
    lobbies.listRule = null
    lobbies.viewRule = null
    lobbies.createRule = null
    lobbies.updateRule = null
    lobbies.deleteRule = null
    app.save(lobbies)

    const users = app.findCollectionByNameOrId("users")
    users.fields.removeByName("discordId")
    app.save(users)

    app.delete(app.findCollectionByNameOrId("games"))
  },
)

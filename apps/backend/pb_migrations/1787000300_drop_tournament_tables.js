/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    app.delete(app.findCollectionByNameOrId("tournament_participants"))
    app.delete(app.findCollectionByNameOrId("teams"))
    app.delete(app.findCollectionByNameOrId("tournaments"))
  },
  (app) => {
    const restored = new Collection(
      /** @type {any} */ ({
        type: "base",
        name: "tournaments",
        listRule: "",
        viewRule: "",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: "title", type: "text", required: true, min: 3, max: 120 },
          { name: "game", type: "text", required: true, min: 2, max: 80 },
          { name: "description", type: "editor", maxSize: 2000000 },
          { name: "rules", type: "editor", maxSize: 2000000 },
          {
            name: "format",
            type: "select",
            maxSelect: 1,
            values: ["single_elimination", "double_elimination", "round_robin"],
          },
          { name: "teamSize", type: "number", onlyInt: true, min: 1, max: 16 },
          { name: "maxParticipants", type: "number", onlyInt: true, required: true, min: 2 },
          { name: "startsAt", type: "date", required: true },
          {
            name: "status",
            type: "select",
            maxSelect: 1,
            values: [
              "draft",
              "registration_open",
              "registration_closed",
              "running",
              "finished",
              "cancelled",
            ],
          },
        ],
        indexes: ["CREATE INDEX `idx_tournaments_startsAt` ON `tournaments` (`startsAt`)"],
      }),
    )
    app.save(restored)

    const teams = new Collection(
      /** @type {any} */ ({
        type: "base",
        name: "teams",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.id != '' && @request.body.captain = @request.auth.id",
        updateRule: "captain = @request.auth.id",
        deleteRule: "captain = @request.auth.id",
        fields: [
          { name: "name", type: "text", required: true, min: 2, max: 60 },
          {
            name: "tournament",
            type: "relation",
            required: true,
            collectionId: restored.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: "captain",
            type: "relation",
            required: true,
            collectionId: "_pb_users_auth_",
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: "members",
            type: "relation",
            collectionId: "_pb_users_auth_",
            cascadeDelete: true,
            maxSelect: 64,
          },
          { name: "lookingForMembers", type: "bool" },
        ],
        indexes: [
          "CREATE UNIQUE INDEX `idx_teams_tournament_name` ON `teams` (`tournament`, `name`)",
        ],
      }),
    )
    app.save(teams)

    const participants = new Collection(
      /** @type {any} */ ({
        type: "base",
        name: "tournament_participants",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id",
        updateRule: null,
        deleteRule: "user = @request.auth.id",
        fields: [
          {
            name: "tournament",
            type: "relation",
            required: true,
            collectionId: restored.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: "user",
            type: "relation",
            required: true,
            collectionId: "_pb_users_auth_",
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: "team",
            type: "relation",
            collectionId: teams.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: "checkedIn", type: "bool" },
        ],
        indexes: [
          "CREATE UNIQUE INDEX `idx_tp_tournament_user` ON `tournament_participants` (`tournament`, `user`)",
        ],
      }),
    )
    app.save(participants)
  },
)

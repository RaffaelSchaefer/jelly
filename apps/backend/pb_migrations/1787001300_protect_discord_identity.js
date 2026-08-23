/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.updateRule = "id = @request.auth.id && @request.body.discordId:changed = false";
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.updateRule = "id = @request.auth.id";
    app.save(users);
  },
);

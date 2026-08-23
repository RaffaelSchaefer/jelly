/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    for (const name of ["lobbies", "events"]) {
      const collection = app.findCollectionByNameOrId(name)
      collection.createRule = "@request.auth.id != ''"
      collection.updateRule = "@request.auth.id != '' && createdBy = @request.auth.id"
      collection.deleteRule = "@request.auth.id != '' && createdBy = @request.auth.id"
      app.save(collection)
    }
  },
  (app) => {
    for (const name of ["lobbies", "events"]) {
      const collection = app.findCollectionByNameOrId(name)
      collection.createRule = ""
      collection.updateRule = "createdBy = @request.auth.id"
      collection.deleteRule = "createdBy = @request.auth.id"
      app.save(collection)
    }
  },
)

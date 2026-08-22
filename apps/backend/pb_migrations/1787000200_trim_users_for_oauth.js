/// <reference path="../pb_data/types.d.ts" />

// Räumt die users-Collection für Discord-only Auth auf:
// - `name` und `avatar`: Default-Felder der PB-Standard-Users-Collection,
//   werden nicht genutzt (Profil-Daten kommen aus Discord -> nickname/
//   discordUsername)
//
// Hinweis: password/tokenKey/email/... sind Pflicht-Systemfelder von
// PocketBase Auth-Collections und können nicht entfernt werden –
// passwordAuth ist aber deaktiviert (siehe 1787000100_discord_only_auth).
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users")

    // OAuth2-Mappings auf entfernte Felder lösen,
    // username direkt auf discordUsername mappen.
    users.oauth2.mappedFields.name = ""
    users.oauth2.mappedFields.avatarURL = ""
    users.oauth2.mappedFields.username = "discordUsername"

    users.fields.removeByName("name")
    users.fields.removeByName("avatar")

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users")

    users.oauth2.mappedFields.name = "name"
    users.oauth2.mappedFields.avatarURL = "avatar"
    users.oauth2.mappedFields.username = ""

    users.fields.add(new TextField({ name: "name", max: 255 }))
    users.fields.add(
      new FileField({
        name: "avatar",
        maxSelect: 1,
        maxSize: 5242880,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      }),
    )

    app.save(users)
  },
)

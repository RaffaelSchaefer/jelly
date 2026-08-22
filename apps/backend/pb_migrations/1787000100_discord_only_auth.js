/// <reference path="../pb_data/types.d.ts" />

// Discord-only Auth:
// - Password-Login und -Registrierung deaktiviert
// - Direkte User-Erstellung über die API geschlossen (createRule = null)
//   (OAuth2-Signups laufen intern und sind davon nicht betroffen)
// - Discord OAuth2 Provider aktiviert (Credentials via ENV:
//   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET)
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users")

    users.passwordAuth.enabled = false
    users.createRule = null
    users.oauth2.enabled = true

    const clientId = $os.getenv("DISCORD_CLIENT_ID")
    const clientSecret = $os.getenv("DISCORD_CLIENT_SECRET")

    if (clientId && clientSecret) {
      // PocketBase befüllt die übrigen Felder (authURL, tokenURL, …)
      // automatisch beim Speichern aus der Provider-Registry.
      users.oauth2.providers = [
        /** @type {any} */ ({
          name: "discord",
          clientId,
          clientSecret,
        }),
      ]
    } else {
      console.log(
        "[joint] DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET nicht gesetzt - " +
          "Discord-Provider ist noch nicht konfiguriert.",
      )
    }

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users")

    users.passwordAuth.enabled = true
    users.oauth2.enabled = false
    users.oauth2.providers = []
    users.createRule = ""

    app.save(users)
  },
)

/// <reference path="../pb_data/types.d.ts" />

// Synchronisiert den Discord-Provider bei jedem Start aus den ENV-Vars.
// Fixt damit auch den Fall "OAuth2 aktiviert, aber kein Provider
// registriert" (Migration lief ohne gesetzte ENV-Vars).
onBootstrap((e) => {
  e.next()

  const clientId = $os.getenv("DISCORD_CLIENT_ID")
  const clientSecret = $os.getenv("DISCORD_CLIENT_SECRET")
  const users = $app.findCollectionByNameOrId("users")

  if (!clientId || !clientSecret) {
    if (users.oauth2.enabled) {
      users.oauth2.enabled = false
      users.oauth2.providers = []
      $app.save(users)
      console.log(
        "[joint] DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET nicht gesetzt - " +
          "Discord-Login deaktiviert.",
      )
    }
    return
  }

  const others = users.oauth2.providers.filter((p) => p.name !== "discord")
  others.push(
    /** @type {any} */ ({
      name: "discord",
      clientId,
      clientSecret,
    }),
  )
  users.oauth2.enabled = true
  users.oauth2.providers = others

  if (users.original && users.original.oauth2) {
    // nur speichern, wenn sich etwas geändert hat
    const before = /** @type {any} */ (users.original).oauth2
    if (
      before.enabled === true &&
      before.providers.length === others.length &&
      before.providers.some(
        (/** @type {any} */ p) =>
          p.name === "discord" &&
          p.clientId === clientId &&
          p.clientSecret === clientSecret,
      )
    ) {
      return
    }
  }

  $app.save(users)
  console.log("[joint] Discord-Provider synchronisiert.")
})

// Discord-only Auth:
// - Andere OAuth2-Provider werden abgewiesen (Defense-in-Depth zur Migration)
// - Bei erstmaligem Signup via Discord werden nickname/discordUsername
//   aus dem Discord-Profil befüllt
onRecordAuthWithOAuth2Request((e) => {
  if (e.providerName !== "discord") {
    throw new BadRequestError("Nur Discord-Login ist erlaubt.")
  }

  const profile = /** @type {auth.AuthUser} */ (e.oAuth2User || {})
  const discordUsername = profile.username || profile.name || ""

  if (e.isNewRecord) {
    e.createData.nickname = discordUsername || "Spieler"
    e.createData.discordUsername = discordUsername
  }

  return e.next()
}, "users")

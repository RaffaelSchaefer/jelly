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
// - Bei jedem Discord-Login werden discordId/discordUsername/discordAvatar
//   aus dem Discord-Profil aktualisiert; der nickname wird nur vorbelegt,
//   wenn er noch leer ist (er ist im Profil frei editierbar)
onRecordAuthWithOAuth2Request((e) => {
  if (e.providerName !== "discord") {
    throw new BadRequestError("Nur Discord-Login ist erlaubt.")
  }

  // Achtung: PocketBase liefert das Feld als "oAuth2User" (grosses O)
  const profile = /** @type {auth.AuthUser} */ (
    e.oAuth2User || /** @type {any} */ (e).oauth2User || {}
  )
  const fields = {
    discordId: String(profile.id || ""),
    discordUsername: profile.username || profile.name || "",
    // leer, wenn in Discord kein eigener Avatar gesetzt ist
    discordAvatar: profile.avatarURL || "",
  }
  // profile.name ist der Discord-Anzeigename (global_name)
  const displayName = profile.name || profile.username || "Spieler"

  if (e.isNewRecord) {
    e.createData = Object.assign(e.createData || {}, fields, { nickname: displayName })
  } else {
    let changed = false
    for (const key in fields) {
      // discordAvatar auch leeren, damit ein entfernter Discord-Avatar
      // wieder auf den Platzhalter zurueckfaellt
      const syncEmpty = key === "discordAvatar"
      if ((!fields[key] && !syncEmpty) || e.record.getString(key) === fields[key]) {
        continue
      }
      e.record.set(key, fields[key])
      changed = true
    }
    if (!e.record.getString("nickname")) {
      e.record.set("nickname", displayName)
      changed = true
    }
    if (changed) {
      $app.save(e.record)
    }
  }

  return e.next()
}, "users")

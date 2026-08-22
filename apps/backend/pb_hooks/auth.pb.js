/// <reference path="../pb_data/types.d.ts" />

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

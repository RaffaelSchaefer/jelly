/// <reference path="../pb_data/types.d.ts" />

// Web-erstellte Lobbys: bindet createdBy + discordCreatorId an den
// angemeldeten Benutzer (discordId kommt aus dem OAuth-Login, siehe
// auth.pb.js). Der Bot erstellt Lobbys als Superuser — Hook greift nicht.
onRecordCreateRequest((e) => {
  if (e.auth && e.auth.collection().name === "users") {
    const discordId = e.auth.getString("discordId")
    if (!discordId) {
      throw new BadRequestError(
        "Dein Konto hat keine verknüpfte Discord-ID. Bitte melde dich erneut mit Discord an.",
      )
    }
    e.record.set("createdBy", e.auth.id)
    e.record.set("discordCreatorId", discordId)
  }
  e.next()
}, "lobbies")

// Beitreten validieren: Lobby muss existieren, offen und nicht voll sein.
// Duplikate verhindert der Unique-Index idx_lobby_participants_lobby_user
// (PocketBase liefert dann einen 400-Validierungsfehler).
onRecordCreateRequest((e) => {
  const lobbyId = e.record.getString("lobby")
  let lobby
  try {
    lobby = $app.findRecordById("lobbies", lobbyId)
  } catch {
    throw new BadRequestError("Diese Lobby existiert nicht mehr.", { reason: "missing" })
  }
  if (lobby.getBool("isClosed")) {
    throw new BadRequestError("Diese Lobby ist bereits geschlossen.", { reason: "closed" })
  }
  const wanted = lobby.getInt("playersWanted")
  if (wanted > 0) {
    const joined = $app.countRecords(
      "lobby_participants",
      $dbx.hashExp({ lobby: lobbyId }),
    )
    if (joined >= wanted) {
      throw new BadRequestError("Diese Lobby ist leider schon voll.", { reason: "full" })
    }
  }
  e.next()
}, "lobby_participants")

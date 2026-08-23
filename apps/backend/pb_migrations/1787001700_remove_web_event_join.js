/// <reference path="../pb_data/types.d.ts" />

// Teilnahme an Events läuft ausschließlich über Discord (Guild Scheduled
// Events); der Bot schreibt event_attendees als Superuser. Das Web darf
// Teilnehmer nur lesen — Schreibregeln entfallen damit komplett und die
// Website kann Join/Leave nicht mehr gegen die Discord-Synchronisation
// arbeiten.
migrate(
  (app) => {
    const attendees = app.findCollectionByNameOrId("event_attendees")
    attendees.createRule = null
    attendees.deleteRule = null
    app.save(attendees)
  },
  (app) => {
    const attendees = app.findCollectionByNameOrId("event_attendees")
    attendees.createRule = "@request.auth.discordId != '' && @request.auth.discordId = discordUserId"
    attendees.deleteRule = "@request.auth.discordId != '' && @request.auth.discordId = discordUserId"
    app.save(attendees)
  },
)

# Jelly-Server: API

Dies ist der Vertrag zwischen Server, App und Bühne. Regelfälle zum Mittesten stehen in
[`testdata/contract/rules.json`](../testdata/contract/rules.json). Die Datei kann auch von Tests in
anderen Sprachen gelesen werden.

## Grundlagen

- Anfragen und Antworten sind JSON. Unbekannte Felder in Anfragen sind ein Fehler.
- Zeiten sind UTC in Unix-Millisekunden. Nur der Server vergibt sie.
- Spieler senden `Authorization: Bearer <token>`. Die Bühne nutzt den Bühnenschlüssel als `?key=`.
- Admins melden sich an und erhalten ein Cookie, siehe [Admin](#admin).
- Clients senden nur Absichten. XP, Zeiten und Freischaltungen bestimmt der Server.

### Fehler

Jeder Fehler hat diese Form. `code` ist stabil und für Programme gedacht, `message` wird angezeigt.

```json
{ "error": { "code": "name_taken", "message": "Dieser Name ist schon vergeben." } }
```

| Status | Code                                      | Bedeutung                                 |
| ------ | ----------------------------------------- | ----------------------------------------- |
| 400    | `invalid_body`                            | Kein gültiges JSON oder unbekanntes Feld  |
| 400    | `invalid_input`, `invalid_rules`          | Admin-Angaben sind ungültig               |
| 400    | `invalid_area`                            | Bereich passt nicht auf die Bühne oder hat keine bekannte Art |
| 400    | `invalid_name`, `invalid_color`           | Name oder Farbe sind ungültig             |
| 400    | `unknown_action`, `unknown_emote`         | Eintrag steht nicht in der festen Liste   |
| 400    | `unknown_partner_emote`, `unknown_sign`   | Eintrag steht nicht in der festen Liste   |
| 400    | `invalid_event_code`                      | Code unbekannt oder außerhalb seiner Zeit |
| 400    | `invalid_partner_code`, `partner_self`    | Code gilt nicht oder ist der eigene       |
| 400    | `invalid_follow`                          | Zu diesem Jelly kann man sich nicht stellen |
| 401    | `unauthorized`                            | Token oder Schlüssel fehlt oder ist falsch |
| 403    | `invalid_code`                            | Anmeldecode stimmt nicht                  |
| 403    | `forbidden`                               | Admin-Anmeldung fehlt oder ist abgelaufen |
| 404    | `player_not_found`, `lan_not_found`       | Eintrag gibt es nicht                     |
| 404    | `area_not_found`                          | Bereich gehört nicht zu dieser LAN        |
| 409    | `name_taken`, `lan_overlap`               | Steht im Konflikt mit Vorhandenem         |
| 409    | `no_active_lan`, `not_joined`             | Gerade keine LAN oder keine Teilnahme     |
| 409    | `already_joined`, `cosmetic_locked`       | Schon dabei oder noch nicht freigeschaltet |
| 409    | `event_code_redeemed`, `event_code_exists` | Event-Code schon eingelöst oder vorhanden |
| 409    | `emote_cooldown`, `report_cooldown`       | Zu früh wiederholt                        |
| 409    | `report_limit`, `partner_codes_busy`      | Limit erreicht, später erneut versuchen   |
| 409    | `area_not_assignable`                     | In diesem Bereich kann kein Jelly stehen  |
| 429    | `rate_limited`                            | Zu viele Versuche                         |
| 500    | `internal`                                | Fehler auf dem Server                     |

### Stand eines Spielers

`GET /me` und die meisten Aktionen liefern diesen Stand.

```json
{
  "id": 1,
  "name": "Glibber",
  "color": "mint",
  "cosmetic": null,
  "hidden": false,
  "lan": { "slug": "ucb-2026", "name": "UCB LAN 2026", "active": true },
  "xp": 3,
  "level": 1,
  "total_xp": 3,
  "next_poke_at": 1795000900000,
  "reports": { "food_ready_at": 0, "drink_ready_at": 0, "reports_left": 8 },
  "sign": null,
  "follow_player_id": null,
  "lans_attended": 1,
  "badges": [{ "slug": "ucb-2026", "name": "UCB LAN 2026" }],
  "cosmetics": [],
  "achievements": [{ "key": "hatched", "title": "Frisch geschlüpft", "lan_slug": null, "earned_at": 1795000000000 }],
  "awards": []
}
```

- `xp` und `level` gelten für die jüngste LAN des Kontos, `total_xp` über alle LANs.
- `next_poke_at`, `reports`, `sign` und `follow_player_id` sind außerhalb einer aktiven LAN `null`.
- Rekord-Achievements wie Marathon tragen zusätzlich `best` und `record_unit`.

## Spieler

| Weg                       | Körper                                     | Antwort                        |
| ------------------------- | ------------------------------------------ | ------------------------------ |
| `GET /health`             |                                            | `{"status":"ok"}`              |
| `GET /catalog`            |                                            | Feste Listen, siehe unten      |
| `POST /register`          | `{"code","name","color"}`                  | `201 {"token","me"}`           |
| `POST /lans/current/join` | `{"code"}`                                 | Stand                          |
| `GET /me`                 |                                            | Stand                          |
| `PATCH /me`               | `{"name","color","cosmetic"}`, alle optional | Stand                        |
| `POST /actions`           | `{"action":"poke"}`, auch `food`, `drink`  | `{"xp_gained","me"}`           |
| `POST /redeem`            | `{"code"}`                                 | `{"title","xp_gained","me"}`   |
| `POST /emote`             | `{"key"}`                                  | Stand                          |
| `PUT /sign`               | `{"key"}`                                  | Stand                          |
| `DELETE /sign`            |                                            | Stand                          |
| `PUT /follow`             | `{"player_id"}`                            | Stand                          |
| `DELETE /follow`          |                                            | Stand                          |

Das Token gibt es nur in der Antwort von `POST /register`. `GET /catalog` liefert `emotes`,
`partner_emotes`, `signs`, `cosmetics` und `achievements`, geheime Achievements fehlen dort.

Ein zu früher Stupser ist kein Fehler, sondern ergibt `xp_gained: 0`. Die App muss den Server nur
ansprechen, wenn `next_poke_at` erreicht ist.

### Partner-Emotes

A startet ein Emote und nennt B den Code. Es gibt keine Einladung, also auch nichts zu spammen.

| Weg                       | Körper    | Antwort                                  |
| ------------------------- | --------- | ---------------------------------------- |
| `POST /partner-emote`     | `{"key"}` | `{"code","key","expires_at"}`            |
| `POST /partner-emote/join` | `{"code"}` | `{"key","partner_id","xp_gained","me"}` |

- Der Code hat 4 Ziffern und gilt `partner_code_seconds` lang. Ein neuer Code ersetzt den alten.
- Beide erhalten `partner_xp` einmal je Partner und LAN. Danach ist `xp_gained` 0.
- Falsche Codes sind je Spieler begrenzt, danach folgt `429 rate_limited`.

## Bühne

`GET /state` nimmt den Bühnenschlüssel oder ein Spieler-Token:

```json
{
  "last_event_id": 42,
  "server_time": 1795000000000,
  "areas": [{ "id": 1, "x": 0, "y": 0, "width": 50, "height": 100, "kind": "seats" }],
  "players": [{
    "id": 1, "name": "Glibber", "color": "mint", "cosmetic": null, "level": 1,
    "sign": null, "follow_player_id": null, "last_seen_at": 1795000000000,
    "area_id": 1, "home_x": 24.2, "home_y": 61.8
  }]
}
```

- Bereiche und Heimplätze sind Prozentwerte der Bühne. Bereiche haben keine Namen.
- `kind` sagt, was ein Bereich ist. Jellies stehen in `seats` (Plätze an den Spieltischen),
  `stage` (Bühne für Turniere und Public Gaming) und `lounge` (Chillout-Lounge). Um `desk` (Tisch)
  und `snackbar` (Theke) laufen sie herum, über `cable` (Kabelkanal am Boden) hinweg.
- Jellies ohne Bereich stehen in der Lounge mit der kleinsten ID, `area_id` zeigt dann diese
  Lounge. Ohne Lounge haben sie keinen Bereich.
- Jeder Jelly bekommt im Bereich den nächsten freien Platz in der Reihenfolge der Spieler-IDs. Ohne
  Bereich und ohne Lounge gilt die ganze Bühne. Abwesende behalten ihren Platz, Neue verschieben niemanden.
- Mit `server_time` berechnen alle Bildschirme denselben Weg.

`GET /events/stream` sendet Ereignisse als SSE und setzt mit `Last-Event-ID` oder `?since=` fort:

| Ereignis                                          | Bedeutung                          |
| ------------------------------------------------- | ---------------------------------- |
| `player.active`, `player.updated`                 | Jelly kam dazu oder wurde geändert |
| `player.hidden`, `player.removed`                 | Jelly ist weg                      |
| `xp.gained`, `level.up`                           | Fortschritt, `xp.gained` mit `{"amount","source"}` |
| `achievement.earned`, `award.given`               | Auszeichnung                       |
| `emote`, `partner.emote`                          | Emote, Partner-Emote mit `partner_id` |
| `sign.changed`, `follow.changed`                  | Schild oder Standort               |
| `stage.changed`                                   | Raumkarte geändert, Stand neu laden |

Ereignisse tragen IDs und Schlüssel, aber keine Namen. `source` von `xp.gained` ist `poke`, `food`,
`drink`, `event` (Event-Code) oder `partner`.

## Admin

`POST /admin/api/login` mit `{"secret"}` setzt ein Cookie, das Skripte nicht lesen können. Es gilt 30
Minuten und verlängert sich mit jeder Anfrage. `POST /admin/api/logout` löscht es in diesem Browser.

| Weg                                              | Körper                                    |
| ------------------------------------------------ | ----------------------------------------- |
| `GET /admin/api/players?search=`                 |                                           |
| `POST /admin/api/players/{id}/hide`, `/show`     |                                           |
| `POST /admin/api/players/{id}/reset-name`        |                                           |
| `POST /admin/api/players/{id}/rotate-token`      | Antwort: `{"token"}`, nur dieses eine Mal |
| `DELETE /admin/api/players/{id}`                 |                                           |
| `GET`, `POST /admin/api/lans`                    | `{"slug","name","timezone","join_code","starts_at","ends_at"}` |
| `PUT /admin/api/lans/{id}/rules`                 | Alle Felder aus `rules.json`              |
| `GET /admin/api/lans/{id}/event-codes`           |                                           |
| `POST /admin/api/event-codes`                    | `{"lan_id","title","code","xp","valid_from","valid_until"}` |
| `POST /admin/api/awards`                         | `{"player_id","title","cosmetic_key"}`    |
| `GET /admin/api/actions`                         | Antwort: die letzten 200 Admin-Aktionen   |
| `GET /admin/api/lans/{id}/areas`                 | Antwort: `{"areas","assignments"}`        |
| `POST /admin/api/lans/{id}/areas`                | `{"x","y","width","height","kind"}`       |
| `PUT`, `DELETE /admin/api/lans/{id}/areas/{area}` | `{"x","y","width","height","kind"}` bei `PUT` |
| `PUT /admin/api/lans/{id}/players/{player}/area` | `{"area_id"}` von `seats`, `stage` oder `lounge`, `null` entfernt ihn |

Beim Bearbeiten eines Bereichs bleiben seine Jellies zugeordnet, solange dort Jellies stehen können.
Wird er gelöscht oder zu `desk`, `cable` oder `snackbar`, verlieren sie ihn und stehen in der Lounge,
bis ein Admin sie neu zuweist.

# Jelly-Server: API

Dies ist der Überblick für Menschen. Der genaue Vertrag zwischen Server, App und Bühne ist
[`openapi.json`](openapi.json) (OpenAPI 3.0). Er wird aus dem Go-Code erzeugt, ein Test verhindert
Abweichungen, und laufende Server liefern ihn unter `GET /v1/openapi-3.0.json`. Regelfälle zum
Mittesten stehen in [`testdata/contract/rules.json`](../testdata/contract/rules.json). Die Datei kann auch von
Tests in anderen Sprachen gelesen werden.

Aktuelle Version: **1.0.0**

## Versionen

- **Pfad:** Alle Wege für App und Bühne beginnen mit `/v1`. Erweiterungen bleiben dort. Nur eine
  Änderung, die den Vertrag bricht und ein Umschreiben im Client verlangt, bekommt einen neuen Pfad.
- **Nummer:** Jedes Feature erhöht die Version im Dokument (1.1, 1.2 und so weiter).
- **Mindestversion:** `GET /version` nennt `api_version` und `min_client_version` und braucht kein
  Konto. Die App fragt den Weg beim Start ab und bittet um ein Update, wenn sie älter ist. Leer heißt
  keine Vorgabe, sonst hat der Wert die Form `1.2.3`. Der Weg liegt absichtlich außerhalb von `/v1`,
  bleibt in jeder Version gleich und gehört trotzdem zum Vertrag.
- **Clients** ignorieren unbekannte Felder in Antworten, unbekannte Ereignisse, Katalog-Einträge und
  Fehlercodes, denn alles das darf jederzeit dazukommen. Bei einem unbekannten Fehlercode zeigen sie
  `message`.
- `/health` und `/admin/api` gehören nicht zum Vertrag. Sie sind nicht versioniert und ändern sich mit
  der Admin-Seite.

### Changelog

| Version | Änderung |
| ------- | -------- |
| 1.0.0   | Erste Version: Mindestversion, LAN-Status, Konten, Stupser, Lebenszeichen, Berichte, Event-Codes, Emotes, Partner-Emotes, Schilder, Stellen zu einem Jelly, Bühne und Ereignisse |

### Brechende Änderungen

Bisher keine. Jede künftige steht hier mit Begründung.

## Grundlagen

- Anfragen und Antworten sind JSON, Anfragen höchstens 4 KiB. Ein anderer `Content-Type` als
  `application/json` ergibt 415, also auch der Standard von `curl -d`. Unbekannte Felder in Anfragen
  sind ein Fehler. Ein zu großer Körper ergibt 413, ein zu langsamer 408.
- Jeder Spieler hat ein Limit von 300 Anfragen pro Minute. Code-Versuche (Beitritt, Event-Code,
  Partner-Code) sind auf 10 pro Minute begrenzt. Darüber folgt `429 rate_limited`. Wege in den Tabellen stehen ohne das Präfix `/v1`, außer bei `/health`, `/version` und `/admin/api`.
- Zeiten sind UTC in Unix-Millisekunden. Nur der Server vergibt sie.
- Spieler senden `Authorization: Bearer <token>`. Die Bühne nutzt den Bühnenschlüssel als `?key=`.
- Admins melden sich an und erhalten ein Cookie, siehe [Admin](#admin).
- Clients senden nur Absichten. XP, Zeiten und Freischaltungen bestimmt der Server.

### Fehler

Jeder Fehler vom Server hat diese Form, nur ein Proxy davor kann anders antworten. `code` ist stabil und für Programme gedacht, `message` wird angezeigt.

```json
{ "error": { "code": "name_taken", "message": "Dieser Name ist schon vergeben." } }
```

| Status | Code                                      | Bedeutung                                 |
| ------ | ----------------------------------------- | ----------------------------------------- |
| 400    | `invalid_body`                            | Kein gültiges JSON                        |
| 408, 413 | `invalid_body`                          | Körper zu langsam oder zu groß            |
| 415    | `invalid_body`                            | `Content-Type` ist nicht JSON             |
| 422    | `invalid_body`                            | Unbekanntes oder fehlendes Feld, falscher Typ |
| 400    | `invalid_input`, `invalid_rules`          | Admin-Angaben oder `since` sind ungültig  |
| 400    | `invalid_area`                            | Bereich passt nicht auf die Bühne         |
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
| 404    | `not_found`                               | Weg unter `/v1` gibt es nicht oder nicht mit dieser Methode |
| 409    | `name_taken`, `lan_overlap`               | Steht im Konflikt mit Vorhandenem         |
| 409    | `no_active_lan`, `not_joined`             | Gerade keine LAN oder keine Teilnahme     |
| 409    | `lan_full`                                | Die LAN hat ihr Spieler-Limit erreicht    |
| 409    | `already_joined`, `cosmetic_locked`       | Schon dabei oder noch nicht freigeschaltet |
| 409    | `event_code_redeemed`, `event_code_exists` | Event-Code schon eingelöst oder vorhanden |
| 409    | `emote_cooldown`, `report_cooldown`       | Zu früh wiederholt                        |
| 409    | `report_limit`, `partner_codes_busy`      | Limit erreicht, später erneut versuchen   |
| 429    | `rate_limited`                            | Zu viele Versuche                         |
| 500    | `internal`                                | Fehler auf dem Server                     |

### Stand eines Spielers

`GET /me` und die meisten Aktionen liefern diesen Stand.

```json
{
  "server_time": 1795000000000,
  "last_event_id": 42,
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

- `lan` ist die jüngste LAN des Kontos, nicht unbedingt die laufende. Ob eine läuft, sagt
  `GET /lans/current`. `xp` und `level` gelten für diese LAN, `total_xp` über alle LANs.
- `next_poke_at`, `reports`, `sign` und `follow_player_id` sind außerhalb einer aktiven LAN `null`.
- `server_time` gilt für Countdowns statt der Uhr des Geräts. `food_ready_at` und `drink_ready_at`
  sind 0, wenn noch nichts gemeldet wurde.
- `cosmetics` sind die Schlüssel, die der Spieler tragen darf.
- Rekord-Achievements wie Marathon tragen zusätzlich `best` und `record_unit`.

## Spieler

| Weg                       | Körper                                     | Antwort                        |
| ------------------------- | ------------------------------------------ | ------------------------------ |
| `GET /health` (ohne `/v1`) |                                           | `{"status":"ok"}`              |
| `GET /version` (ohne `/v1`) |                                          | `{"api_version","min_client_version"}` |
| `GET /catalog`            |                                            | Feste Listen, siehe unten      |
| `GET /lans/current`       |                                            | `{"server_time","current","next","joined"}` |
| `POST /register`          | `{"code","name","color"}`                  | `201 {"token","me"}`           |
| `POST /lans/current/join` | `{"code"}`                                 | Stand                          |
| `GET /me`                 |                                            | Stand                          |
| `PATCH /me`               | `{"name","color","cosmetic"}`, alle optional | Stand                        |
| `POST /presence`          |                                            | Stand                          |
| `POST /actions`           | `{"action":"poke"}`, auch `food`, `drink`  | `{"xp_gained","me"}`           |
| `POST /event-codes/redeem` | `{"code"}`                                | `{"title","xp_gained","me"}`   |
| `POST /emote`             | `{"key"}`                                  | Stand                          |
| `PUT /sign`               | `{"key"}`                                  | Stand                          |
| `DELETE /sign`            |                                            | Stand                          |
| `PUT /follow`             | `{"player_id"}`                            | Stand                          |
| `DELETE /follow`          |                                            | Stand                          |

Das Token gibt es nur in der Antwort von `POST /register`. `GET /catalog` liefert `colors`,
`emotes`, `partner_emotes`, `signs`, `cosmetics` und `achievements`, geheime Achievements fehlen dort.

Namen haben 1 bis 24 Zeichen aus lateinischen Buchstaben, Umlauten, `ß`, Ziffern, Leerzeichen und
`. _ ' -`, darunter mindestens ein Buchstabe oder eine Ziffer. Der Präfix `Jelly-` ist für den Admin
reserviert. `"cosmetic":""` legt ein Cosmetic ab, `null` lässt es unverändert. Ein leeres `PATCH /me`
ändert nichts und sendet nichts.

**Anwesenheit:** XP gibt es nur per `POST /actions`, also per Klick. Solange die App läuft, sendet sie
alle paar Minuten `POST /presence`. Das gibt keine XP und hält das Jelly auf der Bühne. Spätestens
`presence_window` nach der letzten Aktion gilt es sonst als abwesend.

**Nach einem Netzfehler** zuerst `GET /me` lesen und nicht blind wiederholen. Die Aktion kann schon
gezählt haben, eine Wiederholung ergibt dann einen Fehler wie `report_cooldown`. `401` heißt, das Token
gilt nicht mehr. Der Admin kann ein neues erzeugen, die App löscht ihres aber nie wegen eines
Netzfehlers.

Der Server darf ein `PUT /follow` später von sich aus beenden, also zählt immer `follow_player_id` im
Stand. Ein zu früher Stupser ist kein Fehler, sondern ergibt `xp_gained: 0`. Die App muss den Server nur
ansprechen, wenn `next_poke_at` erreicht ist.

### Partner-Emotes

A startet ein Emote und nennt B den Code. Es gibt keine Einladung, also auch nichts zu spammen.

| Weg                       | Körper    | Antwort                                  |
| ------------------------- | --------- | ---------------------------------------- |
| `POST /partner-emote`     | `{"key"}` | `{"code","key","expires_at","me"}`       |
| `POST /partner-emote/join` | `{"code"}` | `{"key","partner_id","xp_gained","me"}` |

- Der Code hat 4 Ziffern und gilt `partner_code_seconds` lang. Ein neuer Code ersetzt den alten.
- Beide erhalten `partner_xp` einmal je Partner und LAN. Danach ist `xp_gained` 0.
- Versuche sind je Spieler begrenzt, danach folgt `429 rate_limited`.
- A erfährt vom Beitritt aus dem Stream: `partner.emote` trägt B als `player_id` und A als `partner_id`.
  Danach `GET /me` lesen, die XP kommen als eigenes `xp.gained`. Ist einer von beiden ausgeblendet,
  gibt es kein Ereignis.

## Bühne

`GET /stage` nimmt den Bühnenschlüssel oder ein Spieler-Token:

```json
{
  "last_event_id": 42,
  "server_time": 1795000000000,
  "areas": [{ "id": 1, "x": 0, "y": 0, "width": 50, "height": 100 }],
  "players": [{
    "id": 1, "name": "Glibber", "color": "mint", "cosmetic": null, "level": 1,
    "sign": null, "follow_player_id": null, "last_seen_at": 1795000000000,
    "area_id": 1, "home_x": 24.2, "home_y": 61.8
  }]
}
```

- Bereiche und Heimplätze sind Prozentwerte der Bühne. Bereiche haben keine Namen.
- Jeder Jelly bekommt im Bereich den nächsten freien Platz in der Reihenfolge der Spieler-IDs. Ohne
  Bereich gilt die ganze Bühne. Abwesende behalten ihren Platz, Neue verschieben niemanden.
- Mit `server_time` berechnen alle Bildschirme denselben Weg.

`GET /events/stream` sendet Ereignisse als SSE und nimmt ebenfalls Schlüssel oder Token. Der Stream ist
für alle gleich, das eigene Jelly filtert der Client über `player_id`.

- **Start:** erst `GET /me` oder `GET /stage` lesen, dann den Stream mit `?since=<last_event_id>` öffnen.
  So geht nichts verloren. Ohne Angabe beginnt er beim neuesten Ereignis.
- **Wiederverbinden:** `Last-Event-ID` hat Vorrang vor `since`. Spieler können höchstens 1000 Ereignisse
  zurückgehen, danach zählt wieder der Stand aus `GET /me`.
- **Grenzen:** Eine App hält einen Stream offen. Je LAN gelten `max_player_streams` je Spieler und
  `max_streams` für alle Spieler zusammen, darüber folgt `429 rate_limited`. Jeder Versuch zählt zudem
  zum Limit von 300 Anfragen pro Minute. Die Bühne zählt nicht mit.
- **Abbruch:** Wer zehn Sekunden lang keine Daten annimmt, verliert die Verbindung. Alle 15 Sekunden kommt ein Kommentar als Lebenszeichen. Beim Herunterfahren endet die
  Verbindung ohne Meldung, also mit Pause neu verbinden, aber nach `401` nicht.

| Ereignis                                          | Bedeutung                          |
| ------------------------------------------------- | ---------------------------------- |
| `player.active`, `player.updated`                 | Jelly kam dazu oder wurde geändert |
| `player.hidden`, `player.removed`                 | Jelly ist weg                      |
| `xp.gained`, `level.up`                           | Fortschritt                        |
| `achievement.earned`, `award.given`               | Auszeichnung                       |
| `emote`, `partner.emote`                          | Emote, Partner-Emote mit `partner_id` |
| `sign.changed`, `follow.changed`                  | Schild oder Standort               |
| `stage.changed`                                   | Raumkarte geändert, Stand neu laden |

Ereignisse tragen IDs und Schlüssel, aber keine Namen. Die Nutzlast `payload` hängt vom Typ ab:

| Ereignis                                          | `player_id` | `payload`                         |
| ------------------------------------------------- | ----------- | --------------------------------- |
| `player.active`, `player.hidden`                  | Spieler     | `{}`                              |
| `player.updated`                                  | Spieler     | `{}` oder `{"edited":true}`, wenn der Spieler selbst geändert hat |
| `player.removed`                                  | `null`      | `{"player_id"}`                   |
| `xp.gained`                                       | Spieler     | `{"amount"}`                      |
| `level.up`                                        | Spieler     | `{"level"}`                       |
| `achievement.earned`, `emote`                     | Spieler     | `{"key"}`                         |
| `award.given`                                     | Spieler     | `{"title"}`, Freitext vom Admin   |
| `partner.emote`                                   | B           | `{"key","partner_id"}`, `partner_id` ist A |
| `sign.changed`                                    | Spieler     | `{"key"}`, `null` beim Senken     |
| `follow.changed`                                  | Spieler     | `{"target_id"}`, `null` beim Weggehen |
| `stage.changed`                                   | `null`      | `{}`                              |

## Admin

Admin-Wege prüfen Anfragen eigenständig: Ein unbekanntes Feld oder ein zu großer Körper ergibt dort 400.

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
| `PUT /admin/api/lans/{id}/join-code`             | `{"join_code"}`                           |
| `GET /admin/api/lans/{id}/event-codes`           |                                           |
| `POST /admin/api/event-codes`                    | `{"lan_id","title","code","xp","valid_from","valid_until"}` |
| `POST /admin/api/awards`                         | `{"player_id","title","cosmetic_key"}`    |
| `GET /admin/api/actions`                         | Antwort: die letzten 200 Admin-Aktionen   |
| `GET /admin/api/lans/{id}/areas`                 | Antwort: `{"areas","assignments"}`        |
| `POST /admin/api/lans/{id}/areas`                | `{"x","y","width","height"}`              |
| `PUT`, `DELETE /admin/api/lans/{id}/areas/{area}` | `{"x","y","width","height"}` bei `PUT`   |
| `PUT /admin/api/lans/{id}/players/{player}/area` | `{"area_id"}`, `null` entfernt ihn        |

Beim Bearbeiten eines Bereichs bleiben seine Jellies zugeordnet. Wird er gelöscht, stehen sie auf der
ganzen Bühne, bis ein Admin sie neu zuweist.

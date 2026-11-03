# Jelly-Server: API

Dies ist der Überblick für Menschen. Der genaue Vertrag zwischen Server, App und Bühne ist
[`openapi.json`](openapi.json) (OpenAPI 3.0). Er wird aus dem Go-Code erzeugt, ein Test verhindert
Abweichungen, und laufende Server liefern ihn unter `GET /v1/openapi-3.0.json`. Regelfälle zum
Mittesten stehen in [`testdata/contract/rules.json`](../testdata/contract/rules.json). Die Datei kann auch von
Tests in anderen Sprachen gelesen werden.

Aktuelle Version: **1.5.0**

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
| 1.5.0   | Jellies machen nach einem Neustart des Servers an ihrer letzten Position weiter |
| 1.4.0   | Stapel (`POST /stacks`, `POST /stacks/members`, `DELETE /stacks/current`, `stacks` in `GET /stage`, `level` im Weg), `POST /highlights`, Achievements `lighthouse` und `lighthouse-light`. Keine Route antwortet mehr mit `501` |
| 1.3.0   | `POST /trips/goto`, Folgen endet von selbst (`follow_until`, `follow_seconds`), `409 too_far` bei Partner-Emotes (`near_distance`), Achievement `conga`, `trip` im Stand |
| 1.2.0   | Der Server plant die Wege: `moves` in `GET /stage`, Nachricht `move` und `?topics=` im Stream, Regel `snack_run_seconds` |
| 1.1.0   | 3D-Bühne: Bereiche haben eine Art (`kind`), `xp.gained` nennt seine Quelle (`source`) |
| 1.0.0   | Erste Version: Mindestversion, LAN-Status, Konten, Stupser, Lebenszeichen, Berichte, Event-Codes, Emotes, Partner-Emotes, Schilder, Stellen zu einem Jelly, Bühne und Ereignisse |

### Brechende Änderungen

Bisher keine. Jede künftige steht hier mit Begründung.

## Grundlagen

- Anfragen und Antworten sind JSON, Anfragen höchstens 4 KiB. Ein anderer `Content-Type` als
  `application/json` ergibt 415, also auch der Standard von `curl -d`. Unbekannte Felder in Anfragen
  sind ein Fehler. Ein zu großer Körper ergibt 413, ein zu langsamer 408.
- Jeder Spieler hat ein Limit von 300 Anfragen pro Minute. Code-Versuche (Event-Code, Partner-Aufforderung) sind auf 10 pro Minute begrenzt. Darüber folgt `429 rate_limited`. Wege in den Tabellen stehen ohne das Präfix `/v1`, außer bei `/health`, `/version` und `/admin/api`.
- Zeiten sind UTC in Unix-Millisekunden. Nur der Server vergibt sie.
- Spieler senden `Authorization: Bearer <secret>`. Die Bühne nutzt den Bühnenschlüssel als `?key=`.
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
| 400    | `invalid_area`                            | Bereich passt nicht auf die Bühne oder hat keine bekannte Art |
| 400    | `invalid_name`, `invalid_color`           | Name oder Farbe sind ungültig             |
| 400    | `unknown_slot`, `unknown_cosmetic`, `invalid_cosmetic_color` | Cosmetic passt nicht |
| 400    | `unknown_action`, `unknown_emote`         | Eintrag steht nicht in der festen Liste   |
| 400    | `unknown_partner_emote`, `unknown_sign`   | Eintrag steht nicht in der festen Liste   |
| 400    | `invalid_event_code`                      | Code unbekannt oder außerhalb seiner Zeit |
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
| 409    | `code_redeemed`, `cosmetic_locked`        | Code schon benutzt oder Cosmetic noch nicht frei |
| 409    | `area_occupied`                           | Bereich hat mehrere Jellies, kein Sitzplatz-Code möglich |
| 409    | `event_code_redeemed`, `event_code_exists` | Event-Code schon eingelöst oder vorhanden |
| 409    | `emote_cooldown`, `report_cooldown`       | Zu früh wiederholt                        |
| 409    | `report_limit`      | Limit erreicht, später erneut versuchen   |
| 409    | `area_not_assignable`                     | In diesem Bereich kann kein Jelly stehen  |
| 429    | `rate_limited`                            | Zu viele Versuche                         |
| 500    | `internal`                                | Fehler auf dem Server                     |

### Stand eines Spielers

`GET /players/me` und die meisten Aktionen liefern diesen Stand.

```json
{
  "server_time": 1795000000000,
  "last_event_id": 42,
  "id": 1,
  "name": "Glibber",
  "color": "mint",
  "equipped": { "head": { "key": "beanie", "color": "#4cc9f0" } },
  "hidden": false,
  "lan": { "slug": "ucb-2026", "name": "UCB LAN 2026", "active": true },
  "xp": 3,
  "level": 1,
  "total_xp": 3,
  "next_poke_at": 1795000900000,
  "reports": { "food_ready_at": 0, "drink_ready_at": 0, "reports_left": 8 },
  "sign": null,
  "follow_player_id": null,
  "follow_until": null,
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

## Anmeldung

Ein einziger Weg tauscht einen Code gegen ein Secret. Danach zählt nur noch das Secret, der Code ist wertlos.

| Fall | Admin | `POST /auth/redeem` | Ergebnis |
| ---- | ----- | ------------------- | -------- |
| Neuer Sitzplatz | Erzeugt den Code für den Platz | `{"code","name","color"}` | Neues Konto auf dem Platz |
| Code oder Secret verloren | Erzeugt am Platz einen neuen Code | `{"code"}` | Vorhandenes Konto mit Inventar, altes Secret ungültig |
| Spätere LAN | Erzeugt einen Code für das Konto | `{"code"}` | Vorhandenes Konto auf dem neuen Platz, altes Secret ungültig |
| Gemeinsamer Code der LAN | | `{"code","name","color"}` | Neues Konto ohne Platz, für Tests und als Notlösung |
| Code schon benutzt | | | `409 code_redeemed` |

Ein Sitzplatz ist ein Bereich der Art `seats` mit einem Code. Geht die Antwort verloren, ist der Code
verbraucht und der Admin vergibt einen neuen.

Nach der LAN darf das Secret den eigenen Stand, Profil und Katalog lesen sowie Name, Farbe und Cosmetics
ändern. Bühne, Stream und alles mit XP antworten `409 no_active_lan` oder `not_joined`.

## Spieler

| Weg                       | Körper                                     | Antwort                        |
| ------------------------- | ------------------------------------------ | ------------------------------ |
| `GET /health` (ohne `/v1`) |                                           | `{"status":"ok"}`              |
| `GET /version` (ohne `/v1`) |                                          | `{"api_version","min_client_version"}` |
| `GET /catalog`            |                                            | Feste Listen, siehe unten      |
| `GET /lans/current`       |                                            | `{"server_time","current","next","joined"}` |
| `POST /auth/redeem`       | `{"code","name","color"}`                  | `{"secret","me"}`              |
| `GET /players/me`         |                                            | Stand                          |
| `PATCH /players/me`       | `{"name","color"}`, alle optional          | Stand                          |
| `PUT /cosmetics/equipped` | `{"slot","key","color"}`, ohne `key` leert den Platz | Stand                |
| `GET /players`            | `?cursor=&limit=`                          | `{"items","next_cursor"}`      |
| `GET /players/{id}`       |                                            | Profil: XP, Achievements, Cosmetics |
| `POST /presence`          |                                            | Stand                          |
| `POST /pokes`             |                                            | `{"xp_gained","me"}`           |
| `POST /reports`           | `{"kind"}`, `food` oder `drink`            | `{"xp_gained","me"}`           |
| `POST /event-codes/redemptions` | `{"code"}`                                | `{"title","xp_gained","me"}`   |
| `POST /emotes`            | `{"key"}`                                  | Stand                          |
| `PUT /signs/current`      | `{"key"}`                                  | Stand                          |
| `DELETE /signs/current`   |                                            | Stand                          |
| `POST /trips/goto`        | `{"x","y"}`                                | Stand                          |
| `POST /stacks`            |                                            | `{"stack","me"}`               |
| `POST /stacks/members`    | `{"stack_id"}`                             | `{"stack","me"}`               |
| `DELETE /stacks/current`  |                                            | Stand                          |
| `POST /highlights`        | `{"player_id"}`                            | Stand                          |
| `POST /trips/follow`      | `{"player_id"}`                            | Stand                          |
| `DELETE /trips/current`   |                                            | Stand                          |

Das Secret gibt es nur in der Antwort von `POST /auth/redeem`. `GET /catalog` liefert `colors`,
`emotes`, `partner_emotes`, `signs`, `cosmetics`, `cosmetic_slots`, `cosmetic_colors` und `achievements`, geheime Achievements fehlen dort.

Namen haben 1 bis 24 Zeichen aus lateinischen Buchstaben, Umlauten, `ß`, Ziffern, Leerzeichen und
`. _ ' -`, darunter mindestens ein Buchstabe oder eine Ziffer. Der Präfix `Jelly-` ist für den Admin
reserviert. Plätze für Cosmetics sind `head`, `hands`, `body`, `face` und `aura`, je Platz eines. Einfärbbare Cosmetics (`colorable`) nehmen eine Farbe aus `cosmetic_colors`. Ein leeres `PATCH /players/me`
ändert nichts und sendet nichts.

**Anwesenheit:** XP gibt es nur per `POST /pokes`, also per Klick. Solange die App läuft, sendet sie
alle paar Minuten `POST /presence`. Das gibt keine XP und hält das Jelly auf der Bühne. Spätestens
`presence_window` nach der letzten Aktion gilt es sonst als abwesend.

**Nach einem Netzfehler** zuerst `GET /players/me` lesen und nicht blind wiederholen. Die Aktion kann schon
gezählt haben, eine Wiederholung ergibt dann einen Fehler wie `report_cooldown`. `401` heißt, das Secret
gilt nicht mehr. Die App fragt dann nach einem neuen Code, sie löscht ihr Secret aber nie wegen eines
Netzfehlers.

Der Server darf ein `POST /trips/follow` später von sich aus beenden, also zählt immer `follow_player_id` im
Stand. Ein zu früher Stupser ist kein Fehler, sondern ergibt `xp_gained: 0`. Die App muss den Server nur
ansprechen, wenn `next_poke_at` erreicht ist.

### Partner-Emotes

A fordert ein anderes Jelly auf, B bestätigt oder lehnt ab.

| Weg                       | Körper                                     | Antwort                        |
| ------------------------- | ------------------------------------------ | ------------------------------ |
| `POST /partner-emotes`    | `{"key","partner_ids"}`, vorerst genau ein Jelly | `{"partner_emote","xp_gained","me"}` |
| `PATCH /partner-emotes`   | `{"id","state"}`                           | `{"partner_emote","xp_gained","me"}` |
| `GET /partner-emotes`     |                                            | `{"items","next_cursor"}`      |

- B erfährt davon aus dem Stream über `partner_emote.updated` und zeigt sein Pop-up, die App filtert über `partner_ids`.
- B sendet `accepted` oder `declined`, A kann mit `cancelled` zurückziehen. Eine Aufforderung gilt `partner_invite_seconds` lang.
- Je Paar gibt es eine offene Aufforderung, sonst `409 partner_emote_open`. Vorbei ergibt `409 partner_emote_closed`.
- Beide erhalten `partner_xp` einmal je Partner und LAN. Danach ist `xp_gained` 0.
- Nach dem Bestätigen folgt `partner.emote` mit B als `player_id` und A als `partner_id`. Ist einer von beiden
  ausgeblendet, gibt es kein Ereignis.
- Nur wer nah genug steht, kann auffordern: Beim Absenden dürfen beide Jellies höchstens `near_distance` auseinander
  sein, sonst folgt `409 too_far`. Die Angabe zählt in Jelly-Einheiten. Ein Jelly ist etwa 1,7 breit, die Halle 21
  breit und 40 tief. Ein Jelly, das gerade nicht auf der Bühne steht, ist immer zu weit weg.

### Ausflug und Folgen

- `POST /trips/goto` schickt das Jelly zu einem Punkt, `x` und `y` sind Prozentwerte der Bühne. Es läuft zur freien
  Stelle am nächsten dran und nach `trip_seconds` zurück auf seinen Platz. `trip` im Stand nennt `x`, `y` und `until`.
  Punkte außerhalb der Bühne ergeben `400 invalid_trip`.
- `POST /trips/follow` läuft einem anderen Jelly nach. Bekommt das Ziel einen neuen Weg, plant der Server selbst nach.
  Nach `follow_seconds` läuft das Jelly zurück auf seinen Platz, `follow_until` im Stand nennt die Zeit. Dann werden
  `follow_player_id` und `follow_until` ohne eigenes Ereignis wieder `null`. Dasselbe Jelly erneut zu wählen verlängert
  nichts, ein anderes Jelly startet die Zeit neu. Einen Kreis aus Folgenden lehnt der Server mit `400 invalid_follow` ab.
- `DELETE /trips/current` beendet beides sofort. Ausflug und Folgen schließen sich aus, das Neue beendet das Alte.
- Das Achievement `conga` gibt es, wenn mehrere demselben Jelly folgen oder man jemandem folgt, der selbst folgt.

### Stapel und Hervorheben

- `POST /stacks` beginnt einen Stapel an der eigenen Stelle, `POST /stacks/members` mit `{"stack_id"}` klettert oben
  auf einen Stapel in der Nähe, sonst `409 too_far`. Beide antworten mit `{"stack","me"}`.
- `DELETE /stacks/current` steigt ab, die Jellies darüber rutschen nach. Ausflug und Folgen beenden den Stapelplatz,
  und wer klettert, beendet Ausflug und Folgen.
- Laufende Stapel stehen als `stacks` in `GET /stage`, `member_ids` geht von unten nach oben. Nach `stack_seconds`
  fällt ein Stapel auseinander, höher als `stack_max_members` wird er nicht (`409 stack_full`). Ist er weg, folgt
  `404 stack_not_found`. Jede Änderung meldet `stack.changed`.
- `level` im Weg zählt die Jellies darunter. Erst wenn ein Jelly am Ende seines Wegs ankommt, steht es auf dieser Höhe.
- `POST /highlights` mit `{"player_id"}` lässt ein Jelly für `highlight_seconds` aufleuchten, auch das eigene.
  Danach folgt das nächste erst nach `highlight_cooldown`, sonst `409 highlight_cooldown`.
- Wird die Spitze eines Stapels mit mindestens zwei Jellies hervorgehoben, bekommen alle darauf `lighthouse` und die
  Spitze zusätzlich `lighthouse-light`.

## Bühne

`GET /stage` nimmt den Bühnenschlüssel oder ein Spieler-Token:

```json
{
  "last_event_id": 42,
  "server_time": 1795000000000,
  "room": { "width": 100, "height": 100, "unit": "percent" },
  "areas": [{ "id": 1, "x": 0, "y": 0, "width": 50, "height": 100, "kind": "seats" }],
  "players": [{
    "id": 1, "name": "Glibber", "color": "mint", "equipped": {}, "level": 1,
    "sign": null, "follow_player_id": null, "follow_until": null, "last_seen_at": 1795000000000,
    "area_id": 1, "trip": null, "home_x": 24.2, "home_y": 61.8
  }],
  "moves": [{
    "player_id": 1, "kind": "wander", "start_at": 1795000001000,
    "points": [{ "x": 24.2, "y": 61.8, "t": 0 }, { "x": 27.4, "y": 58, "t": 2400 }]
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

### Wege

Der Server plant, wo die Jellies laufen. Bühne und Apps spielen die Wege nur ab, so zeigen alle Bildschirme
dasselbe. `moves` nennt je Jelly den aktuellen Weg, neue Wege kommen als Nachricht `move` im Stream.

- `start_at` ist Serverzeit in Millisekunden, die Uhr gleicht man über `server_time` ab. Ein neuer Weg beginnt etwa
  eine Sekunde in der Zukunft, damit er alle Bildschirme rechtzeitig erreicht.
- `points` sind Prozentwerte der Bühne, `t` zählt Millisekunden ab `start_at`. Zwischen zwei Punkten läuft das Jelly
  geradeaus, nach dem letzten steht es dort. Ein einzelner Punkt heißt: Es steht.
- Ein neuer Weg desselben Jellys ersetzt den alten. Er beginnt dort, wo das Jelly zu seinem `start_at` ist.
- `kind` nennt den Grund: `wander` (bummelt um seinen Platz oder geht dorthin zurück), `follow`, `trip`, `snack` und `stack`.
  Weitere Werte können dazukommen und sind wie `wander` zu behandeln.
- Ein Weg dauert seine Länge geteilt durch die Regel `walk_speed`, in Jelly-Einheiten pro Sekunde. Ein Jelly ist etwa
  1,7 breit, die Halle 21 breit und 40 tief.
- Nach Essen und Trinken läuft das Jelly für `snack_run_seconds` zur Theke und danach zurück. War der Weg lang, wartet
  es ab seiner Ankunft noch kurz.
- Wo ein Jelly läuft, bestimmt nur der Server. Er merkt sich die Positionen alle 30 Sekunden. Nach einem Neustart macht
  jedes Jelly dort weiter, ein neuer `move` kann also um bis zu 30 Sekunden Weg springen. Ausflug, Folgen, Stapel und
  Thekenlauf laufen auch während eines Ausfalls ab. Danach läuft das Jelly von selbst zurück zu seinem Platz.

`GET /stage/events` sendet Ereignisse und Wege als SSE und nimmt ebenfalls Schlüssel oder Token. Der Stream ist
für alle gleich, das eigene Jelly filtert der Client über `player_id`.

- **Themen:** `?topics=events`, `?topics=moves` oder `?topics=events,moves` wählen aus, ohne Angabe kommt beides.
  Unbekannte Themen ergeben `400 invalid_input`.
- **Wege:** Nachrichten vom Typ `move` haben keine ID und stehen nicht im Ereignis-Log. Jede neue Verbindung bekommt
  zuerst den aktuellen Weg jedes Jellys, nach einem Abbruch geht also nichts verloren.

- **Start:** erst `GET /players/me` oder `GET /stage` lesen, dann den Stream mit `?since=<last_event_id>` öffnen.
  So geht nichts verloren. Ohne Angabe beginnt er beim neuesten Ereignis.
- **Wiederverbinden:** `Last-Event-ID` hat Vorrang vor `since`. Spieler können höchstens 1000 Ereignisse
  zurückgehen. Liegt die ID weiter zurück, kommt zuerst `reset`, und die App liest ihren Stand neu.
- **Grenzen:** Eine App hält einen Stream offen. Je LAN gelten `max_player_streams` je Spieler und
  `max_streams` für alle Spieler zusammen, darüber folgt `429 rate_limited`. Jeder Versuch zählt zudem
  zum Limit von 300 Anfragen pro Minute. Die Bühne zählt nicht mit.
- **Abbruch:** Wer zehn Sekunden lang keine Daten annimmt, verliert die Verbindung. Alle 15 Sekunden kommt ein Kommentar als Lebenszeichen. Beim Herunterfahren endet die
  Verbindung ohne Meldung, also mit Pause neu verbinden, aber nach `401` nicht.

| Ereignis                                          | Bedeutung                          |
| ------------------------------------------------- | ---------------------------------- |
| `player.active`, `player.updated`                 | Jelly kam dazu oder wurde geändert |
| `player.hidden`, `player.removed`                 | Jelly ist weg                      |
| `xp.gained`, `level.up`                           | Fortschritt, `xp.gained` mit `{"amount","source"}` |
| `achievement.earned`, `award.given`               | Auszeichnung                       |
| `emote`, `partner.emote`                          | Emote, Partner-Emote mit `partner_id` |
| `sign.changed`, `follow.changed`, `trip.changed`  | Schild oder Standort               |
| `stack.changed`, `highlight`                      | Stapel, ein Jelly leuchtet auf     |
| `stage.changed`                                   | Raumkarte geändert, Stand neu laden |

Ereignisse tragen IDs und Schlüssel, aber keine Namen. Die Nutzlast `payload` hängt vom Typ ab:

| Ereignis                                          | `player_id` | `payload`                         |
| ------------------------------------------------- | ----------- | --------------------------------- |
| `player.active`, `player.hidden`                  | Spieler     | `{}`                              |
| `player.updated`                                  | Spieler     | `{}` oder `{"edited":true}`, wenn der Spieler selbst geändert hat |
| `player.removed`                                  | `null`      | `{"player_id"}`                   |
| `xp.gained`                                       | Spieler     | `{"amount","source"}`             |
| `level.up`                                        | Spieler     | `{"level"}`                       |
| `achievement.earned`, `emote`                     | Spieler     | `{"key"}`                         |
| `award.given`                                     | Spieler     | `{"title"}`, Freitext vom Admin   |
| `partner.emote`                                   | B           | `{"key","partner_id"}`, `partner_id` ist A |
| `partner_emote.updated`                           | Handelnder  | `{"id","key","from_id","partner_ids","state","expires_at"}` |
| `sign.changed`                                    | Spieler     | `{"key"}`, `null` beim Senken     |
| `follow.changed`                                  | Spieler     | `{"target_id"}`, `null` beim Weggehen |
| `trip.changed`                                    | Spieler     | `{"x","y","until"}`                |
| `stack.changed`                                   | Spieler     | Der Stapel, nach dem Absteigen nur `{"id"}` |
| `highlight`                                       | Spieler     | `{"target_id","until"}`            |
| `stage.changed`                                   | `null`      | `{}`                              |

`source` von `xp.gained` ist `poke`, `food`, `drink`, `event` (Event-Code) oder `partner`.

## Admin

Admin-Wege prüfen Anfragen eigenständig: Ein unbekanntes Feld oder ein zu großer Körper ergibt dort 400.

`POST /admin/api/login` mit `{"secret"}` setzt ein Cookie, das Skripte nicht lesen können. Es gilt 30
Minuten und verlängert sich mit jeder Anfrage. `POST /admin/api/logout` löscht es in diesem Browser.

| Weg                                              | Körper                                    |
| ------------------------------------------------ | ----------------------------------------- |
| `GET /admin/api/players?search=`                 |                                           |
| `POST /admin/api/players/{id}/hide`, `/show`     |                                           |
| `POST /admin/api/players/{id}/reset-name`        |                                           |
| `POST /admin/api/players/{id}/rotate-token`      | Antwort: `{"secret"}`, nur dieses eine Mal |
| `DELETE /admin/api/players/{id}`                 |                                           |
| `GET`, `POST /admin/api/lans`                    | `{"slug","name","timezone","join_code","starts_at","ends_at"}` |
| `PUT /admin/api/lans/{id}/rules`                 | Alle Felder aus `rules.json`              |
| `PUT /admin/api/lans/{id}/join-code`             | `{"join_code"}`                           |
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

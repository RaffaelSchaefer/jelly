# Jelly-Server: API

Dies ist der Überblick für Menschen. Der genaue Vertrag zwischen Server, App und Bühne ist
[`openapi.json`](openapi.json) (OpenAPI 3.0). Er wird aus dem Go-Code erzeugt, ein Test verhindert
Abweichungen, und laufende Server liefern ihn unter `GET /v1/openapi-3.0.json`. Regelfälle zum
Mittesten stehen in [`testdata/contract/rules.json`](../testdata/contract/rules.json). Die Datei kann auch von
Tests in anderen Sprachen gelesen werden.

Aktuelle Version: **1.16.0**

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
| 1.16.0  | `is_bot` in `players` von `GET /stage`: Bots der Orga, die eine Bühne kennzeichnen kann. Dazu Bots, XP und Achievements für jedes Konto in der Admin-API |
| 1.15.0  | Neues Cosmetic `headset-neutral` im Katalog, ab Level 2 frei wie `headset` |
| 1.14.0  | Einheitliche Namen: `ends_at`, `follow`, `stack_level`, `partner_id`. Weniger Fehlercodes, `unlock` im Katalog, `rules` in `GET /lans/current` samt `rules.changed`, `xp_per_level` je LAN. Alles, was endet, meldet sich per Ereignis. `PATCH /admin/api/lans/{id}/rules` ändert einzelne Regeln, der Admin-Weg `rotate-token` entfällt |
| 1.13.0  | `rotation` in `areas` und in der Kartendatei: Zonen stehen in jedem Winkel, Hindernisse und Plätze drehen sich mit |
| 1.12.0  | `gathering` in `GET /stage`, Ereignis `gathering.changed`, Wege `food` und `ceremony`: Essens-Event und Siegerehrung. `highlight` nennt `cosmetic_key`, das Hervorheben wird eine kurze Aura. `glow-aura` und `highlight-aura` im Katalog |
| 1.11.0  | Brechend: `desk`, `cable` und `snackbar` sind keine Zuweisungen mehr, sondern Props. Neu in `areas`: `blocks`, `prop`, `name`, Positionen dürfen Bruchteile haben. Neue Zuweisungen `queue`, `public`, `spectators`, `winner`. Kartenformat mit `PUT /admin/api/lans/{id}/map`. `POST /trips/goto` lehnt blockende Zonen ab, Jellies füllen die Fläche von `queue`-Zonen |
| 1.10.0  | Brechend: `POST /auth/redeem` nimmt das Secret an, das Konto tritt bei und behält es, Sitzplatz-Codes holen kein Konto mehr zurück und können an ein Konto gebunden sein, `seat_assigned` in der Antwort. Neu: `POST /auth/recover` und `POST /admin/api/players/{id}/recovery-code`. `area_occupied` entfällt |
| 1.9.0   | `docs/openapi.json` beschreibt alle Wege, Parameter und Felder, dazu alle Fehlercodes und Stream-Nachrichten. Keine Änderung am Verhalten |
| 1.8.0   | Der LAN-Code legt auch vor und nach der LAN Konten an, XP gibt es weiter nur während der LAN |
| 1.7.0   | Zonen haben im Admin einen Namen, neue Zuweisungen `visitors` und `none`, Besucher wandern (`is_visitor`), Jellies wählen die nächste Theke mit Platz |
| 1.6.0   | Annehmen eines Partner-Emotes prüft die Nähe, Stapel sind ohne Regel unbegrenzt, `golden-cup` steht im Katalog, Awards prüfen ihr Cosmetic |
| 1.5.0   | Jellies machen nach einem Neustart des Servers an ihrer letzten Position weiter |
| 1.4.0   | Stapel (`POST /stacks`, `POST /stacks/members`, `DELETE /stacks/current`, `stacks` in `GET /stage`, `level` im Weg), `POST /highlights`, Achievements `lighthouse` und `lighthouse-light`. Keine Route antwortet mehr mit `501` |
| 1.3.0   | `POST /trips/goto`, Folgen endet von selbst (`follow_until`, `follow_seconds`), `409 too_far` bei Partner-Emotes (`near_distance`), Achievement `conga`, `trip` im Stand |
| 1.2.0   | Der Server plant die Wege: `moves` in `GET /stage`, Nachricht `move` und `?topics=` im Stream, Regel `snack_run_seconds` |
| 1.1.0   | 3D-Bühne: Bereiche haben eine Art (`kind`), `xp.gained` nennt seine Quelle (`source`) |
| 1.0.0   | Erste Version: Mindestversion, LAN-Status, Konten, Stupser, Lebenszeichen, Berichte, Event-Codes, Emotes, Partner-Emotes, Schilder, Stellen zu einem Jelly, Bühne und Ereignisse |

### Brechende Änderungen

Vor der ersten LAN 2026 gibt es keinen ausgelieferten Client, deshalb bleiben diese Änderungen in `/v1`. Sie sind mit
dem Client abgestimmt. Ab der ersten LAN bekommt jede brechende Änderung einen neuen Pfad.

| Version | Änderung | Begründung |
| ------- | -------- | ---------- |
| 1.14.0  | `trip.until` und `until` bei `highlight` heißen `ends_at`, `follow_player_id` und `follow_until` werden `follow {player_id, ends_at}`, `moves[].level` heißt `stack_level` | Ein Name je Sache, das Level eines Wegs war leicht mit dem XP-Level zu verwechseln |
| 1.14.0  | `trip` und `last_seen_at` fehlen in `players` von `GET /stage` | Ziel und Art stehen im Weg, die letzte Aktivität war nur Zustand des Servers |
| 1.14.0  | `invalid_body` und `invalid_input` werden `invalid_request`, `unknown_action` wird `unknown_report_kind`, `partner_self` wird `invalid_partner`, `invalid_event_code` antwortet 403 | Codes sollen sagen, was falsch ist, falsche Codes antworten einheitlich |
| 1.14.0  | `partner_ids` wird `partner_id`, `next_cursor` fehlt bei `GET /partner-emotes` | Gruppen sind nicht geplant, die Liste ist immer vollständig |
| 1.14.0  | Katalog: `unlock` statt `requires_event`, `secret` fehlt bei Achievements | Die Freischaltung musste man erraten, `secret` war dort immer `false` |
| 1.11.0  | `kind` in `areas` nennt nur noch das Verhalten, siehe [Bühne](#bühne) | Was dort steht, kommt aus der Karte. Beides war doppelt und konnte sich widersprechen |
| 1.10.0  | `POST /auth/redeem` und Codes, siehe [Anmeldung](#anmeldung) | Ein Sitzplatz-Code öffnete sonst ein fremdes Konto. Das Secret gehört zum Konto, nicht zur LAN |

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
| 400    | `invalid_request`                            | Kein gültiges JSON                        |
| 408, 413 | `invalid_request`                          | Körper zu langsam oder zu groß            |
| 415    | `invalid_request`                            | `Content-Type` ist nicht JSON             |
| 422    | `invalid_request`                            | Unbekanntes oder fehlendes Feld, falscher Typ |
| 400    | `invalid_request`                         | Admin-Angaben, `since`, `cursor` oder `topics` sind ungültig |
| 400    | `invalid_rules`                           | Ein Wert liegt außerhalb seines Bereichs, oder `xp_per_level` wurde nach dem Start der LAN geändert. `message` nennt die Regel |
| 400    | `invalid_area`                            | Bereich passt nicht auf die Bühne oder hat keine bekannte Art |
| 400    | `invalid_map`                             | Kartenformat unbekannt, Karte zu groß oder einzelne Zonen ungültig, `message` nennt sie |
| 400    | `invalid_name`, `invalid_color`           | Name oder Farbe sind ungültig             |
| 400    | `unknown_slot`, `unknown_cosmetic`, `invalid_cosmetic_color` | Cosmetic passt nicht |
| 400    | `unknown_report_kind`, `unknown_emote`         | Eintrag steht nicht in der festen Liste   |
| 400    | `unknown_partner_emote`, `unknown_sign`   | Eintrag steht nicht in der festen Liste   |
| 400    | `invalid_follow`                          | Zu diesem Jelly kann man sich nicht stellen |
| 400    | `invalid_trip`                            | Auf diesem Punkt kann kein Jelly stehen   |
| 400    | `invalid_highlight`                       | Dieses Jelly lässt sich nicht hervorheben |
| 400    | `invalid_partner`, `invalid_partner_emote_state` | Jelly oder Antwort passen nicht zur Aufforderung |
| 401    | `unauthorized`                            | Secret oder Schlüssel fehlt oder ist falsch |
| 403    | `invalid_code`                            | Anmeldecode stimmt nicht, oder die LAN des Sitzplatz-Codes ist vorbei |
| 403    | `seat_code_other_account`                 | Sitzplatz-Code gehört zu einem anderen Konto |
| 403    | `invalid_event_code`                      | Event-Code unbekannt oder außerhalb seiner Zeit |
| 403    | `invalid_recovery_code`                   | Wiederherstellungs-Code stimmt nicht, ist benutzt oder abgelaufen |
| 403    | `forbidden`                               | Admin-Anmeldung fehlt oder ist abgelaufen |
| 404    | `player_not_found`, `lan_not_found`       | Eintrag gibt es nicht                     |
| 404    | `area_not_found`                          | Bereich gehört nicht zu dieser LAN        |
| 404    | `gathering_not_found`                     | Gerade läuft kein Essens-Event und keine Siegerehrung |
| 404    | `stack_not_found`, `partner_emote_not_found` | Stapel oder Aufforderung gibt es nicht mehr |
| 404    | `not_found`                               | Weg unter `/v1` gibt es nicht oder nicht mit dieser Methode |
| 409    | `name_taken`, `slug_taken`, `lan_overlap`, `lan_has_players` | Steht im Konflikt mit Vorhandenem |
| 409    | `no_active_lan`, `not_joined`             | Gerade keine LAN oder keine Teilnahme     |
| 409    | `lan_full`                                | Die LAN hat ihr Spieler-Limit erreicht    |
| 409    | `code_redeemed`, `cosmetic_locked`        | Code schon benutzt oder Cosmetic noch nicht frei |
| 409    | `event_code_redeemed`, `event_code_exists` | Event-Code schon eingelöst oder vorhanden |
| 409    | `emote_cooldown`, `report_cooldown`       | Zu früh wiederholt                        |
| 409    | `report_limit`      | Limit erreicht, später erneut versuchen   |
| 409    | `stack_full`, `too_far`                   | Stapel voll, oder die Jellies stehen zu weit auseinander |
| 409    | `partner_emote_open`, `partner_emote_closed` | Aufforderung läuft schon oder ist vorbei |
| 409    | `area_not_assignable`                     | In diesem Bereich kann kein Jelly stehen  |
| 429    | `rate_limited`                            | Zu viele Versuche                         |
| 500    | `internal`                                | Fehler auf dem Server                     |

### Regeln

`GET /lans/current` liefert in `rules` die Regeln der laufenden LAN, sonst der nächsten, sonst die Standardwerte. Nur die
Betriebsgrenzen `max_players`, `max_streams` und `max_player_streams` fehlen. Die App zeigt damit an, was der Server
entscheiden wird, zum Beispiel die Reichweite `near_distance` in Jelly-Einheiten oder den Fortschritt zum nächsten Level mit
`xp_per_level`. Geprüft wird trotzdem immer auf dem Server. Ändert die Orga etwas, kommt `rules.changed`.

`xp_per_level` gilt linear für jedes Level, Standard 100, und lässt sich nur bis zum Start der LAN ändern. Sonst würden
Level und Cosmetics für alle springen.

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
  "trip": null,
  "follow": { "player_id": 7, "ends_at": 1795001800000 },
  "lans_attended": 1,
  "badges": [{ "slug": "ucb-2026", "name": "UCB LAN 2026" }],
  "cosmetics": [],
  "achievements": [{ "key": "hatched", "title": "Frisch geschlüpft", "lan_slug": null, "earned_at": 1795000000000 }],
  "awards": []
}
```

- `lan` ist die jüngste LAN des Kontos, nicht unbedingt die laufende. Ob eine läuft, sagt
  `GET /lans/current`. `xp` und `level` gelten für diese LAN, `total_xp` über alle LANs.
- `next_poke_at`, `reports`, `sign`, `trip` und `follow` sind außerhalb einer aktiven LAN `null`.
- `server_time` gilt für Countdowns statt der Uhr des Geräts. `food_ready_at` und `drink_ready_at`
  sind 0, wenn noch nichts gemeldet wurde.
- `cosmetics` sind die Schlüssel, die der Spieler tragen darf. Wie man einen Eintrag bekommt, sagt `unlock` im Katalog:
  `level`, `event` (Event-Code), `award` (Preis der Orga) oder `none`. Ein Admin kann jeden Eintrag vergeben.
- Rekord-Achievements wie Marathon tragen zusätzlich `best` und `record_unit`.

## Anmeldung

Das Secret ist nur die Anmeldung des Kontos und hat nichts mit einer LAN zu tun. Über die Teilnahme entscheiden der
LAN-Code und der Sitzplatz-Code der jeweiligen LAN. `POST /auth/redeem` nimmt beide, das Secret steht wie sonst im
Header `Authorization`.

| Code | Mit Secret | Ohne Secret |
| ---- | ---------- | ----------- |
| LAN-Code | Das Konto nimmt an der LAN teil, ohne Sitz | Neues Konto, nimmt an der LAN teil, ohne Sitz |
| Sitzplatz-Code | Das Konto nimmt an der LAN teil und bekommt den Sitz | Neues Konto auf dem Sitz |
| Sitzplatz-Code, an ein anderes Konto gebunden | `403 seat_code_other_account` | `403 seat_code_other_account` |

- Ein neues Konto braucht `name` und `color`. Ein vorhandenes behält sein Secret, die Antwort nennt es noch einmal.
- Beide Codes gelten vor dem Start. Das Konto ist dann angemeldet, XP, Badge und Bühne gibt es erst, wenn es während der
  LAN aktiv wird. Ein Admin kann ihm schon vorher einen Platz geben.
- Nach dem Ende legt der LAN-Code nur ein Konto an. Ein Sitzplatz-Code ergibt dann `403 invalid_code`.
- Ein Sitzplatz-Code gilt einmal, danach folgt `409 code_redeemed`. Ohne Bindung gehört er dem ersten Konto, das ihn
  einlöst. Die Orga kann ihn über `player_id` an ein Konto binden, die Spieler schicken dafür die `id` aus ihrem Stand mit.
- Ein abgelehnter Code bleibt gültig, damit ein Fremder ihn nicht entwerten kann.
- **Kein Sitz:** Ist der Sitz belegt oder hat das Konto in dieser LAN schon einen anderen, ist der Code trotzdem
  verbraucht und das Konto nimmt an der LAN teil. Die Antwort sagt `seat_assigned: false`, und die Orga weist den Platz von
  Hand zu. Freie Sitze vergibt der Server nie selbst, das würde den Sitzplan durcheinanderbringen.

**Secret verloren:** Die Orga sucht das Konto und erzeugt einen Wiederherstellungs-Code. `POST /auth/recover` tauscht
ihn gegen ein neues Secret, das alte gilt ab dann nicht mehr. Der Code gilt einmal, unabhängig von LANs und Sitzen. Er
läuft nach der beim Erzeugen gewählten Zeit ab, ohne Angabe nach 24 Stunden. Ein neuer ersetzt den älteren des Kontos.

Geht die Antwort verloren, ist ein Sitzplatz-Code verbraucht und der Admin vergibt einen neuen.

Nach der LAN darf das Secret den eigenen Stand, Profil und Katalog lesen sowie Name, Farbe und Cosmetics
ändern. Bühne, Stream und alles mit XP antworten `409 no_active_lan` oder `not_joined`.

## Spieler

| Weg                       | Körper                                     | Antwort                        |
| ------------------------- | ------------------------------------------ | ------------------------------ |
| `GET /health` (ohne `/v1`) |                                           | `{"status":"ok"}`              |
| `GET /version` (ohne `/v1`) |                                          | `{"api_version","min_client_version"}` |
| `GET /catalog`            |                                            | Feste Listen, siehe unten      |
| `GET /lans/current`       |                                            | `{"server_time","current","next","joined"}` |
| `POST /auth/redeem`       | `{"code","name","color"}`, Secret optional | `{"secret","seat_assigned","me"}` |
| `POST /auth/recover`      | `{"code"}`                                 | `{"secret","me"}`              |
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

Ein neues Secret gibt es nur in der Antwort von `POST /auth/redeem` und `POST /auth/recover`. `GET /catalog` liefert `colors`,
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
gilt nicht mehr. Die App fragt dann nach einem Wiederherstellungs-Code, sie löscht ihr Secret aber nie wegen eines
Netzfehlers.

Der Server darf ein `POST /trips/follow` später von sich aus beenden, also zählt immer `follow` im
Stand. Ein zu früher Stupser ist kein Fehler, sondern ergibt `xp_gained: 0`. Die App muss den Server nur
ansprechen, wenn `next_poke_at` erreicht ist.

### Partner-Emotes

A fordert ein anderes Jelly auf, B bestätigt oder lehnt ab.

| Weg                       | Körper                                     | Antwort                        |
| ------------------------- | ------------------------------------------ | ------------------------------ |
| `POST /partner-emotes`    | `{"key","partner_id"}` | `{"partner_emote","xp_gained","me"}` |
| `PATCH /partner-emotes`   | `{"id","state"}`                           | `{"partner_emote","xp_gained","me"}` |
| `GET /partner-emotes`     |                                            | `{"items"}`, alle offenen       |

- B erfährt davon aus dem Stream über `partner_emote.updated` und zeigt sein Pop-up, die App filtert über `partner_id`.
- B sendet `accepted` oder `declined`, A kann mit `cancelled` zurückziehen. Eine Aufforderung gilt `partner_invite_seconds` lang.
- Je Paar gibt es eine offene Aufforderung, sonst `409 partner_emote_open`. Vorbei ergibt `409 partner_emote_closed`.
- Beide erhalten `partner_xp` einmal je Partner und LAN. Danach ist `xp_gained` 0.
- Nach dem Bestätigen folgt `partner.emote` mit B als `player_id` und A als `partner_id`. Ist einer von beiden
  ausgeblendet, gibt es kein Ereignis.
- Nur wer nah genug steht, kann auffordern und annehmen: In beiden Momenten dürfen die Jellies höchstens
  `near_distance` auseinander sein, sonst folgt `409 too_far`. Eine Aufforderung bleibt danach offen. Die Angabe zählt in Jelly-Einheiten. Ein Jelly ist etwa 1,7 breit, die Halle 21
  breit und 40 tief. Ein Jelly, das gerade nicht auf der Bühne steht, ist immer zu weit weg.

### Ausflug und Folgen

- `POST /trips/goto` schickt das Jelly zu einem Punkt, `x` und `y` sind Prozentwerte der Bühne. Es läuft zur freien
  Stelle am nächsten dran und nach `trip_seconds` zurück auf seinen Platz. `trip` im Stand nennt `x`, `y` und `ends_at`.
  Punkte außerhalb der Bühne oder in einer Zone mit `blocks` ergeben `400 invalid_trip`, alles andere ist erlaubt, auch ein
  fremder Platz. Öffentliche Orte findet man über `name` in `areas`.
- `POST /trips/follow` läuft einem anderen Jelly nach. Bekommt das Ziel einen neuen Weg, plant der Server selbst nach.
  Nach `follow_seconds` läuft das Jelly zurück auf seinen Platz, `follow.ends_at` im Stand nennt die Zeit. Dann wird `follow`
  wieder `null`, und `follow.changed` meldet das Ende. Dasselbe Jelly erneut zu wählen verlängert
  nichts, ein anderes Jelly startet die Zeit neu. Einen Kreis aus Folgenden lehnt der Server mit `400 invalid_follow` ab.
- `DELETE /trips/current` beendet beides sofort. Ausflug und Folgen schließen sich aus, das Neue beendet das Alte.
- Das Achievement `conga` gibt es, wenn mehrere demselben Jelly folgen oder man jemandem folgt, der selbst folgt.

### Stapel und Hervorheben

- `POST /stacks` beginnt einen Stapel an der eigenen Stelle, `POST /stacks/members` mit `{"stack_id"}` klettert oben
  auf einen Stapel in der Nähe, sonst `409 too_far`. Beide antworten mit `{"stack","me"}`.
- `DELETE /stacks/current` steigt ab, die Jellies darüber rutschen nach. Ausflug und Folgen beenden den Stapelplatz,
  und wer klettert, beendet Ausflug und Folgen.
- Laufende Stapel stehen als `stacks` in `GET /stage`, `member_ids` geht von unten nach oben. Nach `stack_seconds`
  fällt ein Stapel auseinander, ohne `stack_max_members` ist er unbegrenzt, mit gesetztem Wert folgt darüber `409 stack_full`. Ist er weg, folgt
  `404 stack_not_found`. Jede Änderung meldet `stack.changed`.
- `level` im Weg zählt die Jellies darunter. Erst wenn ein Jelly am Ende seines Wegs ankommt, steht es auf dieser Höhe.
- `POST /highlights` mit `{"player_id"}` lässt ein Jelly für `highlight_seconds` aufleuchten, auch das eigene. Das Ereignis
  nennt `cosmetic_key`, die Aura `highlight-aura` ersetzt so lange die getragene. Freischalten kann sie niemand.
  Danach folgt das nächste erst nach `highlight_cooldown`, sonst `409 highlight_cooldown`.
- Wird die Spitze eines Stapels mit mindestens zwei Jellies hervorgehoben, bekommen alle darauf `lighthouse` und die
  Spitze zusätzlich `lighthouse-light`.

## Bühne

Der Bühnenschlüssel steht bewusst in der Adresse, denn `EventSource` kann im Browser keinen Header senden. Er erlaubt nur
das Lesen und ist die einzige Ausnahme. Spieler-Secrets gehören immer in den Header.

`GET /stage` nimmt den Bühnenschlüssel oder das Secret eines Spielers:

```json
{
  "last_event_id": 42,
  "server_time": 1795000000000,
  "room": { "width": 100, "height": 100, "unit": "percent" },
  "areas": [{
    "id": 1, "x": 0, "y": 0, "width": 50, "height": 100, "rotation": 0, "kind": "seats",
    "blocks": false, "prop": "", "name": null
  }],
  "players": [{
    "id": 1, "name": "Glibber", "color": "mint", "equipped": {}, "level": 1,
    "sign": null, "follow": null, "area_id": 1, "is_visitor": false, "home_x": 24.2, "home_y": 61.8
  }],
  "stacks": [],
  "gathering": null,
  "moves": [{
    "player_id": 1, "kind": "wander", "start_at": 1795000001000, "stack_level": 0,
    "points": [{ "x": 24.2, "y": 61.8, "t": 0 }, { "x": 27.4, "y": 58, "t": 2400 }]
  }]
}
```

- Bereiche und Heimplätze sind Prozentwerte der Bühne, auch Bruchteile. Bereiche dürfen sich überlappen, etwa ein Sofa in
  der Lounge.
- `kind` ist die Zuweisung einer Zone und sagt nur, wie Jellies sie nutzen: `seats` (Plätze, mit Code ein Sitzplatz),
  `stage` (Bühne für Turniere und Public Gaming), `lounge` (Chillout-Lounge), `visitors` (Besucher-Zone), `queue` (hier
  stellen sich Jellies an), `public` (benannter Ort, zu dem man sein Jelly schicken kann), `spectators` und `winner` (für
  eine Siegerehrung) und `none` (noch nichts zugewiesen). Unbekannte Werte sind wie `none` zu behandeln.
- `prop` nennt das Modell, das dort steht, leer heißt blanker Boden. `blocks` sagt, ob Jellies außen herum laufen müssen.
  Beides kommt aus der Karte. Ein unbekanntes `prop` zeigt die Bühne als blanken Boden.
- `rotation` dreht eine Zone in Grad im Uhrzeigersinn um ihre Mitte, bei `0` zeigt die Vorderseite des Modells zur Kamera (Richtung größeres `y`), bei `90` nach links. `x`, `y`,
  `width` und `height` sagen, wo sie ohne Drehung stünde. Die Größe auf dem Boden bleibt gleich. Weil Prozent auf beiden
  Achsen verschieden lang sind, muss ein Renderer in Bodeneinheiten drehen, nicht in Prozent.
- `name` hat nur eine Zone der Art `public`, bei allen anderen ist es `null`.
- Der Admin vergibt die Zuweisung. Der Code schaut nur auf `kind`, `blocks` und `prop`, nie auf den Namen.
- Jellies ohne eigenen Bereich sind Besucher (`is_visitor`). Sie wandern durch alle Zonen der Art `visitors`, ohne solche
  Zonen durch die Lounge mit der kleinsten ID, ohne Lounge über die ganze Bühne. `area_id` nennt dabei die erste
  dieser Zonen oder bleibt `null`.
- Jeder Jelly bekommt im Bereich den nächsten freien Platz in der Reihenfolge der Spieler-IDs. Ohne
  Bereich und ohne Lounge gilt die ganze Bühne. Abwesende behalten ihren Platz, Neue verschieben niemanden.

### Essens-Event und Siegerehrung

Die Orga startet ein `gathering`, und alle Jellies der LAN laufen los. Bühne und Apps lesen es aus `gathering` in `GET /stage`
mit `kind`, `winner_id` und `ends_at`, Änderungen meldet `gathering.changed`.

- `food` schickt alle in die Zonen der Art `queue`. `ceremony` schickt alle zu `spectators` und den Sieger zu `winner`, der
  Sieger wächst dort auf der Bühne. Den Preis vergibt die Orga wie bisher über `POST /admin/api/awards`.
- Sie füllen die Fläche wie beim Thekenlauf: nächste Zone mit Platz, sonst stellen sie sich nah dazu. Ohne passende Zone
  bleibt alles, wie es ist.
- Es wird nur gelaufen, nichts pausiert. Ein Ausflug, Folgen oder ein Stapel läuft im Hintergrund weiter und geht danach
  weiter, wenn seine Zeit noch nicht um ist. Die Endzeit steht in der Datenbank, ein Neustart ändert nichts.
- Ein reguläres Ende sendet kein Ereignis, also zählt `ends_at`.

### Wege

Der Server plant, wo die Jellies laufen. Bühne und Apps spielen die Wege nur ab, so zeigen alle Bildschirme
dasselbe. `moves` nennt je Jelly den aktuellen Weg, neue Wege kommen als Nachricht `move` im Stream.

- `start_at` ist Serverzeit in Millisekunden, die Uhr gleicht man über `server_time` ab. Ein neuer Weg beginnt etwa
  eine Sekunde in der Zukunft, damit er alle Bildschirme rechtzeitig erreicht.
- `points` sind Prozentwerte der Bühne, `t` zählt Millisekunden ab `start_at`. Zwischen zwei Punkten läuft das Jelly
  geradeaus, nach dem letzten steht es dort. Ein einzelner Punkt heißt: Es steht.
- Ein neuer Weg desselben Jellys ersetzt den alten. Er beginnt dort, wo das Jelly zu seinem `start_at` ist.
- `kind` nennt den Grund: `wander` (bummelt um seinen Platz oder geht dorthin zurück), `follow`, `trip`, `snack`, `stack`,
  `food` und `ceremony`.
  Weitere Werte können dazukommen und sind wie `wander` zu behandeln.
- Ein Weg dauert seine Länge geteilt durch die Regel `walk_speed`, in Jelly-Einheiten pro Sekunde. Ein Jelly ist etwa
  1,7 breit, die Halle 21 breit und 40 tief.
- Nach Essen und Trinken läuft das Jelly für `snack_run_seconds` zur nächsten Zone der Art `queue` und danach zurück. War
  der Weg lang, wartet es ab seiner Ankunft noch kurz. Jellies füllen die ganze Fläche der Zone. Ist sie voll, geht das
  Jelly zur nächsten mit Platz. Sind alle voll, stellt es sich nah dazu. Ohne solche Zonen bleibt es, wo es ist.
  Plätze liegen etwa 1,8 Jelly-Einheiten auseinander, eine Zone fasst also so viele Jellies, wie in diesem Raster
  hineinpassen. Beispiel: 45 % × 5 % der Bühne sind etwa 9,5 × 2 Einheiten, das sind 5 Plätze in einer Reihe. Für ein
  Essens-Event mit allen braucht die Theke deshalb tiefere oder mehrere Zonen.
- Wo ein Jelly läuft, bestimmt nur der Server. Er merkt sich die Positionen alle 30 Sekunden. Nach einem Neustart macht
  jedes Jelly dort weiter, ein neuer `move` kann also um bis zu 30 Sekunden Weg springen. Ausflug, Folgen, Stapel und
  Thekenlauf laufen auch während eines Ausfalls ab. Danach läuft das Jelly von selbst zurück zu seinem Platz.

`GET /stage/events` sendet Ereignisse und Wege als SSE und nimmt ebenfalls Schlüssel oder Secret. Der Stream ist
für alle gleich, das eigene Jelly filtert der Client über `player_id`.

- **Themen:** `?topics=events`, `?topics=moves` oder `?topics=events,moves` wählen aus, ohne Angabe kommt beides.
  Unbekannte Themen ergeben `400 invalid_request`.
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
| `rules.changed`                                   | Regeln geändert, `GET /lans/current` neu lesen |
| `gathering.changed`                               | Essens-Event oder Siegerehrung, Stand neu laden |

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
| `partner_emote.updated`                           | Handelnder  | `{"id","key","from_id","partner_id","state","expires_at"}` |
| `sign.changed`                                    | Spieler     | `{"key"}`, `null` beim Senken     |
| `follow.changed`                                  | Spieler     | `{"target_id"}`, `null` am Ende   |
| `trip.changed`                                    | Spieler     | `{"x","y","ends_at"}`, `null` am Ende |
| `stack.changed`                                   | Spieler, `null` beim Ablauf | Der Stapel, nach dem Absteigen oder Ablauf nur `{"id"}` |
| `highlight`                                       | Spieler     | `{"target_id","ends_at","cosmetic_key"}` |
| `stage.changed`, `rules.changed`                  | `null`      | `{}`                              |
| `gathering.changed`                               | `null`      | Das Gathering, `null` am Ende     |

Ausflug, Folgen, Stapel und Gathering melden ihr Ende immer, auch wenn nur die Zeit abläuft. Der Server prüft das jede
Sekunde. Eine App braucht dafür keine eigenen Timer. Das Bild bleibt schon vorher überall gleich, weil alle Wege vom Server kommen.

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
| `POST /admin/api/players/{id}/recovery-code`     | `{"valid_seconds"}`, ohne Angabe 24 Stunden, höchstens 30 Tage. Antwort: `{"code","expires_at"}`, nur dieses eine Mal |
| `POST /admin/api/players/{id}/xp`                | `{"xp"}` von 1 bis 10000 in der laufenden LAN, wie verdient, mit Ereignis `xp.gained`. XP werden nie abgezogen. Ohne Teilnahme `409 not_joined` |
| `POST /admin/api/players/{id}/achievements`      | `{"key"}` aus dem Katalog, auch geheime, für die laufende LAN wie verdient. Ein vorhandenes bleibt, wie es ist |
| `GET /admin/api/achievements`                    | Alle Achievements mit `key`, `title`, `description`, auch die geheimen |
| `DELETE /admin/api/players/{id}`                 |                                           |
| `GET`, `POST /admin/api/lans`                    | `{"slug","name","timezone","join_code","starts_at","ends_at"}` |
| `PATCH /admin/api/lans/{id}`                     | `{"name","starts_at","ends_at"}`, alle optional. Der Kurzname bleibt fest |
| `DELETE /admin/api/lans/{id}`                    | Nur ohne Spieler, sonst `409 lan_has_players`. Zonen und Codes verschwinden mit |
| `PATCH /admin/api/lans/{id}/rules`               | Ändert nur die genannten Regeln, siehe unten |
| `PUT /admin/api/lans/{id}/rules`                 | **Ersetzt alle Regeln**, siehe unten      |
| `PUT /admin/api/lans/{id}/join-code`             | `{"join_code"}`. `GET /admin/api/lans` zeigt ihn danach in `join_code`, bei älteren LANs steht dort bis zum Ersetzen `null` |
| `GET /admin/api/lans/{id}/event-codes`           |                                           |
| `POST /admin/api/event-codes`                    | `{"lan_id","title","code","xp","valid_from","valid_until"}` |
| `POST /admin/api/awards`                         | `{"player_id","title","cosmetic_key"}`, der Schlüssel muss im Katalog stehen |
| `GET /admin/api/actions`                         | Antwort: die letzten 200 Admin-Aktionen   |
| `GET /admin/api/lans/{id}/areas`                 | Antwort: `{"areas","assignments"}`        |
| `POST /admin/api/lans/{id}/areas`                | `{"x","y","width","height","rotation","kind","name","blocks","prop"}` |
| `POST /admin/api/lans/{id}/gathering`            | `{"kind","seconds","winner_id"}`, `food` oder `ceremony`, höchstens 6 Stunden, ersetzt ein laufendes. `winner_id` nur bei `ceremony` |
| `GET`, `POST /admin/api/lans/{id}/bots`          | Antwort: `{"bots","auto_count"}`. `POST` mit `{"count"}` legt bis zu 100 Bots an, siehe unten |
| `PUT /admin/api/bots/auto`                       | `{"count"}`: so viele Bots der laufenden LAN spielen selbst, `0` stoppt sie |
| `POST /admin/api/bots/{id}/actions`              | `{"kind","xp"}` mit `poke`, `food`, `drink`, `emote`, `sign`, `trip`, `follow`, `stack`, `xp` oder `redeem` mit `"code"` |
| `DELETE /admin/api/bots`                         | Löscht alle Bots mit allem, was sie getan haben, und stoppt die automatischen |
| `GET /admin/api/lans/{id}/gathering`             | Antwort: `{"gathering"}`, das laufende Gathering oder `null` |
| `POST /admin/api/event-codes/{id}/end`           | Der Code gilt ab sofort nicht mehr, vergebene XP bleiben |
| `DELETE /admin/api/lans/{id}/gathering`          | Beendet es vorzeitig                      |
| `PUT /admin/api/lans/{id}/map`                   | Kartendatei, siehe unten. Antwort: `{"created","updated","removed","unknown_props","unassigned_players"}` |
| `POST /admin/api/lans/{id}/areas/{area}/code`    | `{"player_id"}`, optional, bindet den Code ans Konto |
| `GET /admin/api/lans/{id}/seat-codes`            | Antwort: Codes mit `used_at`, `player_id`, `name` und `is_seated`, ob das Konto dort sitzt |
| `PUT`, `DELETE /admin/api/lans/{id}/areas/{area}` | `{"x","y","width","height","rotation","kind","name","blocks","prop"}` bei `PUT` |
| `PUT /admin/api/lans/{id}/players/{player}/area` | `{"area_id"}` von `seats`, `stage`, `lounge` oder `visitors`, `null` entfernt ihn |

Beim Bearbeiten eines Bereichs bleiben seine Jellies zugeordnet, solange dort Jellies stehen können.
Wird er gelöscht oder zu einer Art, in der niemand zugehörig ist, verlieren sie ihn und stehen in der Lounge,
bis ein Admin sie neu zuweist.

### Bots

Bots sind Konten, die die Orga anlegt, um zu testen und die Bühne zu füllen. Sie heißen `Bot-<Nummer>`, zählen als
normale Spieler und halten sich an dieselben Regeln: Abklingzeiten, Grenzen und Nähe gelten auch für sie. Nur Bots
lassen sich über die Admin-Wege steuern, bei echten Spielern antwortet der Server `400 not_a_bot`.

- **Von Hand:** `POST /admin/api/bots/{id}/actions` lässt einen Bot eine Aktion ausführen. Emote, Schild, Ziel eines
  Ausflugs und wem er folgt, wählt der Server zufällig. `stack` klettert auf einen laufenden Stapel in der Nähe oder
  beginnt einen, wo der Bot steht. `xp` schenkt bis zu 10000 XP direkt, `redeem` löst einen Event-Code ein wie ein Spieler.
- **Automatisch:** Die ersten `auto_count` Bots der laufenden LAN handeln im Takt der Bewegung, jeder etwa alle 20
  Sekunden. Die Zahl liegt nur im Speicher, ein Neustart stoppt sie also, damit auf einer LAN keine Bots ungefragt
  loslaufen.

### Regeln ändern

- **`PATCH` für einzelne Regeln:** `{"trip_seconds":60}` ändert nur diesen Wert, alles andere bleibt. Das ist der Normalfall.
- **`PUT` ersetzt alle Regeln:** Jedes Feld, das im Körper fehlt, fällt auf seinen Standardwert zurück, auch wenn es vorher
  anders eingestellt war. `PUT` mit `{"trip_seconds":60}` setzt also alle anderen Regeln zurück.
- Beide prüfen die Werte, senden `rules.changed` und antworten mit allen Regeln. `xp_per_level` lässt sich nach dem Start der
  LAN mit keinem von beiden ändern.

Erlaubte Werte, jeweils einschließlich der Grenzen. Dauern stehen in Sekunden, höchstens 30 Tage:

| Regel                    | Erlaubt          | Bedeutung                                                   |
| ------------------------ | ---------------- | ----------------------------------------------------------- |
| `xp_per_level`           | 1 bis 1000000    | XP pro Level, nach dem Start der LAN fest                   |
| `poke_interval`          | 1 bis 2592000    | Mindestzeit zwischen zwei Stupsern, die XP geben            |
| `poke_xp`                | 0 bis 10000      | XP pro Stupser                                              |
| `poke_max_ticks`         | 1 bis 1000       | Abstände, die ein Stupser nachholt, 1 heißt kein Nachholen  |
| `food_xp`                | 0 bis 10000      | XP für eine Essensmeldung                                   |
| `drink_xp`               | 0 bis 10000      | XP für eine Getränkemeldung                                 |
| `report_cooldown`        | 1 bis 2592000    | Zeit zwischen zwei Meldungen derselben Art                  |
| `report_window`          | 1 bis 2592000    | Zeitfenster für `reports_per_window`                        |
| `reports_per_window`     | 0 bis 1000       | Meldungen im Zeitfenster, Essen und Trinken zusammen        |
| `presence_window`        | 1 bis 2592000    | So lange bleibt ein Jelly nach seiner letzten Aktion da     |
| `emote_cooldown`         | 0 bis 2592000    | Zeit zwischen zwei Emotes, 0 schaltet sie ab                |
| `partner_invite_seconds` | 1 bis 2592000    | So lange lässt sich ein Partner-Emote beantworten           |
| `partner_xp`             | 0 bis 10000      | XP für ein Partner-Emote mit jemand Neuem in dieser LAN     |
| `full_house_percent`     | 1 bis 100        | Anteil der Spieler, die denselben Event-Code einlösen müssen |
| `snack_run_seconds`      | 1 bis 2592000    | So lange bleibt ein Jelly nach einer Meldung an der Theke   |
| `trip_seconds`           | 1 bis 2592000    | So lange bleibt ein Jelly am Ziel eines Ausflugs            |
| `follow_seconds`         | 1 bis 2592000    | So lange folgt ein Jelly einem anderen                      |
| `near_distance`          | 0,01 bis 1000    | Abstand für „nebeneinander“ in Jelly-Einheiten              |
| `walk_speed`             | 0,01 bis 100     | Jelly-Einheiten pro Sekunde                                 |
| `stack_seconds`          | 1 bis 2592000    | So lange steht ein Stapel                                   |
| `stack_max_members`      | 0 bis 1000       | Jellies pro Stapel, 0 heißt ohne Grenze                     |
| `highlight_seconds`      | 1 bis 2592000    | So lange leuchtet ein hervorgehobenes Jelly                 |
| `highlight_cooldown`     | 0 bis 2592000    | Zeit zwischen zwei Hervorhebungen, 0 schaltet sie ab        |
| `max_players`            | 1 bis 100000     | Konten pro LAN                                              |
| `max_streams`            | 1 bis 100000     | Offene Ereignis-Streams insgesamt                           |
| `max_player_streams`     | 1 bis 1000       | Offene Ereignis-Streams pro Spieler                         |

### Kartendatei

Eine Karte sagt, was wo steht, und nie, wer es benutzt. Die Zuweisung macht der Admin danach in der Datenbank.

```json
{
  "version": 1,
  "zones": [
    { "id": "sofa-1", "name": "Sofa Lounge", "x": 50.5, "y": 10.25, "width": 10, "height": 5, "rotation": 37.5, "blocks": true, "prop": "couch" }
  ]
}
```

- `id` ist ein freier Text, höchstens 64 Zeichen, und erkennt die Zone beim nächsten Import wieder. Bekannte Zonen behalten
  Zuweisung und Sitzplatz-Code. Neue beginnen mit `none`. Fehlt eine, wird sie entfernt, und ihre Jellies verlieren den Platz.
  Von Hand angelegte Zonen bleiben unberührt.
- `rotation` ist optional, von 0 bis unter 360 Grad, Nachkommastellen sind erlaubt. Fehlt sie, zeigt das Modell zur Kamera.
  Alle vier Ecken müssen nach dem Drehen im Raum liegen. Hindernis und Plätze der Zone drehen sich mit.
- Mit `?dry_run=true` antwortet der Import mit demselben Bericht, ändert aber nichts. So sieht die Orga vorher, welche Zonen
  verschwinden und wie viele Jellies ihren Platz verlieren.
- `zones` ist Pflicht, damit eine falsche Datei nicht alle Zonen entfernt. `"zones": []` entfernt sie mit Absicht.
- Der Import läuft auch während einer LAN und sendet `stage.changed`.
- Ist eine Zone ungültig, ändert sich nichts, und es folgt `400 invalid_map`. Unbekannte Props hindern den Import nicht,
  stehen aber in `unknown_props`. Die bekannten Props stehen in `ListProps` in `internal/rules/maps.go`.
- Größere Modelle und viele kleine Props sind beide erlaubt: Sets wie `stage-set` stehen neben ihren Teilen.

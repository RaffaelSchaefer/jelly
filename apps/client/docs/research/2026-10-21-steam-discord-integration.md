# Recherche: Spielzeit über Steam und Event-Teilnahme über Discord

Stand: 21.10.2026. Ziel: Die LAN-Party am Umwelt-Campus Birkenfeld im November 2026.
Status: nur Recherche und Plan. Es ist noch nichts implementiert.

Legende: **[belegt]** heißt, die Primärquelle sagt es. **[nahe Primärquelle]** heißt offizielles Wiki oder Valve-Forum, aber keine Valve- oder Discord-Doku. **[unbelegt]** heißt, ich habe es nur beobachtet oder nicht prüfen können.

Zwei Primärseiten haben die automatische Abfrage mit einer Bot-Prüfung blockiert: das Valve Developer Community Wiki (Anubis-Prüfung) und das Discord Developer Policy Center (Cloudflare). Ich habe die Prüfungen nicht umgangen. Aussagen zu diesen Seiten stützen sich auf Suchtreffer-Auszüge der Seiten selbst und sind entsprechend markiert.

---

## 0. Ausgangslage im Code

- `src-tauri/src/pet.rs`: `Action::{Activity, Food, Drink, Event}`. Die XP-Werte stehen in `Pet::apply` (1/15/10/30). `log: Vec<Entry {action, xp, at}>` enthält alle XP-Gewinne außer Pokes.
- **Wichtig:** `Store::interact_at` schickt jede Aktion außer `Activity` durch `report_blocked`. Das gilt auch für `Event`. Ein Event hat also heute 30 min Cooldown und zählt gegen das Limit von 8 Meldungen pro 24 h. Für extern bestätigte Events ist das falsch. Events brauchen einen eigenen Pfad ohne Self-Report-Limits, dafür mit Dedup über eine Event-ID.
- `Entry` und `Pet` haben `deny_unknown_fields` und `schema_version: 1`. Neue Felder wie `source` oder `ref` sind beim Lesen alter Dateien unproblematisch, solange sie `#[serde(default)]` bekommen. Eine ältere App-Version würde neue Dateien aber ablehnen. Das ist während der LAN akzeptabel, weil alle dieselbe Version nutzen.
- `src/pet.ts`: Die Werte für `first-game` und `marathon` sind auf 0 hart kodiert. `tournament` zählt `action === 'event'`. `glow-aura` hängt an `marathon`. `party-hat` hängt an mindestens einem Event.
- Spielzeit-Segmente passen nicht in `log`, weil das nur XP-Gewinne sind. Gebraucht wird eine eigene Liste `sessions: Vec<{appid, start, end}>` (siehe Plan).

---

## 1. Spielzeit über Steam

### 1.1 Steam Web API: die relevanten Methoden

| Methode                                    | Was sie liefert                                                                                                                           | Brauchbar für                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `ISteamUser/GetPlayerSummaries/v2`         | Profil plus optional `gameid` (App-ID als String, wenn gerade im Spiel) und `gameextrainfo` (Spieltitel). Bis zu 100 SteamIDs pro Aufruf. | „Spielt gerade X“. Gut zum Pollen pro Spieler. |
| `IPlayerService/GetRecentlyPlayedGames/v1` | `appid`, `name`, `playtime_2weeks`, `playtime_forever` in Minuten                                                                         | Grobe Gegenprobe                               |
| `IPlayerService/GetOwnedGames/v1`          | `appid`, `playtime_forever`, `playtime_2weeks` in Minuten, mit `include_appinfo` auch Name und Icon                                       | Delta-Messung über die LAN-Dauer               |

Belege:

- GetPlayerSummaries mit Parametern `key` und `steamids` („max: 100“). Das Beispiel der Partner-Doku zeigt `gameid` und `gameextrainfo` nicht. **[belegt]** https://partner.steamgames.com/doc/webapi/ISteamUser
- `gameid`: „If the user is in game this will be set to it's app ID as a string“. `gameextrainfo`: „The title of the game“. `personastate` 0 wird „auch gesetzt, wenn das Profil privat ist“. `communityvisibilitystate` 1 heißt privat, 3 heißt öffentlich. **[nahe Primärquelle]** https://wiki.teamfortress.com/wiki/WebAPI/GetPlayerSummaries
- GetOwnedGames und GetRecentlyPlayedGames: Die Partner-Doku nennt nur die Parameter (`include_appinfo`, `include_played_free_games`, `appids_filter`, `count`), keine Antwortfelder. **[belegt]** https://partner.steamgames.com/doc/webapi/IPlayerService
- Felder `playtime_forever` und `playtime_2weeks` jeweils „denoted in minutes“. **[nahe Primärquelle]** https://wiki.teamfortress.com/wiki/WebAPI/GetOwnedGames, https://wiki.teamfortress.com/wiki/WebAPI/GetRecentlyPlayedGames
- GetOwnedGames liefert Daten nur „if the profile is publicly visible“. Ohne `include_appinfo` kommen nur `appid`, `playtime_2weeks` und `playtime_forever`. **[belegt, über Suchtreffer-Auszug, Seite blockiert]** https://developer.valvesoftware.com/wiki/Steam_Web_API
- `rtime_last_played`: In Valves Doku nicht dokumentiert. Nur Foren und Wrapper erwähnen es als Unix-Zeitstempel. **[unbelegt]** z. B. https://steamcommunity.com/discussions/forum/1/3814039097896647393/

**Bewertung:** Die Playtime-Felder haben eine Auflösung in Minuten. Valve dokumentiert nicht, wie zeitnah sie aktualisiert werden. Nach meinem Verständnis passiert das eher nach Sitzungsende, das ist aber **[unbelegt]**. Für „10 Stunden am Stück mit maximal 15 Minuten Pause“ taugt deshalb nur ein **Polling von `gameid`**, zum Beispiel jede Minute. Die Playtime-Deltas sind nur eine Plausibilitätsprüfung.

### 1.2 API-Key, Nutzungsbedingungen, Limits

- „All use of the Steam Web API requires the use of an API Key.“ Der Key kommt über das Formular auf steamcommunity.com/dev, die Terms of Use müssen akzeptiert werden. **[belegt]** https://steamcommunity.com/dev
- Ein User-Key braucht nur einen Steam-Account und eine zugeordnete Domain. Publisher-Keys „must not be distributed with a game client“. **[belegt]** https://partner.steamgames.com/doc/webapi_overview/auth
- Terms of Use: höchstens 100.000 Aufrufe pro Tag. Der Key ist vertraulich zu halten und nicht an Dritte weiterzugeben. Die Lizenz ist persönlich und an die Anwendung gebunden. Daten über Endnutzer nur „as requested by the end user“ abrufen. Eine Datenschutzerklärung ist Pflicht, wenn nicht-öffentliche Daten verarbeitet werden. Kein Anschein von Valve-Endorsement. Valve kann den Zugang jederzeit beenden. Die Terms sind laut Seite vom Juli 2010. **[belegt]** https://steamcommunity.com/dev/apiterms
- **Folgerung:** Den Key in die Tauri-App einzubauen würde die Vertraulichkeitspflicht verletzen. Jeder Nutzer kann ihn aus dem Binary ziehen. Es bleiben zwei Optionen:
  (a) Ein **kleiner Server der Orga** hält den Key und pollt. Rechnung: 100 Spieler, 1 Aufruf pro Minute mit 100 IDs, ergibt 1.440 Aufrufe pro Tag, weit unter dem Limit.
  (b) **Jeder Nutzer trägt seinen eigenen Key ein.** Das ist umständlich, und die Domain-Pflicht ist für Privatpersonen seltsam. Nicht empfohlen.

### 1.3 Datenschutz und Sichtbarkeit

- Privat-Profile liefern nur öffentliche Daten, `personastate` ist dann 0. **[nahe Primärquelle]** https://wiki.teamfortress.com/wiki/WebAPI/GetPlayerSummaries
- Die Einstellung „Spieldetails“ (Game details) steuert Spieleliste, Spielzeit und den Status „im Spiel“. Es gibt eine extra Checkbox „Gesamtspielzeit immer privat halten“. Für Bestandskonten ist der Standard „Nur Freunde“. **[nahe Primärquelle, nur Forenbeiträge]** https://steamcommunity.com/discussions/forum/7/1696044439570105622/, https://steamcommunity.com/groups/SteamClientBeta/discussions/0/3775742015038753376/. Eine offizielle Hilfeseite habe ich nicht gefunden. **[unbelegt]**
- Folge für uns: Wer seine Spieldetails nicht auf „Öffentlich“ stellt, bekommt vom Server kein `gameid`. Die App muss das erkennen und erklären, statt still 0 h zu zählen. Erkennbar ist es an `communityvisibilitystate != 3` oder daran, dass `gameid` dauerhaft fehlt, obwohl der Nutzer lokal spielt.

### 1.4 SteamID verknüpfen: Steam OpenID

- Steam ist OpenID-Provider unter `https://steamcommunity.com/openid`. Die Claimed ID hat die Form `https://steamcommunity.com/openid/id/<steamid64>`. Das Login-Passwort sieht man nie. Vorgeschrieben ist ein offizieller „Sign in through Steam“-Button. **[belegt]** https://steamcommunity.com/dev
- Ablauf für uns: Die App öffnet den Browser auf der Login-Seite des Orga-Servers. Der Server leitet zu Steam weiter, prüft die Antwort und bindet die SteamID an eine Geräte-ID oder ein Token der App.
- Ob Steam OpenID eine `return_to`-Adresse auf `http://127.0.0.1` oder einen LAN-Host annimmt, ist **[unbelegt]**. Vorher testen.
- Billigere Variante für eine LAN, ohne Beweis: Nutzer gibt seine Profil-URL oder SteamID ein. Das ist nicht gegen Fremd-IDs geschützt.

### 1.5 Lokale Alternativen auf Windows (ohne Web API)

| Signal                                                                          | Was es ist                                                                | Status                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry `HKCU\Software\Valve\Steam\RunningAppID` (DWORD)                       | App-ID des gerade laufenden Steam-Spiels, sonst 0                         | **[unbelegt]**, von Valve nicht dokumentiert. Auf diesem Rechner existiert der Wert (gelesen: `RunningAppID = 0`, `SteamPath` gesetzt). Bei laufendem Spiel nicht getestet.                       |
| Registry `HKCU\Software\Valve\Steam\Apps\<appid>\Running`                       | 0/1 pro App, daneben `Installed` und `Updating`                           | **[unbelegt]**, ebenfalls beobachtet, nicht dokumentiert                                                                                                                                          |
| Steam-Dateien (`config\loginusers.vdf`, `userdata\<id>\config\localconfig.vdf`) | Angemeldeter Nutzer, lokale Spielzeiten                                   | **[unbelegt]**. Format nicht dokumentiert. Nicht geprüft.                                                                                                                                         |
| Prozessliste                                                                    | `CreateToolhelp32Snapshot`, `Process32First`/`Process32Next`, `szExeFile` | **[belegt]** dass die API existiert: https://learn.microsoft.com/en-us/windows/win32/toolhelp/taking-a-snapshot-and-viewing-processes. Die Zuordnung von EXE zu Spiel bräuchte eine eigene Liste. |
| Benachrichtigung bei Registry-Änderung                                          | `RegNotifyChangeKeyValue` statt Polling                                   | **[belegt]** https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regnotifychangekeyvalue                                                                                         |

Bewertung:

- Lokal geht ohne Key, ohne Server, offline und unabhängig von der Privatsphäre-Einstellung. Diese Signale sind aber inoffiziell: Ein Steam-Update kann sie ändern. Außerdem kann jeder sie fälschen, ein `reg add` genügt.
- Datenschutz: Die App liest nur einen Wert des eigenen Nutzers. Das ist weniger invasiv als eine Prozessliste. Eine Prozessliste sieht alles, was läuft, und sollte deshalb nicht genutzt werden.
- `RunningAppID` erfasst nur Spiele, die über Steam gestartet wurden. Non-Steam-Spiele und Epic oder Battle.net fehlen. Das passt zur Achievement-Formulierung „über Steam“.

---

## 2. Event-Teilnahme über Discord

### 2.1 Guild Scheduled Events

- Endpunkte: `GET /guilds/{id}/scheduled-events` (optional `with_user_count`), `GET .../scheduled-events/{event_id}` und `GET .../scheduled-events/{event_id}/users` (`limit` ≤ 100, `with_member`, `before`/`after` zum Paginieren). **[belegt]** https://docs.discord.com/developers/resources/guild-scheduled-event
- **`/users` liefert Abonnenten, keine Anwesenden.** Gemeint sind Nutzer, die auf „Interessiert“ geklickt haben. Das Gateway-Event `GUILD_SCHEDULED_EVENT_USER_ADD` heißt laut Doku „Sent when a user has subscribed to a guild scheduled event“. **[belegt]** https://docs.discord.com/developers/events/gateway-events. Das ist kein Teilnahmenachweis.
- Status: SCHEDULED(1) → ACTIVE(2) → COMPLETED(3), oder SCHEDULED → CANCELED(4). Endstatus sind endgültig. Events vom Typ VOICE oder STAGE enden automatisch, wenn der letzte Nutzer den Kanal verlässt („a few minutes after“). EXTERNAL-Events wechseln zur geplanten Start- und Endzeit. Nicht gestartete Events werden nach einigen Stunden storniert. **[belegt]** gleiche Seite
- Rechte: Lesen braucht bei VOICE `VIEW_CHANNEL`, bei EXTERNAL nichts. Anlegen braucht `CREATE_EVENTS`. **[belegt]** gleiche Seite
- Gateway: Intent `GUILD_SCHEDULED_EVENTS` (1 << 16), nicht privilegiert. Er liefert Create, Update, Delete, User-Add und User-Remove. **[belegt]** https://docs.discord.com/developers/events/gateway

### 2.2 Voice States als Anwesenheitssignal

- `VOICE_STATE_UPDATE` wird gesendet, wenn „someone joins/leaves/moves voice channels“. Intent `GUILD_VOICE_STATES` (1 << 7), nicht privilegiert. **[belegt]** https://docs.discord.com/developers/events/gateway-events, https://docs.discord.com/developers/events/gateway
- REST: `GET /guilds/{id}/voice-states/{user_id}` und `.../@me` existieren. **[belegt]** https://docs.discord.com/developers/resources/voice
- **Das ist das beste Discord-Signal für „war dabei“.** Ein VOICE-Event ist an einen Kanal gebunden. Der Bot misst, wer während des Status ACTIVE wie lange im Event-Kanal war, zum Beispiel mindestens 20 Minuten.

### 2.3 Presence und Activities: was ein Spiel zeigt

- `PRESENCE_UPDATE` enthält `activities` mit Typ 0 für „Playing“, `application_id` und `timestamps.start` in Millisekunden. Dafür ist der Intent `GUILD_PRESENCES` Pflicht. **[belegt]** https://docs.discord.com/developers/events/gateway-events
- `GUILD_PRESENCES` und `GUILD_MEMBERS` sind privilegiert. Unter 10.000 Nutzern genügt das Einschalten im Developer Portal, darüber ist eine Prüfung nötig. Verifizierte Apps (Pflicht ab 100 Servern) brauchen eine Freigabe. Man darf einen privilegierten Intent nur einschalten, „if your use case requires it to function and is consistent with our Developer Policy“. Ohne Freigabe schließt Discord die Verbindung mit Code 4014. **[belegt]** https://docs.discord.com/developers/events/gateway
- Für einen einzelnen LAN-Server ist das technisch kein Hindernis. Presence ist aber ein zweiter, sehr breiter Datenstrom: Der Bot sähe den Status aller Mitglieder. Steam deckt die Spielzeit besser und gezielter ab. **Empfehlung: kein Presence-Intent.**

### 2.4 OAuth2 für Nutzer (Konto verknüpfen)

- `identify` braucht man für `GET /users/@me`. `guilds.members.read` braucht man für `GET /users/@me/guilds/{guild.id}/member`. **[belegt]** https://docs.discord.com/developers/resources/user
- `activities.read` ist „not currently available for apps“. `rpc` ist „only available to approved partners“. Für Produktion wird der Authorization Code Grant empfohlen, Implicit nur für Prototypen. **[belegt]** https://docs.discord.com/developers/topics/oauth2
- Bot und User trennen sich so: Der Bot (Scope `bot`) läuft beim Orga-Server und liest Voice States und Events. OAuth2 mit `identify` dient nur dazu, die Discord-User-ID sicher mit der Pet-Instanz zu verknüpfen.

### 2.5 Social SDK und Rich Presence aus der Desktop-App

- Das Game SDK „has been archived“. Für neue Projekte wird das Discord Social SDK empfohlen. **[belegt]** https://docs.discord.com/developers/developer-tools/game-sdk
- Rich Presence läuft über das Social SDK (native Integration) oder das Embedded App SDK (Activities in Discord). **[belegt]** https://docs.discord.com/developers/rich-presence/overview
- Social SDK: Windows x64 und ARM64, Standalone C++20, Unity und Unreal. Es gibt kein offizielles Rust-Binding, für Tauri wäre FFI nötig. **[belegt]** zu den Plattformen: https://docs.discord.com/developers/discord-social-sdk/core-concepts/platform-compatibility. „Kein Rust-Binding“ ist **[unbelegt]**, es steht nur nicht in der Liste.
- Account-Linking geht im Social SDK auch ohne Backend über „Public Client“ und PKCE. **[belegt, über Suchtreffer-Auszug]** https://docs.discord.com/developers/discord-social-sdk/development-guides/provisional-accounts/merging-accounts
- **Bewertung:** Rich Presence, also „Pixel ist Level 5“ in Discord, ist nettes Beiwerk, misst aber nichts. Der Aufwand (C++-SDK, FFI) steht für November in keinem Verhältnis. Weglassen.

### 2.6 Rate Limits und Richtlinien

- REST: 50 Anfragen pro Sekunde global pro Bot. Pro Route gelten Buckets, die man aus den Headern liest, nicht hart kodiert. 10.000 ungültige Anfragen (401/403/429) in 10 Minuten führen zu einer IP-Sperre. **[belegt]** https://docs.discord.com/developers/topics/rate-limits
- Gateway: 120 gesendete Events pro Verbindung und 60 s. **[belegt]** https://docs.discord.com/developers/events/gateway
- Developer Policy und Terms: API-Daten nur für die angegebene Funktion nutzen. Nicht verkaufen und nicht an Datenhändler oder Werbenetze geben. Daten löschen, sobald sie nicht mehr gebraucht werden. Nutzer brauchen einen einfachen Weg, Löschung zu verlangen. Eine Datenschutzerklärung ist Pflicht. **[belegt, über Suchtreffer-Auszüge, Seite hinter Cloudflare]** https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy, https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service

---

## 3. Vertrauen und Fälschbarkeit

| Signal                         | Beweist                                      | Beweist nicht                                      | So fälscht man es                                                    |
| ------------------------------ | -------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Web API `gameid`               | Steam meldet für diesen Account „im Spiel X“ | dass die Person vor dem PC sitzt oder aktiv spielt | Spiel im Leerlauf laufen lassen, Idler-Tools, Account auf anderem PC |
| Playtime-Delta (GetOwnedGames) | Steam hat Minuten gutgeschrieben             | Zusammenhang, Pausen                               | wie oben                                                             |
| Registry `RunningAppID`        | Der lokale Wert sagt „läuft“                 | irgendetwas, wenn der Nutzer Schreibrechte hat     | `reg add ... /v RunningAppID /d 730`                                 |
| Lokale Pet-Datei               | nichts                                       | nichts                                             | JSON editieren. Das gilt heute schon für alle XP.                    |
| Discord „interessiert“         | Absicht                                      | Anwesenheit                                        | ein Klick                                                            |
| Discord Voice im Event-Kanal   | Account war verbunden, so lange              | Mitspielen                                         | stumm im Kanal bleiben                                               |
| Orga trägt Event-Ergebnis ein  | Mensch hat es bestätigt                      |                                                    | nur mit Orga-Rechten                                                 |

**Fazit für eine vertrauensbasierte LAN:** XP sind Spielerei ohne Preis. Server-seitige Signale (Web API, Voice) sind „gut genug“, weil man dafür mehr tun muss, als eine Datei zu editieren. Lokale Signale sind gleich schwach wie die bestehende Pet-Datei, aber bequem und offline. Pragmatische Linie: Lokal zählen, wenn vorhanden mit Server-Signal gegenprüfen. Falls je etwas Echtes gewonnen werden kann, nur Server-Daten werten.

---

## 4. Integrationsplan

### 4.1 Komponenten

```
Desktop-App (Tauri, pro Spieler)            LAN-Server der Orga (ein Prozess)
───────────────────────────────            ─────────────────────────────────
pet.rs  Store (lokale Wahrheit)   <─HTTP──  /api/pet/{token}/feed  (Events, Sessions)
steam.rs  liest RunningAppID       ──HTTP─> /api/heartbeat {token, appid}   (optional)
          jede 60 s (Phase 1)                Steam-Poller: GetPlayerSummaries alle 60 s
                                             Discord-Bot: Intents GUILDS,
                                               GUILD_VOICE_STATES, GUILD_SCHEDULED_EVENTS
                                             SQLite: players(token, steamid, discord_id),
                                               sessions, event_attendance
```

Was wo läuft:

- **App:** zählt Spielsegmente lokal, berechnet XP und Achievements (wie heute in `pet.ts` und `pet.rs`) und holt bestätigte Events vom Server.
- **Server:** hält den Steam-Key und das Discord-Bot-Token, verknüpft Konten und entscheidet, wer bei einem Event dabei war. Keine Schlüssel in der App.

### 4.2 Phasen

**Phase 1: lokal, ohne Server (empfohlener erster Schritt)**

1. In `src-tauri/src/steam.rs` alle 60 s `HKCU\Software\Valve\Steam\RunningAppID` lesen (Crate `winreg` oder `windows`). Ist Steam nicht installiert oder der Wert fehlt, ist das Feature „nicht verfügbar“.
2. Segmente in `Pet.sessions: Vec<Session {appid: u32, start: u64, end: u64}>` mit `#[serde(default)]` speichern. Ein Tick mit derselben App verlängert `end`. Ein Wechsel oder 0 schließt das Segment.
3. XP: zum Beispiel +5 XP pro volle 30 Minuten Spielzeit, als neue `Action::Game` im `log`. Diese Aktion läuft nicht durch `report_blocked`.
4. `achievementProgress` bekommt die Sessions: `first-game` = mindestens eine Session ≥ 5 min, `marathon` = längste Strecke (siehe 4.3).
5. Ein Opt-in-Schalter in den Einstellungen: „Laufendes Steam-Spiel erkennen“. Standard aus, Text dazu: „liest nur, welches Steam-Spiel läuft, nichts wird gesendet“.
6. Vorher klären: `RunningAppID` mit 2–3 Spielen testen, auch Spielwechsel, Steam-Neustart und Absturz.

**Phase 2: Events über den Orga-Server und Discord**

1. Kleiner Server (Rust/axum oder Node, eine Datei plus SQLite) im LAN, zum Beispiel `http://pet.lan:8080`.
2. Discord-Bot mit Intents `GUILDS | GUILD_VOICE_STATES | GUILD_SCHEDULED_EVENTS`, **ohne** privilegierte Intents.
3. Orga legt Turniere als Scheduled Events vom Typ **VOICE** an, mit Kanal. Bei `GUILD_SCHEDULED_EVENT_UPDATE` → ACTIVE startet die Messung. Aus `VOICE_STATE_UPDATE` summiert der Bot pro Nutzer die Minuten im Kanal. Bei COMPLETED erhält jeder mit mindestens 20 Minuten einen Eintrag `attendance(event_id, discord_id)`.
4. Fallback ohne Discord: Ein Admin-Befehl oder eine Admin-Seite trägt Teilnehmer per Hand ein. Das braucht man sowieso für Fälle ohne Discord-Konto.
5. Verknüpfung: In der App „Mit Discord verbinden“. Der Browser öffnet `pet.lan/link?token=…`, der Server macht OAuth2 mit `identify` und speichert `discord_id ↔ token`. Das `token` ist eine Zufalls-ID, die die App einmal erzeugt.
6. Die App pollt `GET /api/pet/{token}/feed` alle paar Minuten und bekommt `[{event_id, title, at}]`. Für jede neue `event_id` legt sie einen `log`-Eintrag `Event` mit 30 XP an. Dedup läuft über das neue Feld `ref: Option<String>` im `Entry`. **Kein** Cooldown und kein Tageslimit. Danach zählt `tournament` (3 Events) und `party-hat` automatisch.

**Phase 3 (optional): Steam-Gegenprobe über den Server**

1. Steam-Login per OpenID über `pet.lan/steam/login`, dabei wird die SteamID an das `token` gebunden. Vorher testen, ob `return_to` auf einen LAN-Host funktioniert. Falls nicht, braucht man einen öffentlichen Host oder die manuelle Eingabe der SteamID.
2. Der Server pollt GetPlayerSummaries alle 60 s für alle verknüpften IDs (bis 100 pro Aufruf) und speichert Segmente wie in Phase 1.
3. Die App meldet in diesem Modus ihre lokalen Segmente und bekommt bestätigte zurück. `marathon` gilt erst, wenn der Server zustimmt. Wer seine Spieldetails nicht öffentlich hat, bekommt einen klaren Hinweis und den lokalen Wert als „nicht bestätigt“.
4. Braucht Internet am Server. Das ist bei einer LAN-Party nicht garantiert.

### 4.3 Marathon: 10 Stunden am Stück, Pausen bis 15 Minuten

Definition: Alle Spielsegmente über alle Spiele hinweg werden nach Start sortiert. Zwei Segmente gehören zur selben Strecke, wenn `next.start - prev.end <= 15 min`. Die **Strecke zählt nur Spielzeit**, Pausen also nicht. Alternativ zählen die Pausen mit. Das muss noch entschieden werden (siehe offene Fragen). Fortschritt = längste Strecke in Stunden, gedeckelt auf 10.

```
streak = 0; best = 0; prev_end = None
for s in sessions.sorted_by(start):
    if prev_end and s.start - prev_end > 15*60: streak = 0
    streak += s.end - s.start
    best = max(best, streak); prev_end = s.end
```

Hinweise:

- Bei 60-s-Polling liegt der Messfehler pro Segment bei etwa 1 Minute. Die 15-Minuten-Toleranz fängt auch Spielwechsel und kurze Steam-Aussetzer ab.
- Schlafmodus oder geschlossene App: Ab der Lücke wird `end` nicht mehr verlängert. Ist die Lücke länger als 15 min, endet die Strecke. Das ist so gewollt.
- Uhrsprünge: `at` und `end` sind Unix-Sekunden. Zeitrückstellungen bei der Sommerzeit spielen keine Rolle, weil im November keine anfällt und Unix-Zeit davon ohnehin nicht betroffen ist.

### 4.4 Offline- und LAN-Verhalten

- Phase 1 funktioniert komplett offline.
- Phase 2 braucht nur das LAN plus Discord. Der Discord-Bot braucht Internet am Orga-Server. Fällt das Internet aus, bleibt der Admin-Eintrag.
- Die App toleriert einen unerreichbaren Server: still weiter pollen, kein Datenverlust, Events kommen später (Dedup über `ref`).
- Der Server ist die Quelle für Events. Die App ist die Quelle für ihren lokalen Spielstand. Eine Synchronisation in Gegenrichtung gibt es nicht.

### 4.5 Datenschutz und Einwilligung

- Alles ist Opt-in, mit getrennten Schaltern für „Steam-Spiel lokal erkennen“, „Mit Discord verbinden“ und „Mit Steam verbinden“.
- Datensparsam: Der Server speichert nur `token`, Discord-ID oder SteamID, Event-Teilnahme und Spielsegmente (App-ID, Zeiten). Keine Presence, keine Nachrichten, keine Freundeslisten.
- Löschung: Nach der LAN wird die DB gelöscht, zum Beispiel nach 30 Tagen. Ein „Verbindung trennen“ in der App löscht die Zuordnung sofort. Das deckt die Discord-Pflichten zu Löschung und Löschwunsch und die Steam-Pflicht „only as requested by the end user“ ab.
- Eine kurze Datenschutzerklärung (Pflicht nach Steam- und Discord-Terms) auf `pet.lan/privacy` und im Anmeldebereich der LAN. Außerdem die DSGVO-Grundlage klären, wahrscheinlich Einwilligung. Rechtliche Prüfung fehlt.
- Keine Formulierung, die eine Partnerschaft mit Valve oder Discord andeutet.

### 4.6 Fehlerfälle

| Fall                                                    | Verhalten                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Steam nicht installiert, Registry-Wert fehlt            | Feature ausgegraut, Text „Steam nicht gefunden“                                                                 |
| Steam-Update ändert oder entfernt `RunningAppID`        | Kein Spiel mehr erkannt. Hinweis nach X Stunden ohne Erkennung bei laufendem `steam.exe`? Wahrscheinlich YAGNI. |
| Profil privat (Phase 3)                                 | Klare Meldung mit Link auf die Steam-Privatsphäre-Einstellungen, lokaler Wert gilt als „unbestätigt“            |
| Discord-Bot offline während eines Events                | Admin trägt nach                                                                                                |
| Event-Status bleibt hängen, Orga vergisst es zu beenden | VOICE-Events enden automatisch einige Minuten nach dem letzten Verlassen, laut Doku                             |
| Nutzer ohne Discord                                     | Admin-Eintrag                                                                                                   |
| Doppelte Lieferung                                      | Dedup über `ref = "discord:<event_id>"`                                                                         |
| Zeit auf PC falsch                                      | Segmente lokal sind relativ in sich konsistent. Server-Events tragen die Server-Zeit.                           |

### 4.7 Empfohlener minimaler erster Schritt

**Phase 1, Punkte 1–4, plus ein Fix:** Lokal `RunningAppID` pollen, Sessions speichern, `first-game` und `marathon` berechnen. Gleichzeitig `Action::Event` aus `report_blocked` herausnehmen. Das ist ein kleiner Diff in `pet.rs` und `pet.ts`, ohne Server, ohne Keys, offline. Vorher 15 Minuten manuell testen, ob `RunningAppID` beim Spielen wirklich die App-ID zeigt.

Danach Phase 2 mit **Admin-Eintrag zuerst** und dem Discord-Voice-Bot als zweitem Schritt. Phase 3 nur, wenn Fälschungsschutz bei der Spielzeit wirklich gebraucht wird.

---

## 5. Offene Fragen

1. Zählen beim Marathon die Pausen bis 15 Minuten zur Zeit oder nur die Spielzeit? Der Text „10 Stunden am Stück“ ist mehrdeutig.
2. Zählt jedes Steam-Spiel, auch Tools wie Wallpaper Engine (App-ID 431960), das dauerhaft im Hintergrund läuft? Eine Ausschlussliste ist wahrscheinlich nötig. **[unbelegt]**, ob solche Tools `RunningAppID` setzen.
3. Hat der Orga-Server Internet? Davon hängen der Discord-Bot und Phase 3 ab.
4. Nutzt die LAN überhaupt einen Discord-Server, und wer hat dort Rechte für Events?
5. Wie viel XP gibt Spielzeit, damit sie Futter und Trinken nicht entwertet?
6. Wer ist datenschutzrechtlich verantwortlich (Fachschaft, Hochschule)?

## 6. Nicht verifiziert

- `RunningAppID` und `Apps\<id>\Running`: von Valve undokumentiert, nur auf diesem PC im Ruhezustand beobachtet.
- `gameid` und `gameextrainfo` stehen nicht in der Valve-Partner-Doku, nur im TF2-Wiki. Ob `gameid` bei „Spieldetails: Nur Freunde“ fehlt, habe ich nicht verifiziert.
- `rtime_last_played` und die Aktualisierungsfrequenz von `playtime_*` sind nicht dokumentiert.
- Ob Steam OpenID `return_to` auf LAN- oder Loopback-Adressen erlaubt.
- Der Wortlaut der Discord Developer Policy und Terms war nur über Suchtreffer-Auszüge zugänglich. Das Valve Developer Wiki ebenso.
- Offizielle Steam-Hilfeseite zu den Privatsphäre-Stufen: nicht gefunden, nur Forenbeiträge.
- Rust-Bindings für das Discord Social SDK: nicht geprüft.

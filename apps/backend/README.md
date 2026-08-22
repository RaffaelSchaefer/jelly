# @joint/backend

Zentrales Backend für die LAN-Party-Plattform "Joint" auf Basis von
[PocketBase](https://pocketbase.io): SQLite-Datenbank, Auth, Realtime
(SSE) und Admin-UI in einem Binary. Die Geschäftslogik lebt in `pb_hooks/`
(JavaScript mit JSDoc-Typisierung – läuft direkt im PocketBase-JSVM,
kein Build-Step nötig).

## Setup & Start

```sh
pnpm install                        # einmalig im Repo-Root
pnpm --filter @joint/backend setup  # lädt PocketBase-Binary + wendet Migrationen an
pnpm --filter @joint/backend dev    # startet PocketBase auf http://127.0.0.1:8090
```

- Admin-UI: <http://127.0.0.1:8090/_/> (beim ersten Besuch Superuser anlegen,
  oder `pnpm --filter @joint/backend exec ./pocketbase superuser upsert EMAIL PASS`)
- Health-Check: `GET /api/joint/health`
- Typecheck der Hooks: `pnpm --filter @joint/backend check-types`

## Auth (Discord-only)

Registrierung und Login laufen ausschließlich über Discord-OAuth2 –
Passwort-Auth ist deaktiviert, direkte User-Erstellung via API geschlossen.

Einrichtung:

1. Auf <https://discord.com/developers/applications> eine Application
   anlegen und unter OAuth2 → Redirects
   `http://127.0.0.1:8090/api/oauth2-redirect` eintragen.
2. Credentials als ENV setzen (werden von der Migration gelesen):

   ```sh
   export DISCORD_CLIENT_ID="..."
   export DISCORD_CLIENT_SECRET="..."
   ```

3. `pnpm --filter @joint/backend dev` erneut starten – die Migration
   konfiguriert den Provider automatisch.

Flow aus der Client-App: `pb.collection("users").authWithOAuth2({ provider: "discord" })`
bzw. manuell via `POST /api/collections/users/auth-with-oauth2`.
Bei erstmaligem Signup werden `nickname` und `discordUsername` automatisch
aus dem Discord-Profil befüllt (siehe `pb_hooks/auth.pb.js`).

## Struktur

```
pb_migrations/    Schema als Code (versioniert) – wird beim Start automatisch angewendet
pb_hooks/*.pb.js  Server-Logik: Validierung, Defaults, Kapazitäts-Checks, Custom Routes
scripts/          Download-Skript für das PocketBase-Binary (Version gepinnt)
```

## Datenmodell

| Collection | Zweck |
| --- | --- |
| `users` | Auth-Accounts, erweitert um `nickname` und `discordUsername` |
| `events` | Alles ist ein Event: Ankündigungen, Essen, Giveaways, Turniere … (`status = published` ist öffentlich lesbar) |

## Erweitern

**Neues Feld / Collection:** Im Admin-UI anlegen und dann über
`./pocketbase migrate collections` eine Snapshot-Migration erzeugen und
committen – so bleibt das Schema in Git nachvollziehbar. Alternativ eigene
Datei in `pb_migrations/` schreiben (Ausführungsreihenfolge per Dateiname).

**Neue Logik:** Neue Datei `pb_hooks/<name>.pb.js` mit
`/// <reference path="../pb_data/types.d.ts" />` als erste Zeile anlegen –
der Editor liefert damit Autovervollständigung und Typchecks. Hooks wie
`onRecordCreate`, `routerAdd`, `cronAdd` sind global verfügbar
(Referenz: <https://pocketbase.io/jsvm/>). PocketBase lädt geänderte
Hooks bei jedem Neustart neu (`dev` einfach erneut starten).

## Realtime

Alle Collections unterstützen SSE-Realtime unter `/api/realtime` – genau das
nutzt später die Godot-Anwendung für Live-Updates. Testbar z.B. mit dem
JS SDK: `pb.collection("events").subscribe("*", callback)`.

## Später geplante Apps

Discord-Bot und Web-Frontend werden eigene Apps im Monorepo
(`apps/*`) und sprechen über das JS SDK / REST mit diesem Backend.

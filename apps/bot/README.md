# @joint/bot

Discord-Bot für die LAN-Party-Plattform "Joint". Liest und schreibt Events
direkt in das [PocketBase-Backend](../backend) und kündigt neue Events
automatisch per Realtime an.

## Features

- `/event list [typ]` – kommende Events als Embeds
- `/event show <id>` – einzelnes Event anzeigen
- `/event create` – neues Event anlegen (sofort öffentlich sichtbar, Discord-User
  wird als Ersteller getrackt)
- `/event cancel <event>` – Event absagen (nur Ersteller oder Server-Admins),
  optionale Abgesagt-Info in den Announce-Channel
- `/event delete <event>` – Event endgültig löschen (nur Ersteller oder
  Server-Admins, unabhängig vom Abgesagt-Status)
- `/event announce <id> [kanal]` – Event als Embed posten
- `/ping` – Latenz-Check
- **Realtime:** neue zukünftige Events werden automatisch in den
  konfigurierten Announce-Channel gepostet

## Setup

```sh
pnpm install                     # einmalig im Repo-Root
cp apps/bot/.env.example apps/bot/.env   # Credentials eintragen
```

ENV-Variablen:

| Variable | Zweck |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Bot-Token aus dem Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application-ID (für Slash-Command-Registrierung) |
| `DISCORD_GUILD_ID` | Optional: Server-ID für sofortiges Command-Deploy im Dev-Server |
| `ANNOUNCE_CHANNEL_ID` | Optional: Channel für Auto-Ankündigungen |
| `POCKETBASE_URL` | Standard: `http://127.0.0.1:8090` |
| `POCKETBASE_SUPERUSER_EMAIL/PASSWORD` | Superuser-Credentials (Pflicht für `/event create`) |

Discord-Seite (<https://discord.com/developers/applications>):

1. Bot anlegen, Token kopieren, **Message Content Intent nicht nötig**
2. OAuth2-URL-Generator: Scopes `bot` + `applications.commands`,
   Permissions *View Channels, Send Messages, Embed Links*
3. Bot auf den Server einladen

PocketBase-Seite: Backend starten (`pnpm --filter @joint/backend dev`) und
Superuser-Credentials setzen (`./pocketbase superuser upsert EMAIL PASS`).

## Start

```sh
pnpm --filter @joint/bot register-commands   # Slash Commands bei Discord registrieren
pnpm --filter @joint/bot dev                 # Bot starten (tsx watch)
```

Typecheck: `pnpm --filter @joint/bot check-types`

## Struktur

```
src/
index.ts               Client-Bootstrap + Interaction-Routing
env.ts                 ENV-Validierung
pocketbase.ts          PocketBase-Client + Superuser-Auth
events.ts              Event-Service (List/Get/Create über JS SDK)
embeds.ts              Event → Discord-Embed Mapping
realtime.ts            SSE-Subscription → Auto-Ankündigungen
register-commands.ts   Slash-Command-Deployment (REST)
commands/              Command-Definitionen
```

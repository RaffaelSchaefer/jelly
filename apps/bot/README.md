# @joint/bot

Discord-Bot für die LAN-Party-Plattform "Joint". Liest und schreibt Events
direkt in das [PocketBase-Backend](../backend) und kündigt neue Events
automatisch per Realtime an.

## Features

- `/event list [typ]` – kommende Events als Embeds
- `/event show <event>` – einzelnes Event anzeigen (Autocomplete nach Name)
- `/event attendees <event>` – Discord-Interessierte anzeigen (nur Ersteller
  oder Server-Admins)
- `/event create [... banner spiel ziel mitspieler]` – neues Event mit optionalem PNG-, JPEG- oder
  WebP-Banner bis 5 MiB anlegen; der Discord-User wird als Ersteller getrackt
  und das zugehörige **Discord Server-Event** wird zuerst erstellt
- **Game-LFG:** Typ `game` verlangt einen Spielnamen und erstellt im
  Announce-Channel einen öffentlichen Koordinations-Thread. Optional werden
  Steam-App-ID/-Link oder HTTPS-Web-Link und gesuchte Mitspieler angezeigt;
  Discord-Interessierte werden automatisch in den Thread aufgenommen
- `/event cancel <event>` – Event absagen (nur Ersteller oder Server-Admins),
  optionale Abgesagt-Info in den Announce-Channel; Server-Event wird mit gecancelt
- `/event delete <event>` – Event endgültig löschen (nur Ersteller oder
  Server-Admins, unabhängig vom Abgesagt-Status); Server-Event wird mitgelöscht
- `/event announce <event> [kanal]` – Event als Embed posten
- `/ping` – Latenz-Check
- **Realtime:** neue zukünftige Events werden automatisch in den konfigurierten
  Announce-Channel gepostet; Änderungen über das PocketBase-Admin-UI
  werden einschließlich Banner auf Discord Server-Events gesynct. Discord-Interessiert/
  Nicht-mehr-interessiert wird in PocketBase gespiegelt; verpasste Änderungen
  werden beim Bot-Start abgeglichen
- **Erinnerung:** fällige Voice-Events werden automatisch gestartet, damit
  Discord alle Interessierten nativ benachrichtigt

## Setup

```sh
pnpm install                     # einmalig im Repo-Root
cp apps/bot/.env.example apps/bot/.env   # Credentials eintragen
```

ENV-Variablen:

| Variable                              | Zweck                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `DISCORD_BOT_TOKEN`                   | Bot-Token aus dem Discord Developer Portal                                          |
| `DISCORD_CLIENT_ID`                   | Application-ID (für Slash-Command-Registrierung)                                    |
| `DISCORD_GUILD_ID`                    | Dev-Command-Deploy + Ziel-Server für den Server-Event-Sync (ohne: Sync deaktiviert) |
| `ANNOUNCE_CHANNEL_ID`                 | Channel für Auto-Ankündigungen; Pflicht und threadfähig für Game-Events             |
| `POCKETBASE_URL`                      | Standard: `http://127.0.0.1:8090`                                                   |
| `POCKETBASE_SUPERUSER_EMAIL/PASSWORD` | Superuser-Credentials (Pflicht für Schreib-Commands, Teilnehmerzahlen und Sync)     |

Discord-Seite (<https://discord.com/developers/applications>):

1. Bot anlegen, Token kopieren, **Message Content Intent nicht nötig**
2. OAuth2-URL-Generator: Scopes `bot` + `applications.commands`,
   Permissions _View Channels, Send Messages, Embed Links, Connect,
   Create Events, Manage Events, Create Public Threads, Send Messages in Threads,
   Manage Threads_ (Integer `17927194561536`)
3. Bot auf den Server einladen

Server-Event-Sync: Joint-Events werden bei `/event create` automatisch als
Discord Scheduled Event angelegt (Voice-Channel-Ort → Voice-Event, sonst
External mit Ort-Text und Endzeit Start+2h). Verknüpft über das Feld
`discordGuildEventId`. Event-Embeds zeigen die aktuelle Anzahl Interessierter;
der verlinkte Titel öffnet das Discord Event, wo Nutzer **Interessiert** wählen.
Ohne erreichbaren, über `DISCORD_GUILD_ID` konfigurierten Server wird das Event
nicht angelegt. Ein optionales Banner erscheint im Server-Event und in allen
Event-Embeds; empfohlenes Format ist 800×320 Pixel.

Game-Events können nur über `/event create` vollständig angelegt werden. Ohne
Voice-Channel wird der Ort `Online · <Spiel>` verwendet. Schlägt die Erstellung
des Server-Events, der Ankündigung oder des Threads fehl, werden alle bereits
angelegten Discord-Ressourcen wieder entfernt und kein PocketBase-Event gespeichert.

PocketBase-Seite: Backend starten (`pnpm --filter @joint/backend dev`) und
Superuser-Credentials setzen (`./pocketbase superuser upsert EMAIL PASS`).

## Start

```sh
pnpm --filter @joint/bot register-commands   # Slash Commands bei Discord registrieren
pnpm --filter @joint/bot dev                 # Bot starten (tsx watch)
```

Nach Änderungen an Command-Optionen muss `register-commands` erneut laufen.

Checks: `pnpm --filter @joint/bot check-types` und
`pnpm --filter @joint/bot test`

## Struktur

```
src/
index.ts               Client-Bootstrap + Interaction-Routing
env.ts                 ENV-Validierung
pocketbase.ts          PocketBase-Client + Superuser-Auth
events.ts              Event- und Teilnehmer-Persistenz über JS SDK
embeds.ts              Event → Discord-Embed Mapping
realtime.ts            PocketBase/Discord-Realtime-Sync + Auto-Start
register-commands.ts   Slash-Command-Deployment (REST)
commands/              Command-Definitionen
```

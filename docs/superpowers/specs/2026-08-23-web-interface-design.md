# Joint Web Interface — Design Spec

**Date:** 2026-08-23
**Status:** Approved (brainstorming session)
**Scope:** New `apps/web` SPA + backend/bot extensions for full two-way Discord sync

## Goal

A good-looking, impressive web interface for the Joint community platform: Discord login, browse/join/create/manage **events** and **lobbies**. Signed-out visitors can browse everything; signing in via Discord unlocks participation. The existing Discord bot stays fully functional — web and Discord are two views of the same data.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Discord interaction | **Full two-way sync** — PocketBase is the single source of truth, bot mirrors web actions into Discord and vice versa |
| Game metadata | **`games` collection as Steam cache**, filled server-side via pb_hooks; free-text `game` fields stay for Discord compatibility |
| Feature scope | **Core**: Discover page, events (list/detail/create/edit/join), lobbies (list/detail/create/join/close), profile with created/joined items. No game catalog pages, no creator moderation tools, no web chat |
| Visual style | **"Discord Arcade"**: `#1e1f22` chrome, `#2b2d31` cards, `#313338` background, blurple `#5865F2`, success green `#23a55a`, text `#dbdee1`; rounded-xl, Inter, Steam cover art as the visual driver |
| Homepage layout | Hero + filter chips (Alle · Events · Lobbys · Heute · Diese Woche), events feed left, lobby sidebar right with slot progress bars |
| Hosting | **PocketBase serves the built SPA** from `pb_public/` (same origin, no CORS) |
| UI language | **German** |
| Architecture | **Approach 1**: SPA + PocketBase SDK direct, pb_hooks for Steam, bot as sync worker. No custom API server |

## Architecture

```
┌──────────────────┐      ┌───────────────────────────────┐
│   Web SPA        │ HTTP │         PocketBase            │
│  React+Vite+TS   │─────▶│  • Auth (Discord OAuth)       │
│  served from     │      │  • API rules + Realtime       │──┐
│  pb_public/      │      │  • pb_hooks: Steam enrichment │  │ SSE
└──────────────────┘      └───────────────▲───────────────┘  │
                                          │ Steam Store API  ▼
                                          └ (server-side,   ┌──────────────────┐
                                            key stays in PB)│   Discord Bot    │──▶ Discord
                                                            │ (existing; gains │
                                                            │  sync-worker role)│
                                                            └──────────────────┘
```

- The web app never calls Discord or Steam directly.
- The bot remains the **only** writer to the Discord API.
- PocketBase version: v0.39.x (JSVM hooks), pnpm + turbo workspace, Node ≥ 24.

## Data Model

New migration `1787001100_web_interface.js` (plus hook files):

| Collection | Change |
|---|---|
| `games` **(new)** | `name` text (required, unique), `steamAppId` text, `headerUrl` url, `capsuleUrl` url, `shortDescription` text, `lastEnrichedAt` date. Public list/view, no create/update/delete rules (hooks/superuser only). |
| `lobbies` | + `gameRef` relation → `games` (optional, maxSelect 1), + `createdBy` relation → `users` (optional, maxSelect 1) |
| `events` | + `gameRef` relation → `games` (optional) |
| `users` | + `discordId` text (max 32), filled by the existing OAuth hook (`pb_hooks/auth.pb.js`) on every Discord login/sync |

### API Rules

Today most rules are `null` (superuser-only; bot uses superuser). New rules:

- `games`, `lobbies`, `lobby_participants`, `events`, `event_attendees`: `listRule`/`viewRule` = **empty string** (= public in PocketBase) → visitors browse everything without an account.
- `lobbies`: `createRule` = authenticated; `updateRule`/`deleteRule` = `createdBy = @request.auth.id`.
- `events`: create authenticated; update/delete = `createdBy = @request.auth.id` (matches existing creator moderation).
- `lobby_participants` / `event_attendees`: create/delete authenticated. Capacity, closed-lobby and duplicate protection **cannot** be expressed in rules → enforced in `pb_hooks` (see below).

### pb_hooks

- `pb_hooks/games.pb.js`:
  - Custom route `GET /api/joint/games/search?q=…` (public): Steam store search + `appdetails` fetch, upsert into `games`, return top suggestions (name, capsule, appId). Falls back to local `games` cache (ILIKE search) when Steam fails. Timeout ~3s.
  - `onRecordCreateRequest`/`onRecordUpdateRequest` hooks for `lobbies`/`events`: if `gameRef` empty, best-effort match `game` text against Steam search → fill `gameRef`. **Never blocks the save**; `lastEnrichedAt` TTL (e.g. 7 days) avoids hammering Steam.
- `pb_hooks/lobbies.pb.js`: validation on participant create — reject `full` (count ≥ playersWanted), `closed` (isClosed), `duplicate` with machine-readable error codes. Same pattern for `event_attendees` (`event` capacity if defined).

## Sync Flows (Web ↔ Discord)

**Web → Discord** (bot gains realtime listeners on `lobbies` + `lobby_participants`):

1. **Lobby created on web** → `discordMessageId` empty + `createdBy` set → bot posts the same LFG embed + thread as `/lobby` → writes `discordMessageId`/`discordThreadId` back. Idempotent: only records missing the marker are posted; boot reconcile retries unposted ones (same pattern as existing `seedState()`).
2. **Join/leave on web** → `lobby_participants` row with `discordUserId` (resolved from `users.discordId`) → bot edits embed count + syncs thread members (existing logic).
3. **Close on web** (creator) → `isClosed = true` → bot flips embed to closed + locks thread.
4. **Event create/edit/cancel on web** → existing realtime announce + guild-event sync handles it unchanged.

**Discord → Web**: bot already writes participants/attendees/edits to PB. Web receives live updates via PocketBase realtime subscriptions (no refresh needed).

**Failure modes:** bot offline → web-created lobby has no Discord post until reconcile; join on full/closed lobby → hook 400 → German toast; user without `discordId` → join buttons disabled with hint.

## Frontend

**Stack** (`apps/web`, new workspace app wired into turbo with `dev`/`build`/`check-types`/`lint`):

- React 19 + Vite + TypeScript, React Router v7 (library mode)
- TanStack Query v5 + official `pocketbase` SDK; PB realtime subscriptions invalidate query caches
- Tailwind CSS v4 with Discord-Arcade theme tokens (CSS variables)
- Radix primitives (dialog/dropdown/tooltip) + lucide-react icons
- Build output goes to `apps/backend/pb_public/` (gitignored) for same-origin serving

**Routes** (German copy throughout):

| Route | Page |
|---|---|
| `/` | Discover: hero ("Finde deine Squad"), Filter-Chips, Events-Feed links, Lobby-Sidebar rechts (Fortschrittsbalken) |
| `/events` | Event-Liste, Tabs Bevorstehend/Vergangene |
| `/events/:id` | Detail: Cover-Hero (Steam header), Teilnehmer-Avatare, Teilnehmen/Zurückziehen, Discord-Thread-Link, Bearbeiten/Abbrechen für Creator |
| `/events/new`, `/events/:id/bearbeiten` | Event-Formular (Titel, Beschreibung, Spiel-Combobox, Ort, Start/Ende, Banner) |
| `/lobbies` | Offene Lobbys |
| `/lobbies/:id` | Detail: Teilnehmer, Beitreten/Verlassen, Schließen (Creator), Discord-Thread-Link |
| `/lobbies/neu` | Lobby-Formular (Spiel, Spieler gesucht, Start optional, Ort optional) |
| `/me` | Profil: erstellte & beigetretene Events/Lobbys, Nickname, Discord-Avatar |
| `*` | 404-Seite |

**Auth**: "Anmelden mit Discord" → PocketBase OAuth2 popup flow (`pb.collection("users").authWithOAuth2({ provider: "discord" })`); session persisted by SDK; topbar avatar dropdown (Profil, Abmelden). No dedicated login page.

**Key components**: `AppShell` (topbar: Logo, Nav, Login/Avatar) · `EventCard` (Cover, Datum-Chip, Teilnehmerzahl) · `LobbyCard` (Cover, Slots-Fortschritt) · `ParticipantAvatars` · `GameCombobox` (debounced search route, shows capsule art) · `JoinButton` (optimistic) · form components with zod validation · `Skeleton`s · `EmptyState`.

**Realtime**: subscriptions on `events`, `event_attendees`, `lobbies`, `lobby_participants`, `games` → TanStack Query cache invalidation. On unsubscribe/visibility change: refetch.

## Error Handling

- **Frontend**: skeleton loading; German error states with retry; optimistic join/leave with rollback + toast; zod inline validation; 404 page; OAuth popup errors → toast; realtime loss → silent refetch on focus.
- **Hooks**: Steam enrichment non-blocking (text-only save, null `gameRef`); TTL cache; search fallback to local cache; validation errors with codes `full` / `closed` / `duplicate` mapped to German messages client-side.
- **Bot**: sync errors logged, process never crashes; idempotent writes; boot reconcile for unposted lobbies.

## Testing

- **`apps/web`**: Vitest + React Testing Library; PocketBase client mocked. Cover: join/leave optimistic logic + rollback, form validation, GameCombobox debounce, auth store.
- **`pb_hooks`**: game matching/parsing extracted into pure functions (`games-utils.js`), tested with `node --test`.
- **`bot`**: extend existing `tsx --test` suite for web-lobby posting/reconcile logic.
- **Workspace**: `turbo run check-types` + `pnpm lint` green.
- **E2E (manual, during implementation)**: create lobby on web → appears in Discord; join in Discord → updates on web; signed-out browsing works; Steam enrichment fills cover art.

## Out of Scope (this iteration)

Game catalog/game detail pages, realtime web chat, creator moderation (kick attendees), i18n framework (German only), mobile native, admin dashboard, separate hosting.

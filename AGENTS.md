# AGENTS.md

Hinweise für KI-Agenten (Claude Code, Codex & Co.) in diesem Repository. Ausführliche Doku für
Menschen: [apps/client/README.md](apps/client/README.md).

## Projekt

Jelly ist ein Desktop-Begleiter (Tauri 2) für die LAN am Umwelt-Campus Birkenfeld. pnpm-/Turborepo-
Monorepo mit zwei Apps: `apps/client` mit Rust-Backend (`src-tauri/`) und React-19-/TypeScript-7-
Oberfläche mit React Three Fiber (`src/`), dazu `apps/server` in Go. Das 3D-Jelly steht in
`packages/jelly-scene` (`@jelly/scene`), App und Bühne des Servers zeigen damit dasselbe Jelly. Die
3D-Bühne steht in `packages/jelly-stage` (`@jelly/stage`), Server-Seite und Karte der App zeigen
damit dieselbe Halle. Der Server entscheidet über XP, Level, Cosmetics und Erfolge. In der App spricht
Rust mit ihm und hält das Secret, lokal liegen nur Secret und Geräte-Einstellungen. Die Oberfläche zeigt
nur an. Regeln, Aufbau und Vertrag des Servers stehen in
[apps/server/README.md](apps/server/README.md) und [apps/server/docs/api.md](apps/server/docs/api.md).

## Befehle

`pnpm install` im Root. Für den Server in `apps/server` und für beide Pakete in `packages/`:
`pnpm test`, `pnpm lint`, `pnpm run check-types`, `pnpm format` (Server zusätzlich `pnpm build`).
Alles andere in `apps/client`:

```sh
pnpm test             # Vitest (Frontend und scripts/)
pnpm run test:rust    # cargo test
pnpm lint             # oxlint + clippy -D warnings, muss ohne Warnungen durchlaufen
pnpm run check-types  # tsc --noEmit
pnpm run build        # Typprüfung + Vite-Build
pnpm run format       # oxfmt (ts, tsx, mjs, md) + cargo fmt
pnpm run doc:rust     # cargo doc inkl. privater Items
pnpm run webpreview:dev   # nur Oberfläche im Browser, ohne Backend (127.0.0.1:1420)
pnpm run tauri dev        # echte Desktop-App
```

Nach Änderungen mindestens `pnpm test`, `pnpm run test:rust`, `pnpm lint` und `pnpm run build`
ausführen. Cargo immer über die pnpm-Skripte (`scripts/native.mjs` ergänzt den Cargo-Pfad). Nach
Änderungen in `packages/jelly-scene` dort `pnpm test`, `pnpm lint` und `pnpm run check-types`
ausführen, dazu die Prüfungen von Client und Server, denn beide nutzen das Paket. Dasselbe gilt für
`packages/jelly-stage`.

## Wo was liegt

- `src/backend.ts`: einziger Ort mit `invoke()`. Ein Wrapper je Befehl aus `src-tauri/src/commands.rs`.
- `src/usePet.ts`, `src/useGame.ts`: Spielstand, Aktionen, Server-Ereignisse, Tastatur-Stupser,
  Größen-Regler.
- `src/pet/`: reine Logik ohne React/Three. Spiegelt den Server-Vertrag und `src-tauri/src/pet.rs`.
- `src/Studio.tsx`, `src/studio/`, `src/studio.css`: Anpassen direkt am Jelly. Die Tropfen zeichnet
  `src/scene/LiquidGlass.tsx` per Shader in die Canvas, das DOM liefert Knöpfe und mit `data-liquid`
  die Vorlagen für ihre Form.
- `src/Hatch.tsx`, `src/hatch.css`, `src/pet/hatch.ts`: der Einstieg auf der Bühne. Das Jelly sitzt in einem Ei aus Glas
  (`data-liquid="thin"`), fragt nach Name, Farbe und Code und schlüpft mit Licht und Spritzern aus `LevelUp.tsx`. In der
  Browser-Vorschau zeigen ihn `/#join`, `/#join-again`, `/#join-lost` und `/#join-nolan`, der Code `falsch` zeigt den Fehler, `offen` lässt die laufende LAN offen.
- `src/PetStage.tsx`: Sprechblase, Jelly und seine Overlays. `src/EmotePicker.tsx`, `src/useEmotes.ts`,
  `src/emotes.css`: Emote-Tropfen, Aufruf und laufende Geste. `src/SignPicker.tsx`, `src/useSigns.ts`,
  `src/signs.css`, `src/scene/SignBoard.tsx`: Schild-Tropfen, Kapsel-Säule und die Tafel in den Händen.
  `src/LevelUp.tsx`, `src/levelup.css`: der Levelaufstieg auf der Bühne, im Takt der Fanfare (`LEVEL_UP`). In der
  Browser-Vorschau zeigt ihn `/#levelup`.
- Dazustellen, Ausflug und Hervorheben gehen auf der Karte (`src/map/main.ts`, `src/map/actions.ts`),
  `src/useFollow.ts` lässt das Pet auf Dazustellen und Ausflug reagieren. Partner-Emotes als Aufforderung
  (`POST` und `PATCH /v1/partner-emotes`): Auffordern geht in `src/map/partner.ts`, Antworten und Duett im Pet
  (`src/usePartnerEmote.ts`, `src/panels/PartnerInvitePopup.tsx`). Das andere Jelly erfährt davon per
  `partner_emote.updated`, die Annahme erreicht den Auffordernden per `partner.emote`. Beide Ereignisse schließen
  die Karte (`closes_map` in `src-tauri/src/events.rs`).
- `src/voice.ts` (Synthesizer), `src/useJellyVoice.ts`, `src/pet/voice.ts` und `src/pet/voiceClips.ts`
  (Noten, reine Logik): die Stimme des Jellys. Abschalten und leiser stellen gehen über `Settings.sound` und `Settings.volume`.
  `src/pet/mouth.ts`: welche Mundform zu welcher Note gehört, die Formen stehen in `mouthShapes.ts` im Paket.
- `src/pet/rendering.ts`, `src/optimized.css`: der optimierte Modus (`Settings.optimizedRendering`). Das Profil
  sagt der Szene, was sie zeichnet, das CSS gibt dem DOM eigene Flächen. Messung und Shader-Prüfung:
  `scripts/render-check.html` (`render-report.mjs` wertet aus), Ergebnisse in `apps/client/docs/optimized-rendering.md`.
- `src/pet/frameRate.ts`: der Regler der Bildrate (`Settings.frameLimit`, `null` heißt unbegrenzt).
  `packages/jelly-stage/src/framePacing.ts` entscheidet für Jelly, Karte und Karten-Glas, welche
  Bildschirmaktualisierung ein Bild wird.
- `src/panels/`, `src/scene/` (Canvas, Kamera, Anker und Glas von Studio, Emotes und Schildern,
  Cosmetics), `src/ui/` (Design-System).
- `packages/jelly-scene/src/`: das Jelly als reines Three.js. `jelly.ts` baut und animiert es,
  `body.ts` (geraymarchter Körper, Shader in `shaders/`, volle und optimierte Variante per `JellyQuality`), `face.ts`, `mouthShapes.ts`, `animation.ts`,
  `emotes.ts` (Schlüssel, Dauer), `emoteAnimation.ts` (Gesten), `partnerEmotes.ts` (Duett-Posen der
  Partner-Emotes, reine Rechnung), `jellyGeometry.ts` (Maße), `colors.ts` (Farben), `cosmetic.ts` (Cosmetics
  laden und zeichnen, Modelle in `cosmetics/`).
- `packages/jelly-stage/src/`: die Bühne als reines Three.js. `view.ts` startet sie auf einer Canvas,
  `source.ts` beschreibt ihre Daten, `labels.ts` und `picking.ts` zeichnen Namen und finden das Jelly
  unter dem Zeiger, `floorPicking.ts` den Punkt auf dem Boden, `pointer.ts` markiert das Ziel eines
  Ausflugs, `beams.ts` zeichnet das Licht beim Hervorheben, `choiceRings.ts` die Ringe beim Auswählen, `worn.ts` merkt sich, was ein Jelly trägt, `moves.ts` und `walking.ts` spielen die Wege
  des Servers ab, der Rest ist der Raum.
- `map.html`, `src/map/`: die Karte im eigenen Fenster, ohne React. `main.ts` (Seite, Klicks),
  `source.ts` (Daten aus Rust), `preview.ts` (Browser-Vorschau), `partner.ts` (Partner-Emote starten),
  `actions.ts` (Fenster am fremden Jelly), `search.ts` (Jelly per Namen suchen), `glass.ts` (Glas der Knöpfe, eigene Canvas, Material aus `src/scene/glassMaterial.ts`). `src/MapDrop.tsx`: der Glas-Tropfen am Jelly, der
  sie öffnet.
- `src-tauri/src/`: `lib.rs` (Zusammenbau), `commands.rs`, `commands/session.rs` (Sitzung und Spielstand),
  `commands/partner.rs`, `commands/stage.rs`, `api.rs` (HTTP), `api/types.rs`, `api/stage.rs` (Server-Typen),
  `events.rs` (Server-Stream), `map.rs` (Fenster der Karte), `error.rs`, `pet.rs` (lokaler Stand,
  reine Regeln), `store.rs` (atomares Speichern von `jelly.json`).

## Regeln, die man leicht übersieht

- **Server, Rust und TypeScript spiegeln sich.** Server-Typen stehen in `api/types.rs`, `api/stage.rs` und
  `src/pet/types.ts` mit den snake_case-Namen aus `apps/server/docs/openapi.json`, lokale Typen in
  `pet.rs` und `types.ts`. Immer alle Seiten ändern. Der Server erzwingt, die App zeigt nur an.
- **Server-Typen ohne `deny_unknown_fields`.** Der Server darf Felder, Ereignisse und Fehlercodes
  ergänzen. Nur der lokale Stand (`Local`, `Settings`) lehnt Unbekanntes ab.
- **Server-Adresse** kommt beim Bauen aus `JELLY_SERVER_URL` (sonst `http://localhost:8080`). HTTP
  läuft nur in Rust, die CSP der Oberfläche bleibt bei `ipc:`.
- **Neuer Tauri-Befehl:** in `commands.rs` anlegen, in `lib.rs` bei `generate_handler!` eintragen,
  Wrapper in `src/backend.ts`. Fensterrechte stehen in `src-tauri/capabilities/`, je Fenster eine Datei.
- **Fehler** sind Varianten von `Error` in `error.rs` mit deutscher Meldung. Kein `String` als
  Fehlertyp.
- **`src/ui/*.tsx`**: Jede exportierte Funktion landet als Komponente im Design-System-Bundle
  (`scripts/ds-bundle.mjs`, `window.Jelly`). Hilfsfunktionen gehören in `.ts`-Dateien.
- **Shader** werden per `?raw` importiert. Werte aus TypeScript kommen über `defines` des
  `ShaderMaterial` hinein (siehe `HEAD_R` in `packages/jelly-scene/src/body.ts`), nicht per
  String-Interpolation.
- **Jelly ändern** heißt `packages/jelly-scene` ändern und App und Server-Bühne im Browser ansehen.
  Im Jelly gibt es nur `Object3D`, keine `Group`: Die Bühne sortiert ganze Jellies über ihre äußere
  `Group`. `three` hat in Client, Server und Paket dieselbe Version.
- **Neues Cosmetic:** Export aus `apps/client/blender/` nach `packages/jelly-scene/src/cosmetics/`, dazu eine
  Import-Zeile in `COSMETIC_MODELS` (`cosmetic.ts`). App, Karte und Beamer zeigen es dann, in der App als Sticker,
  auf der Bühne mit echter Tiefe. Die Modelle liegen im Bundle: Die CSP der App verbietet `fetch`, und `tauri dev`
  zeigt das nicht, denn dort gilt keine CSP. Einen Ladefehler sieht man nur im gebauten Binary.
- **Bühne ändern** heißt `packages/jelly-stage` ändern und Server-Seite und Karte der App ansehen.
  Das Paket spricht nicht mit dem Netz: Jeder Nutzer bringt seine `StageSource` mit, die App holt
  alles über Rust. Was nur die Karte braucht (Markierungen, Treffer), bleibt auf dem Beamer aus.
- **Neue Tropfen brauchen auch eine Fläche:** Im optimierten Modus läuft `LiquidGlass` nicht. Jedes neue sichtbare
  `data-liquid`-Element bekommt in `src/optimized.css` einen eigenen Hintergrund, reine Vorlagen werden dort
  ausgeblendet. Jede Schwebe-Animation wird dort abgeschaltet. Die Karte lässt ihr Glas (`src/map/glass.ts`) im
  optimierten Modus ebenfalls weg, ihre `.glass-pill`-Knöpfe bleiben dann einfarbig (`src/map/map.css`).
- **Takt des Jellys:** `AnimationClock` in `src/scene/PetScene.tsx` zeichnet mit `advance`. Ein `invalidate` aus einem
  `requestAnimationFrame` käme erst im nächsten Bild an und halbierte die Bildrate am Bildschirmtakt.
- **Identifier** `de.ucb.jelly` nicht ändern, sonst findet die App vorhandene Spielstände nicht mehr.
- **Kein TypeDoc**, solange es TypeScript 7 nicht unterstützt (Begründung in der README).
- **App-Icon** kommt aus `apps/client/public/pet.svg`. Neu erzeugen mit
  `pnpm tauri icon public/pet.svg -o <tmp>` und nur `icon.png` und `icon.ico` nach
  `src-tauri/icons/` kopieren.

## Skills

Projekt-Skills liegen in `.claude/skills/` und sind in `skills-lock.json` festgehalten
(Tauri, Rust, Three.js-Shader, React Three Fiber, Vitest, React). Aktualisieren mit
`npx skills update -p`. Wo ein Skill den Regeln oben widerspricht, gelten die Regeln oben.

## Stil

- Kommentare und Doku-Kommentare auf **Deutsch**, ebenso UI-Texte und Fehlermeldungen. Im Server
  und in `packages/jelly-stage`, das aus ihm stammt, sind Code und Kommentare Englisch, siehe
  [apps/server/AGENTS.md](apps/server/AGENTS.md).
- TypeScript: jede Datei mit `/** … @module */`, jeder Export mit `/** … */` (TSDoc). Typen nicht im
  Kommentar wiederholen. `//` erklärt das Warum.
- Rust: `//!` je Datei, `///` je Item, `# Fehler` bei `Result`. `#![warn(missing_docs)]` ist aktiv.
- Lint-Schwellen (oxlint): höchstens 350 Zeilen pro Datei, 60 pro Funktion, Komplexität 12, 4
  Parameter. Lieber kleine Funktionen und Komponenten abspalten als Schwellen anheben.
- Formatierung macht oxfmt bzw. rustfmt. Nicht von Hand formatieren.
- Commits nur auf ausdrücklichen Wunsch.

## Commit-Nachrichten

Commits bleiben klein und häufig, zum Aufräumen wird bei Bedarf gesquasht.

Nach [Conventional Commits](https://www.conventionalcommits.org/de/v1.0.0/), auf Englisch. Die erste
Zeile nennt Typ, optional den Bereich und eine kurze Beschreibung. Darunter steht in Stichpunkten die
Arbeit auf hoher Ebene.

```text
feat(server): add registration and pokes

- create accounts with join code and token
- grant poke XP using the rules of the LAN
- document the API and rule test cases
```

Typen: `feat` (neue Funktion), `fix` (Fehler behoben), `refactor` (Umbau ohne neues Verhalten),
`docs`, `test`, `style`, `perf`, `build`, `ci`, `chore` (Pflege), `revert`. Bereiche: `server`,
`client`, `scene` (das Paket `packages/jelly-scene`), `stage` (das Paket `packages/jelly-stage`).
Inkompatible Änderungen tragen ein `!` nach Typ oder Bereich.

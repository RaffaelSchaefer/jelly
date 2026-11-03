# AGENTS.md

Hinweise für KI-Agenten (Claude Code, Codex & Co.) in diesem Repository. Ausführliche Doku für
Menschen: [apps/client/README.md](apps/client/README.md).

## Projekt

Jelly ist ein Desktop-Begleiter (Tauri 2) für die LAN am Umwelt-Campus Birkenfeld. pnpm-/Turborepo-
Monorepo mit zwei Apps: `apps/client` mit Rust-Backend (`src-tauri/`) und React-19-/TypeScript-7-
Oberfläche mit React Three Fiber (`src/`), dazu `apps/server` in Go. Das 3D-Jelly steht in
`packages/jelly-scene` (`@jelly/scene`), App und Bühne des Servers zeigen damit dasselbe Jelly. Noch
sind App und Server nicht verbunden: In der App besitzt Rust den Spielstand, die Oberfläche zeigt nur
an. Künftig entscheidet der Server über XP. Regeln, Aufbau und Vertrag des Servers stehen in
[apps/server/README.md](apps/server/README.md) und [apps/server/docs/api.md](apps/server/docs/api.md).

## Befehle

`pnpm install` im Root. Für den Server in `apps/server` und für `packages/jelly-scene`: `pnpm test`,
`pnpm lint`, `pnpm run check-types`, `pnpm format` (Server zusätzlich `pnpm build`). Alles andere in
`apps/client`:

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
ausführen. Cargo immer über die pnpm-Skripte (`scripts/native.mjs` ergänzt den Cargo-Pfad).

## Wo was liegt

- `src/backend.ts`: einziger Ort mit `invoke()`. Ein Wrapper je Befehl aus `src-tauri/src/commands.rs`.
- `src/usePet.ts`: Spielstand, Aktionen, Tastatur-Stupser, Größen-Regler.
- `src/pet/`: reine Logik ohne React/Three. Spiegelt `src-tauri/src/pet.rs`.
- `src/panels/`, `src/scene/` (Canvas, Cosmetics, ihre Shader), `src/ui/` (Design-System).
- `packages/jelly-scene/src/`: das Jelly als reines Three.js. `jelly.ts` baut und animiert es,
  `body.ts` (geraymarchter Körper, Shader in `shaders/`), `face.ts`, `animation.ts`,
  `jellyGeometry.ts` (Maße), `colors.ts` (Farben).
- `src-tauri/src/`: `lib.rs` (Zusammenbau), `commands.rs`, `error.rs`, `pet.rs` (Regeln, kein IO),
  `store.rs` (atomares Speichern).

## Regeln, die man leicht übersieht

- **Rust und TypeScript spiegeln sich.** Typen, Grenzwerte und XP-Werte stehen in `pet.rs` und in
  `src/pet/types.ts` bzw. `src/pet/reports.ts`. Immer beide Seiten ändern. Rust erzwingt, die
  Oberfläche zeigt nur an.
- **Neuer Tauri-Befehl:** in `commands.rs` anlegen, in `lib.rs` bei `generate_handler!` eintragen,
  Wrapper in `src/backend.ts`. Fensterrechte stehen in `src-tauri/capabilities/main.json`.
- **Fehler** sind Varianten von `Error` in `error.rs` mit deutscher Meldung. Kein `String` als
  Fehlertyp.
- **`Appearance`** hat in Rust `deny_unknown_fields`: nie ein ganzes `Pet` schicken, sondern
  `appearanceOf(pet)` verwenden.
- **`src/ui/*.tsx`**: Jede exportierte Funktion landet als Komponente im Design-System-Bundle
  (`scripts/ds-bundle.mjs`, `window.Jelly`). Hilfsfunktionen gehören in `.ts`-Dateien.
- **Shader** werden per `?raw` importiert. Werte aus TypeScript kommen über `defines` des
  `ShaderMaterial` hinein (siehe `HEAD_R` in `packages/jelly-scene/src/body.ts`), nicht per
  String-Interpolation.
- **Jelly ändern** heißt `packages/jelly-scene` ändern und App und Server-Bühne im Browser ansehen.
  Im Jelly gibt es nur `Object3D`, keine `Group`: Die Bühne sortiert ganze Jellies über ihre äußere
  `Group`. `three` hat in Client, Server und Paket dieselbe Version.
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
  sind Code und Kommentare Englisch, siehe [apps/server/AGENTS.md](apps/server/AGENTS.md).
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
`client`, `scene` (das Paket `packages/jelly-scene`). Inkompatible Änderungen tragen ein `!` nach
Typ oder Bereich.

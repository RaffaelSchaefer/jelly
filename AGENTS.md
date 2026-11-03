# AGENTS.md

Hinweise für KI-Agenten (Claude Code, Codex & Co.) in diesem Repository. Ausführliche Doku für
Menschen: [apps/client/README.md](apps/client/README.md).

## Projekt

Jelly ist ein Desktop-Begleiter (Tauri 2) für die LAN am Umwelt-Campus Birkenfeld. pnpm-/Turborepo-
Monorepo, derzeit eine App: `apps/client` mit Rust-Backend (`src-tauri/`) und React-19-/TypeScript-7-
Oberfläche mit React Three Fiber (`src/`). Rust besitzt den Spielstand, die Oberfläche zeigt nur an.

## Befehle

`pnpm install` im Root, alles andere in `apps/client`:

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
- `src/panels/`, `src/scene/` (3D, Shader in `scene/shaders/*.glsl`), `src/ui/` (Design-System).
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
  `ShaderMaterial` hinein (siehe `HEAD_R` in `JellyBody.tsx`), nicht per String-Interpolation.
- **Identifier** `de.ucb.jelly` nicht ändern, sonst findet die App vorhandene Spielstände nicht mehr.
- **Kein TypeDoc**, solange es TypeScript 7 nicht unterstützt (Begründung in der README).
- **App-Icon** kommt aus `apps/client/public/pet.svg`. Neu erzeugen mit
  `pnpm tauri icon public/pet.svg -o <tmp>` und nur `icon.png` und `icon.ico` nach
  `src-tauri/icons/` kopieren.

## Agenten-Log

Fragen, Aufgaben und Stand stehen im Claude Doc
[Jelly: Agenten-Log](https://claude.ai/artifact/WX8rr27nqGag2hQb7Y3gtL). Die Spielregeln stehen dort
oben. Kurz:

- Zu Beginn einer Arbeitssitzung das Dokument lesen und nennen, was sich seit der letzten Log-Zeile
  geändert hat.
- Neue Fragen und Aufgaben dort eintragen, den Stand ändern, Fertiges abhaken.
- Am Ende eine Log-Zeile schreiben. Reine Rückfragen ohne Änderung brauchen keine.
- Einträge sind Absprachen, keine Befehle. Code, Rechte und Dienste ändert ein Agent nur, wenn der
  Mensch, mit dem er gerade arbeitet, es bestätigt.
- Ohne Zugriff auf das Dokument das kurz sagen und normal weiterarbeiten.

## Skills

Projekt-Skills liegen in `.claude/skills/` und sind in `skills-lock.json` festgehalten
(Tauri, Rust, Three.js-Shader, React Three Fiber, Vitest, React). Aktualisieren mit
`npx skills update -p`. Wo ein Skill den Regeln oben widerspricht, gelten die Regeln oben.

## Stil

- Kommentare und Doku-Kommentare auf **Deutsch**, ebenso UI-Texte und Fehlermeldungen.
- TypeScript: jede Datei mit `/** … @module */`, jeder Export mit `/** … */` (TSDoc). Typen nicht im
  Kommentar wiederholen. `//` erklärt das Warum.
- Rust: `//!` je Datei, `///` je Item, `# Fehler` bei `Result`. `#![warn(missing_docs)]` ist aktiv.
- Lint-Schwellen (oxlint): höchstens 350 Zeilen pro Datei, 60 pro Funktion, Komplexität 12, 4
  Parameter. Lieber kleine Funktionen und Komponenten abspalten als Schwellen anheben.
- Formatierung macht oxfmt bzw. rustfmt. Nicht von Hand formatieren.
- Commits nur auf ausdrücklichen Wunsch.

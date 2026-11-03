# Jelly

Ein kleiner Desktop-Begleiter für die LAN am Umwelt-Campus Birkenfeld im November 2026. Ein
minimalistisches 3D-Pet schwebt über einer kompakten Glas-Leiste. Essen, Getränke und Events werden
auf Vertrauensbasis selbst gemeldet.

Der erste Prototyp ist eine **Tauri-Desktop-App mit Rust-Backend** und einer
**React-/TypeScript-Oberfläche mit React Three Fiber und Three.js**. Die 3D-Figur ist ein
austauschbarer Platzhalter mit eigenen Shadern.

## Starten

Benötigt: Node.js 24 LTS mit pnpm (Monorepo-Root `joint`), aktuelles Rust stable sowie die
[Tauri-Systemvoraussetzungen](https://v2.tauri.app/start/prerequisites/). Unter Windows sind
insbesondere MSVC-Buildtools und WebView2 nötig. Linux benötigt unter anderem WebKitGTK 4.1 und die
in der Tauri-Dokumentation für die jeweilige Distribution aufgeführten Entwicklungspakete. macOS
benötigt Xcode Command Line Tools.

```sh
pnpm install
pnpm run tauri dev
```

`pnpm install` läuft im Monorepo-Root, die übrigen Befehle in `apps/client`.

Das öffnet das transparente Desktop-Pet. Über die Punkte oben links wird es verschoben; oben rechts
lässt es sich minimieren oder schließen. Eine minimierte App lässt sich über die Taskleiste wieder
aufrufen.

Falls dein Node-Versionsmanager noch keine aktive Version hat, aktiviere zuerst Node 24; die
getestete Version steht in `.nvmrc` im Monorepo-Root.

Die pnpm-Skripte für Tauri und Rust ergänzen für ihre Unterprozesse automatisch `$CARGO_HOME/bin`
beziehungsweise `~/.cargo/bin`. Damit funktioniert eine bereits installierte Rustup-Toolchain auch
dann, wenn ein noch offenes Terminal den bei der Installation ergänzten Suchpfad noch nicht
übernommen hat. Die globale PATH-Konfiguration wird dabei nicht verändert. Direkte Rust-Befehle
lassen sich über `pnpm run rust -- <Cargo-Argumente>` ausführen.

Nur die Oberfläche im Browser ansehen:

```sh
pnpm run webpreview:dev
```

Die Vorschau liegt unter [localhost:1420](http://127.0.0.1:1420). Dort lassen sich die Panels und
das Aussehen ausprobieren. **XP-Aktionen und Speicherung laufen ausschließlich im nativen
Rust-Backend** und sind im Browser deaktiviert.

## Im Prototyp enthalten

- Transparentes, rahmenloses, verschiebbares Fenster, stets im Vordergrund.
- Animiertes Jelly-Pet mit Raymarching-Shader; drei Farben und ein eigener Name.
- Cosmetics zum Freischalten über Level, Erfolge und Events. Die 3D-Modelle kommen aus der
  Blender-Pipeline in `blender/`; im Repository liegen noch keine.
- Kleine Glas-Leiste mit LAN-Aktionen, Anpassung und Einstellungen.
- Essen: +15 XP, Getränk: +10 XP, Event: +30 XP; je 100 XP ein Level. Selbstmeldungen haben je Art
  eine Abklingzeit von 30 Minuten und ein Limit von 8 pro 24 Stunden.
- Pet-Klicks und Tasten im fokussierten Pet-Fenster: +1 XP, maximal einmal pro Sekunde. Eingaben in
  Formularen und auf Bedienelementen werden nicht gezählt.
- Lokaler Spielstand in `pet.json` im plattformspezifischen App-Datenverzeichnis für
  `de.ucb.jelly`. Rust validiert den Zustand und ersetzt die Datei erst nach einem vollständigen
  Schreibvorgang. Fehler werden im Pet angezeigt; defekte oder unbekannte Dateiformate werden nicht
  still zurückgesetzt.
- Eine zweite gestartete Instanz aktiviert das vorhandene Pet, damit nicht zwei unabhängige Prozesse
  denselben Spielstand überschreiben.
- Animation mit etwa 30 Bildern pro Sekunde, begrenzter Pixeldichte und Pause bei verborgenem
  WebView. Die Option „Weniger Bewegung“ und die entsprechende Systemeinstellung reduzieren die
  Animation auf eine statische Darstellung.

> **Umbenennung:** Bis Ende Oktober 2026 hieß die App „LAN Desk Pet“ mit dem Identifier
> `de.ucb.lan-desk-pet`. Spielstände von damals liegen weiter im alten App-Datenverzeichnis und
> werden nicht übernommen. Wer einen behalten will, kopiert die alte `pet.json` in das neue
> Verzeichnis.

## Aufbau

```text
src/
  main.tsx            Einstieg: Desktop oder Browser-Vorschau, React starten
  App.tsx             Fenster zusammenstecken: Knöpfe, Bühne, Panel, Dock
  backend.ts          einziger Ort mit Tauri-Aufrufen, ein Wrapper je Rust-Befehl
  usePet.ts           Hooks: Spielstand, Aktionen, Tastatur-Stupser, Größen-Regler
  pet/                reine Spiellogik ohne React (spiegelt src-tauri/src/pet.rs)
  panels/             Inhalte der Glas-Panels (XP mit Reitern, Level, Aussehen, Einstellungen)
  scene/              3D: Canvas, Pet und Cosmetics; Jelly und Animation aus packages/jelly-scene
    shaders/          GLSL der Cosmetics (Toon, Outline), per `?raw` importiert
  ui/                 Design-System-Bausteine (siehe `pnpm ds:bundle`)
  cosmetics/          3D-Modelle (.glb) aus Blender, nach Cosmetic-ID benannt
  styles.css          Transparenz, Leiste, Panels und Browser-Vorschau
src-tauri/
  src/main.rs         Desktop-Einstieg, ruft nur jelly_lib::run()
  src/lib.rs          App zusammensetzen: Plugins, State, Befehle
  src/commands.rs     Tauri-Befehle, die die Oberfläche aufruft
  src/error.rs        alle Fehler mit deutscher Meldung für die Oberfläche
  src/pet.rs          Spielmodell, XP-Regeln und Validierung, ohne Dateizugriff
  src/store.rs        Spielstand atomar laden und speichern
  tauri.conf.json     Desktop-Fenster und Content Security Policy
  capabilities/       Berechtigungen für Fensterbedienung
blender/              Cosmetic-Pipeline und Referenzkörper für Blender
scripts/              Hilfsskripte (Rust-Pfad, Design-System-Bundle, Blender-Export)
```

Die Oberfläche übermittelt nur die Aktion oder die Anpassung an Rust; sie kann keinen beliebigen
XP-Wert oder Dateipfad setzen. Die App hat noch keine Accounts und spricht noch nicht mit dem Server
in `apps/server`. Eine externe Kauf- oder Veranstaltungsprüfung gibt es nicht.

## Dokumentation und Konventionen

Kommentare und Doku-Kommentare sind auf Deutsch, UI-Texte ebenfalls.

**TypeScript** (TSDoc-Syntax, im Editor beim Überfahren sichtbar):

- Jede Datei beginnt mit `/** … @module */`: welche Rolle sie hat und mit wem sie spricht.
- Jeder Export bekommt `/** … */` mit einem Satz, was er ist. `@param`/`@returns` nur, wenn der
  Name nicht reicht. Typen stehen nie im Kommentar, die kennt TypeScript.
- Werte, die Rust erzwingt (Grenzen, XP, Typen), nennen ihr Gegenstück in Rust.
- `//` im Code erklärt das Warum, nie das Was.

**Rust** (`cargo doc`):

- `//!` am Kopf jeder Datei, `///` an jedem Item. Funktionen mit `Result` nennen ihre Fehler unter
  `# Fehler`.
- `#![warn(missing_docs)]` ist aktiv. Fehlende Doku an öffentlichen Items lässt `pnpm lint`
  scheitern.

```sh
pnpm run doc:rust   # erzeugt src-tauri/target/doc/jelly_lib/index.html
```

## Prüfen und bauen

```sh
pnpm test
pnpm run test:rust
pnpm lint
pnpm run build
pnpm run rust -- fmt --manifest-path src-tauri/Cargo.toml --check
pnpm run tauri build -- --debug --no-bundle
```

`pnpm lint` prüft TypeScript mit oxlint und Rust mit clippy (Warnungen sind Fehler). Der letzte
Befehl erstellt einen nativen Debug-Build, unter Windows in `src-tauri/target/debug/jelly.exe`.
Installer, Signierung und Updates sind noch nicht konfiguriert. `pnpm run check` kombiniert die
Frontend-Tests, den Frontend-Build und die Rust-Tests.

## Bewusste Grenzen und nächste Schritte

1. **Aktivität während des Spielens:** Systemweite Eingaben sind noch nicht angebunden. Zunächst eine
   optionale Windows-Integration und die Möglichkeiten unter Linux/X11 und Wayland separat prüfen. Es
   sollen Aktivitätszähler an das Pet gehen, keine Tasteninhalte. Kompatibilität mit Spielen und
   Anti-Cheat muss praktisch getestet werden.
2. **Desktop-Verhalten:** Transparente Stellen im rechteckigen Fenster sind noch nicht
   durchklickbar. Position und Fenstergröße werden noch nicht gespeichert. Always-on-top garantiert
   keine Sichtbarkeit über exklusivem Vollbild. Linux und macOS brauchen eigene Tests auf echter
   Hardware.
3. **Charakter und Fortschritt:** Den Platzhalter gemeinsam gestalten, dann Reaktionen und kleine
   Belohnungen passend zur LAN festlegen. Die aktuellen XP-Werte sind Prototypwerte. Noch keine
   Hunger-/Durstsimulation.

WebGL ist vorerst die Rendering-Basis, damit WebGPU keine Startvoraussetzung ist. Ein späterer
WebGPU-Renderer benötigt auch eine passende Portierung der GLSL-Shader. CSS-Glas ist umgesetzt;
echte Unschärfe des Desktop-Wallpapers ist plattformabhängig und noch nicht integriert. Für
transparente macOS-Fenster ist Tauris Private-API-Option aktiviert; das schließt eine
Mac-App-Store-Veröffentlichung in dieser Form aus.

![Browser-Vorschau des ersten Pet-Prototyps](docs/preview.png)

Design und erster Arbeitsplan (noch unter dem alten Namen) liegen in `docs/superpowers/`.

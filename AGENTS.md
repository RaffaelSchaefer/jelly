# AGENTS.md

Hinweise für KI-Agenten (Claude Code, Codex & Co.) in diesem Repository. Ausführliche Doku für
Menschen: [apps/client/README.md](apps/client/README.md).

## Projekt

Jelly ist ein Desktop-Begleiter (Tauri 2) für die LAN am Umwelt-Campus Birkenfeld. pnpm-/Turborepo-
Monorepo mit drei Apps: `apps/client` mit Rust-Backend (`src-tauri/`) und React-19-/TypeScript-7-
Oberfläche mit React Three Fiber (`src/`), `apps/server` in Go und `apps/site`, die statische Website
mit Downloads auf GitHub Pages. Das 3D-Jelly steht in
`packages/jelly-scene` (`@jelly/scene`), App und Bühne des Servers zeigen damit dasselbe Jelly. Die
3D-Bühne steht in `packages/jelly-stage` (`@jelly/stage`), Server-Seite und Karte der App zeigen
damit dieselbe Halle. Der Server entscheidet über XP, Level, Cosmetics und Erfolge. In der App spricht
Rust mit ihm und hält das Secret, lokal liegen nur Secret und Geräte-Einstellungen. Die Oberfläche zeigt
nur an. Regeln, Aufbau und Vertrag des Servers stehen in
[apps/server/README.md](apps/server/README.md) und [apps/server/docs/api.md](apps/server/docs/api.md).

## Befehle

`pnpm install` im Root. Für den Server in `apps/server`, die Website in `apps/site` und für beide
Pakete in `packages/`: `pnpm test`, `pnpm lint`, `pnpm run check-types`, `pnpm format` (Server und
Website zusätzlich `pnpm build`).
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
- `src/pet/`: reine Logik ohne React/Three. Spiegelt den Server-Vertrag und `src-tauri/src/pet.rs`. Ein Modul dort tut
  beim Import nichts: `vite.config.ts` erklärt sie für nebenwirkungsfrei, so landet aus `./pet` nur im Chunk eines
  Fensters, was es nutzt (der Verstand des Zauberers nur im Shop).
- `src/Studio.tsx`, `src/studio/`, `src/studio.css`: Anpassen direkt am Jelly. Die Tropfen zeichnet
  `src/scene/LiquidGlass.tsx` per Shader in die Canvas, das DOM liefert Knöpfe und mit `data-liquid`
  die Vorlagen für ihre Form.
- `src/Hatch.tsx`, `src/hatch.css`, `src/pet/hatch.ts`: der Einstieg auf der Bühne. Das Jelly sitzt in einem Ei aus Glas
  (`data-liquid="thin"`), fragt nach Name, Farbe und Code und schlüpft mit Licht und Spritzern aus `LevelUp.tsx`. In der
  Browser-Vorschau zeigen ihn `/#join`, `/#join-again`, `/#join-lost` und `/#join-nolan`, der Code `falsch` zeigt den Fehler, `offen` lässt die laufende LAN offen.
- `src/PetStage.tsx`: Sprechblase, Jelly und seine Overlays. `src/EmotePicker.tsx`, `src/useEmotes.ts`,
  `src/emotes.css`: Emote-Tropfen, Aufruf und laufende Geste. `src/SignPicker.tsx`, `src/useSigns.ts`,
  `src/signs.css`, `src/scene/SignBoard.tsx`: Schild-Tropfen, Kapsel-Säule und die Tafel in den Händen.
  `src/usePetTouch.ts`, `src/pet/headZones.ts`, `src/scene/TouchZones.tsx`: Nasenstupser und Streicheln. Die Szene
  projiziert Kopf und Nase auf den Bildschirm, `headZones.ts` entscheidet Zone und Geste, gemeldet wird als Stupser
  (`interact("poke", touch)`). Die Bewegung steht in `packages/jelly-scene/src/touch.ts`.
  `src/LevelUp.tsx`, `src/levelup.css`: der Levelaufstieg auf der Bühne, im Takt der Fanfare (`LEVEL_UP`). In der
  Browser-Vorschau zeigt ihn `/#levelup`.
- Dazustellen, Ausflug und Hervorheben gehen auf der Karte (`src/map/main.ts`, `src/map/actions.ts`),
  `src/useFollow.ts` lässt das Pet auf Dazustellen und Ausflug reagieren. Partner-Emotes als Aufforderung
  (`POST` und `PATCH /v1/partner-emotes`): Auffordern geht in `src/map/partner.ts`, Antworten und Duett im Pet
  (`src/usePartnerEmote.ts`, `src/panels/PartnerInvitePopup.tsx`). Das andere Jelly erfährt davon per
  `partner_emote.updated`, die Annahme erreicht den Auffordernden per `partner.emote`. Beide Ereignisse schließen
  Karte und Shop (`closes_popouts` in `src-tauri/src/events.rs`).
- Stapel (`POST /v1/stacks`, `POST /v1/stacks/members`, `DELETE /v1/stacks/current`): Die Knöpfe stehen auf der
  Karte (`src/map/stacks.ts`), am fremden Jelly `#jelly-stack`, am eigenen `#own-stack` unter den Gesten. Steht das
  Jelly zu weit weg, läuft es erst hin und handelt bei der Ankunft (`page.stackPlan`), jede andere Bewegung verwirft
  das. `join_stack` antwortet bei `too_far` mit `null` (`unless_too_far` in `commands/stage.rs`), denn Fehler kommen
  in der Oberfläche nur als Text an. `stack.changed` trägt den ganzen Stapel, solange er steht. Ist er weg, kommt nur
  `{"id"}`, mit dem Jelly, das als letztes abstieg, oder ohne, wenn seine Zeit um ist. Die Bühne rechnet daraus den
  Stand (`packages/jelly-stage/src/stackEvents.ts`), `OwnStack` in `src-tauri/src/events.rs` merkt sich den eigenen
  Stapel, damit das Pet auch das Ende des Stapels hört (`src/useStack.ts`,
  `src/pet/stack.ts`). In der Browser-Vorschau steht ein Turm aus drei Jellies (`src/map/previewStacks.ts`), er
  zerfällt nach 60 Sekunden.
- `src/voice.ts` (Synthesizer), `src/useJellyVoice.ts`, `src/pet/voice.ts` und `src/pet/voiceClips.ts`
  (Noten, reine Logik): die Stimme des Jellys. Tonhöhe und Tempo je Geste stehen in `EMOTE_MOODS`
  (`packages/jelly-scene/src/emotes.ts`), Bewegung und Laut teilen sich das Tempo. Abschalten und leiser stellen gehen über `Settings.sound` und `Settings.volume`.
  `src/pet/mouth.ts`: welche Mundform zu welcher Note gehört, die Formen stehen in `mouthShapes.ts` im Paket.
- `src/uiSound.ts`, `src/useUiSounds.ts`, `src/pet/uiSounds.ts`: Geräusche der Oberfläche aus `src/sounds/`
  (von reactsounds.com, MIT). Ein Hörer im Dokument wählt den Ton aus den Attributen des Knopfs
  (`aria-expanded`, `aria-disabled`, `role="tab"`), `data-sound` überschreibt ihn,
  `data-sound="none"` schweigt. Dazu klingen Schalter, Fehler und Momente im Spielstand (XP, Erfolge,
  Einladung, Schlüpfen, `gameSoundFor`). `LEVELS` gleicht die sehr verschieden lauten Töne an. Was ein Fenster schließt, nutzt `playThen`,
  sonst bricht der Ton mit dem Fenster ab. Die MP3s liegen als Daten im Bundle, das Paket
  `react-sounds` lädt per `fetch` und bliebe unter der CSP stumm.
- `src/pet/rendering.ts`, `src/optimized.css`: der optimierte Modus (`Settings.optimizedRendering`). Das Profil
  sagt der Szene, was sie zeichnet, das CSS gibt dem DOM eigene Flächen. Beim Einstieg schaltet ein zu langsames Gerät
  selbst um (`createSlowFrameMeter`). Messung und Shader-Prüfung:
  `scripts/render-check.html` (`render-report.mjs` wertet aus), Ergebnisse in `apps/client/docs/optimized-rendering.md`.
- `src/pet/frameRate.ts`: der Regler der Bildrate (`Settings.frameLimit`, `null` heißt unbegrenzt).
  `packages/jelly-stage/src/framePacing.ts` entscheidet für Jelly, Karte und Karten-Glas, welche
  Bildschirmaktualisierung ein Bild wird.
- `src/pet/schedule.ts`: der Zeitplan der LAN, fest im Client. Seine Tage beginnen am ersten Donnerstag ab
  `starts_at` der LAN. `src/panels/SchedulePanel.tsx` und `src/schedule.css` zeigen ihn hinter dem Kalender im Dock,
  `src/useSchedule.ts` lässt das Jelly zehn Minuten vor jedem Punkt erinnern. In der Browser-Vorschau beginnt die LAN
  am letzten Donnerstag.
- `src/panels/`, `src/scene/` (Canvas, Kamera, Anker und Glas von Studio, Emotes und Schildern,
  Cosmetics), `src/ui/` (Design-System).
- `packages/jelly-scene/src/`: das Jelly als reines Three.js. `jelly.ts` baut und animiert es,
  `body.ts` (geraymarchter Körper, Shader in `shaders/`, volle und optimierte Variante per `JellyQuality`), `face.ts`, `eyeShapes.ts` (Augen und Brauen), `mouthShapes.ts`, `expression.ts` (Gesichtsausdrücke aus diesen Bausteinen), `animation.ts`,
  `emotes.ts` (Schlüssel, Dauer), `emoteAnimation.ts` (Gesten), `touch.ts` (Nasenstupser und Streicheln, nur die App gibt
  `touch` an), `partnerEmotes.ts` (Duett-Posen der
  Partner-Emotes, reine Rechnung), `jellyGeometry.ts` (Maße), `colors.ts` (Farben), `cosmetic.ts` (Cosmetics
  laden und zeichnen, Modelle in `cosmetics/`).
- `packages/jelly-stage/src/`: die Bühne als reines Three.js. `view.ts` startet sie auf einer Canvas,
  `source.ts` beschreibt ihre Daten, `labels.ts` und `picking.ts` zeichnen Namen und finden das Jelly
  unter dem Zeiger, `floorPicking.ts` den Punkt auf dem Boden, `pointer.ts` markiert das Ziel eines
  Ausflugs, `beams.ts` zeichnet das Licht beim Hervorheben, `choiceRings.ts` die Ringe beim Auswählen, `worn.ts` merkt sich, was ein Jelly trägt, `moves.ts` und `walking.ts` spielen die Wege
  des Servers ab. Die Kamera der Karte: `zoom.ts` (Zoom, Gleiten, Grenzen der Halle), `flight.ts`
  (Kamerafahrten), `cameraControls.ts` (was die Seite steuert, samt Einflug), `insets.ts` (Bänder, die die
  Seite mit Knöpfen verdeckt). Über dem Bild: `overlay.ts` (Texte, Hinweise, Treffer), `edgeHints.ts`
  (Hinweise am Rand), `hoverRing.ts` (Ring unter dem Jelly unter dem Zeiger). Ohne Aufrufe der Seite, wie
  auf dem Beamer, zeigt die Kamera die ganze Halle. Der Rest ist der Raum.
- Türme auf der Bühne: `stacking.ts` rechnet je Bild, wie jedes Jelly eines Stapels steht (rein, ohne three),
  mit `towers.ts` (Höhen, Schwanken, Welle nach einer Landung), `leaping.ts` (Sprung, Fall, Stauchen) und
  `fling.ts` (Wurf beim Zerfall). `jellies.ts` wendet die Haltung nur an. `roomMarks.ts` hält alle Marken im
  Raum zusammen, darunter `stackRings.ts` (Ring mit der Restzeit um jeden Stapel) und `lighthouse.ts`
  (kreisender Lichtkegel, solange die Spitze eines Turms hervorgehoben ist), beide rechnen in `stackMarks.ts`.
  Im Turm stehen Namen rechts und Schilder links neben dem Jelly (`labels.ts`). Mit weniger Bewegung gibt es
  nur das weiche Heben. Ansehen ohne Server: `/scripts/stack-check.html?members=4&zoom=8&play=climb,light,leave,decay`
  in der Browser-Vorschau, die Parameter stehen im Kopf von `apps/client/scripts/stack-check.mjs`.
- `map.html`, `src/map/`: die Karte im eigenen Fenster, ohne React. `main.ts` (Seite, Klicks),
  `page.ts` (Stand der Seite), `commands.ts` (Aktionen mit Bestätigung und Kameraflug), `dock.ts` (Leiste
  unten), `zoom.ts` (Mausrad, Ziehen, Tasten), `notice.ts` (Statuszeile),
  `source.ts` (Daten aus Rust), `preview.ts` (Browser-Vorschau), `partner.ts` (Partner-Emote starten),
  `actions.ts` (Fenster am fremden Jelly), `stacks.ts` (Stapel-Knöpfe und der Weg zum Stapel), `search.ts` (Jelly per Namen suchen), `glass.ts` (Glas der Knöpfe, eigene Canvas, Material aus `src/scene/glassMaterial.ts`). `src/PopoutDrops.tsx`: die Glas-Tropfen am Jelly,
  die Karte und Shop öffnen.
- `shop.html`, `src/shop/`: der Shop als Zauberladen im eigenen Fenster, mit React. `Shop.tsx` (Rahmen, Wahl, Klang),
  `ShopHeader.tsx` und `ShopPurse.tsx` (Messingschild, Lederbörse), `ShopStage.tsx` (Bühne: DOM-Ebenen `StageBackdrop`,
  `RuneCircle`, `StageCounter`, `StageAir`, `StageSigns` und `StageBubble` um `src/scene/ShopScene.tsx`), `ShopLedger.tsx`,
  `WareCard.tsx` und `useLedgerKeys.ts` (Rolle mit den Waren), `ShopSeal.tsx`, `BriefParts.tsx` und
  `useSealCeremony.ts` (Kaufbrief, Siegel zum Halten), `useShop.ts` (Stand, Ereignisse, Vorschau ohne Server), `css/`
  (eine Datei je Bereich, Größen S, M und L). Was im Shop steht, rechnet `src/pet/shop.ts`, die Rolle `shopLedger.ts`,
  die Börse `purse.ts`, das Siegel `sealCeremony.ts`, der Brief `shopLore.ts`. In der Browser-Vorschau neben `/#join`:
  `/shop.html` mit `?optimized`, `?ruhig`, `?fps=30` und `#shop-pleite`, `#shop-reich`, `#shop-alles`, `#shop-zu`,
  `#shop-leer`, `#shop-laden`, `#shop-fehler`, `#shop-langsam`, `#shop-muenzen`, `#shop-nacht`, `#shop-doesen`,
  `#shop-runen`, `#shop-anprobe`, `#shop-zauber`, `#shop-nerven` und `#shop-hutlos` (`PREVIEW_SHOP_HASHES` in `src/pet/preview.ts`). Münzen gibt es je
  Level-Aufstieg (`coins_per_level`), gekauft wird mit `POST /v1/purchases`. Der Aufstieg (`src/LevelUp.tsx`) zeigt die
  Münzen und führt zum Shop. Wie die Karte vertritt der Shop das Pet, solange er offen ist.
- Bühne und Takt des Ladens: Kamera, Plätze und benannte Punkte stehen in `src/pet/shopStage.ts`, DOM und WebGL rechnen
  beide daraus (Seitenverhältnis 2,4, `SHOP_VIEW`). `src/pet/shopTimeline.ts` ist der eine Takt: der Kauf ab C
  (`purchaseTimeline`), Anprobe, Anlegen, Ablegen. `src/shop/useSealRitual.ts` (Phasen des Siegels) und
  `useShopMoments.ts` (Wahl) spielen ihn ab, `useStageCues.ts` hält Runenkreis, Abdunkeln und Licht, was ein Moment
  auslöst, rechnet `src/pet/shopRitual.ts`. Es gibt keinen Event-Bus: zwei Objekte je Fenster (`shopSound`, `shopFx`),
  Rückrufe und `data-`-Attribute (`data-item-id`, `data-gaze`, `data-hover-sound`, `data-coin-source`, `.stage-tray`).
- `src/shop/sound/`: der Klang des Ladens mit einem AudioContext je Fenster (`shopSound.ts`, eingebunden mit
  `useShopSound.ts`): Holz, Pergament, Messing und Wachs statt der MP3s, Kaufritual, Ambiente und die Stimme des
  Zauberers über `voiceRoute`. Rein rechnen `src/pet/shopMix.ts`, `shopScore.ts` und `shopAmbience.ts`. Hörprobe:
  `scripts/shop-sound-check.html`.
- `src/shop/fx/`: alle kurzen Effekte auf einer Canvas2D über dem Fenster (`shopFx` in `sparksEngine.ts`, `ShopFx.tsx`,
  gemalt mit `fxAtlas.ts`), geplant in `src/pet/sparks.ts`. Der Takt läuft nur, solange etwas lebt. Die Vorschau spielt
  Anprobe und Kauf mit `useFxReplay.ts`.
- Licht der Szene: `packages/jelly-scene/src/sceneLight.ts`, der Block `<scene-light>` in `jelly.frag.glsl` und
  `toon.frag.glsl` (Zeichen für Zeichen gleich, nur mit dem Define `SCENE_LIGHT`) und `userData.lightable` an Körper und
  Sticker. Nur der Shop schaltet es ein (`src/scene/useSceneLight.ts`, `ShopLights.tsx`, `ShopGlows.tsx`, Werte in
  `src/pet/shopLight.ts`), Pet, Karte und Bühne des Servers bleiben ohne.
- Der Zauberer Funkelbart: `src/scene/Wizard.tsx`, `WizardParts.tsx` (Teile aus `wizard.glb`) und `WizardRig.tsx`
  (Gesten, Blick, Brauen, Schnurrbart, Kugel). Im Paket `wizard.ts` (`@jelly/scene/wizard`), `wizardGestures.ts`,
  `wizardTease.ts`, `wizardMove.ts`, `wizardFace.ts`, `crystal.ts` und `wizardTiming.ts` (`@jelly/scene/wizard-timing`,
  ohne three). Ein `wizard.glb` mit
  14 Teilen aus `apps/client/blender/build_wizard.py`, nicht in `COSMETIC_MODELS` und nicht im Katalog. Nur sein Hut ist
  auch das Cosmetic `wizard-hat` (`build_wizard_hat.py`, dieselbe Geometrie in voller Höhe, die Spitze darf in die Sprechblase ragen), das der Server je LAN einem
  Jelly für ein paar Minuten leiht. Sein Verstand
  steht rein in `src/pet/`: `wizardBrain.ts` (wann), `wizardAgenda.ts` (Vorrang, Warten), `wizardMind.ts`
  (Gedächtnis), `wizardTease.ts` und `wizardHat.ts` (Nerven, Hut beim Server), `wizard.ts` und `wizardIdle.ts`
  (Skripte), `wizardScripts.ts`
  (Typen, Takt), `wizardPick.ts`, `wizardLines.ts` (Sätze), `wizardVoice.ts`, `wizardClips.ts`, `voiceTimbre.ts`,
  `wizardFaceRig.ts`. Abgespielt in `src/shop/useWizard.ts`, `useWizardPlayer.ts`, `useWizardSenses.ts` und
  `wizardEffects.ts`. `src/pet/contracts.test.ts` hält Paket, Verstand, Bühne und Klang beieinander.
- Den Zauberer nerven: Klicks auf Hut und Bart treffen zwei Knöpfe in `src/shop/StageSigns.tsx` (`data-wizard-tease`,
  Flächen `TEASE_SPOTS` in `src/pet/shopStage.ts`). `src/pet/wizardTease.ts` zählt: drei Abwehren, dann ist der Hut
  weg, danach drei Züge am Bart sind „genug genervt“ (`fedUp`). Der Stand lebt im Fenster, nur der geklaute Hut geht
  an den Server (`POST /v1/wizard-hat`, Befehl `steal_wizard_hat`, `useStealHat` in `src/shop/useShop.ts`): Dann trägt
  ihn das Jelly `wizard_hat_seconds` lang, und `me.wizard_hat` bestimmt die Rückkehr (`src/pet/wizardHat.ts`,
  `syncServerHat`). Trägt ihn ein anderes Jelly, steht der Zauberer ohne Hut da, das Schild `src/shop/HatSign.tsx` zählt
  herunter. `wizard_hat.changed` geht an alle Fenster, schließt aber nichts. Ohne LAN oder Netz bleibt alles im Fenster.
  Der Hut ist ein Stand der Haltung (`WizardPose.hat`), keine Geste. Hut und Server ändert nur das Gehirn
  (`wizardBrain.ts`, Ereignisse `hatServer` und `hatTaken`). Zeiten in `TEASE` (`src/pet/shopTimeline.ts`) und
  `TEASE_TIMING` im Paket. In der Browser-Vorschau klaut `/shop.html#shop-nerven` den Hut wie mit Server und gibt ihn
  schneller zurück, mit `#shop-hutlos` trägt ihn gerade Mo.
- Updates der App: `src-tauri/src/commands/update.rs` (`tauri-plugin-updater`, Liste `latest.json` am Release auf
  GitHub, Fortschritt per `Channel`), `src/useUpdate.ts`, `src/UpdateNotice.tsx`, `src/UpdateBanner.tsx` (Rakete als
  SVG in der Jelly-Farbe) und `src/update.css` (Karte über dem Dock, für die Bühne Panel `update`, in der
  Browser-Vorschau `/#update`). Der Changelog steht in `apps/client/CHANGELOG.md`, geht als `notes` in `latest.json`
  und wird in `src/pet/changelog.ts` gelesen.
  `scripts/updater-manifest.mjs` (schreibt `latest.json` im Release-Lauf). Ablauf und Schlüssel: README des Clients.
  `arch/PKGBUILD` baut im selben Lauf das Paket für Arch Linux (`.pkg.tar.zst`), es steht nicht in `latest.json` und
  aktualisiert sich nicht selbst.
- `apps/site`: die Website unter `raffaelschaefer.github.io/jelly/` (Deutsch, umschaltbar auf Englisch), ohne React.
  `pnpm build` holt das neueste Release nach `src/generated/release.json` (mit `GH_TOKEN`, ohne Netz ein Verweis
  auf die Release-Seite) und baut die Seite nach `dist/`. Oben läuft das Jelly aus `@jelly/scene` (`src/hero/`), die
  gewählte Farbe färbt den Akzent der Seite. Im Fuß schaut dasselbe Jelly als großer, angeschnittener Kopf zum
  Zeiger herauf (`FOOTER_VIEW` in `src/hero/views.ts`), eine zweite Szene, die erst kurz vor dem Fuß startet. Die drei Bilder aus der App (`src/assets/shot-*.webp`) stammen aus der
  Browser-Vorschau des Clients, ihre Marken stehen als `--x` und `--y` in `index.html`: Nach einer neuen Aufnahme
  die Marken nachziehen. „Loslegen“ zeigt Download und ersten Start für das gewählte System (`src/tabs.ts`,
  `src/downloads/`). Die Seite nennt keine bestimmte LAN. Veröffentlicht wird per `.github/workflows/pages.yml` bei
  Änderungen auf `main` und nach jedem Release, Pull Requests prüfen und bauen sie dort nur. Einmalig im Repository:
  Settings › Pages › Source auf „GitHub Actions“ stellen, sonst scheitert der erste Deploy.
- `src-tauri/src/`: `lib.rs` (Zusammenbau), `commands.rs`, `commands/session.rs` (Sitzung und Spielstand),
  `commands/partner.rs`, `commands/stage.rs`, `commands/update.rs`, `api.rs` (HTTP), `api/types.rs`, `api/stage.rs` (Server-Typen),
  `events.rs` (Server-Stream), `popout.rs` (Fenster von Karte und Shop), `error.rs`, `pet.rs` (lokaler Stand,
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
  zeigt das nicht, denn dort gilt keine CSP. Einen Ladefehler sieht man nur im gebauten Binary. Ein Material kann sein
  Leuchten von unten mit der Blender-Eigenschaft `glow` (0 bis 1) dämpfen, sonst wirken dunkle Farben unten grau. Mit
  `fluff` (0 bis 1) wird es zu Plüsch: ohne Glanz, mit Fellkörnung und hellem Rand (`plush` in `toon.frag.glsl`).
  Mit `neon` (0 bis 1) leuchtet es selbst: ohne Schatten und Glanz, satt auch im Dunkel des Shops, am Tonemapping
  vorbei (`toon.frag.glsl`). Mit `glass` (0 bis 1) wird es durchsichtig, zum Rand hin deckt es mehr. Ein Cosmetic mit Glas zeichnet zuletzt in
  seiner Malschicht, erst die Füllung, dann die Outline (`glassOrder` in `cosmetic.ts`), sonst schiene ihre Tinte
  durch. Teile davor brauchen dann eine Fläche ohne Rückseite und Kante, sonst bekommen sie eine Innenlinie.
  Was hinter dem Jelly liegen soll, bekommt `behind` in `COSMETIC_LOOKS`: Es löscht die Tiefe nicht, Körper, Kopf und
  Hände verdecken es. So wachsen die Katzenohren hinter dem Kopf hervor, der Katzenschwanz steht nicht vor den Händen, und die
  BFG zeigt nach vorn: Die linke Hand liegt vor ihrem Griff, ihr hinteres Ende verschwindet im Jelly. Solange das Jelly so etwas
  hält, zeichnet `WornCosmetics` (`Character.tsx`) auch den Körper-Schmuck (Flügel, Rucksack, Schal) mit echter Tiefe dahinter. Was an den Händen sitzt wie die Pfoten,
  steht in `ON_HANDS` (`packages/jelly-scene/src/held.ts`) mit seinen Händen: ein Modell um den Ursprung, an jeder dieser Hände gezeichnet (`HandWorn` in der App, `held.ts` auf der Bühne). Schild und Ritternagel sitzen nur an der linken, die rechte bleibt frei für Winken, Zeigen und Grübeln.
  Wie die Hände etwas zwischen sich halten, steht in `HOLDS` (ebenda): wo sie in Ruhe liegen und wie weit das Gehaltene
  ihnen folgt (`boardPose`), ohne Eintrag wie eine Tafel (`BOARD_HOLD`). Die rechte Hand packt die BFG an der Unterkante ihrer Seite,
  und die BFG bleibt bei Gesten und Stupsern fast stehen, unter dem Gesicht. Liegt eine Hand weiter vorn als z 0,84, zeichnet
  der Körper einen tieferen Kasten (`BOUNDS` in `body.ts`), sonst fiele sie aus dem Raymarching. Vor dem Körper bekommt
  eine Hand ihre eigene Outline (`HAND_GAP` in `jelly.frag.glsl`). Was pulsieren soll wie der Oktopus,
  bekommt `pulse` in `COSMETIC_LOOKS` (Punkt, Stärke, Takt, Schaukeln, Neigung), was mit Armen wedeln soll, `wave` (Punkt, Abstand, Länge, Ausschlag, Takt):
  `pulseCosmetics` (`cosmeticPulse.ts`) staucht, streckt und schaukelt es je Bild wie Wackelpudding und gibt dem Wedeln den Takt, in der App aus `Character.tsx`,
  auf der Bühne aus `jellies.ts`, bei reduzierter Bewegung nicht. Das Wedeln rechnet `waved` in `toon.vert.glsl` und `outline.vert.glsl`,
  in beiden Zeichen für Zeichen gleich. Ein neues Modell groß ansehen:
  `/scripts/cosmetic-check.html?wear=<Schlüssel>&color=<Farbe>&tint=<Hex>` in der Browser-Vorschau.
- **Einfärbbares Cosmetic:** Materialien mit der Blender-Eigenschaft `tint` nehmen die Farbe des Trägers (1 genau,
  darunter dunkler, darüber zu Weiß hin, negativ dasselbe mit ihrer Gegenfarbe wie die Iris des Oktopus), der Rest bleibt. Dazu `Colorable` im Server (`rules/cosmetics.go`, neue
  API-Version), `COLORABLE` in `packages/jelly-scene/src/cosmetic.test.ts` und `colorable` in
  `src/pet/previewCatalog.ts`. Gewählt wird im Studio: Ein Klick auf das angelegte Teil öffnet das Farbrad
  (`src/studio/PaintWheel.tsx`).
- **Zauberladen ändern:** Vor einem Jelly steht nur DOM oder die Canvas2D der Effekte, denn Sticker übermalen alles
  in 3D davor. DOM und Szene passen nur bei Seitenverhältnis 2,4 und derselben Kamera (`src/pet/shopStage.ts`)
  zusammen. Zeiten kommen aus `src/pet/shopTimeline.ts`, nicht aus eigenen Konstanten. Jede Schleife (CSS, Licht,
  Funken) braucht eine ruhige und eine optimierte Fassung. Ansehen bei 520×460, 720×600, 1200×900 und 1920×1080,
  jeweils auch mit `?optimized` und `?ruhig`, ohne Scrollen.
- **Schriften** liegen als Datei bei (`src/fonts/`, mit Lizenz) und nie als `data:`: Die CSP lädt Schriften nur von
  `'self'`, `vite.config.ts` legt `.woff2` deshalb nie inline.
- **Neuer Knopf mit Glas auf der Karte:** Das Glas zählt jedes `data-liquid`-Element der Reihe nach, bis
  `LAYOUT.maxShapes` in `src/map/glass.ts`. Was darüber liegt, bleibt ohne Glas.
- **Bühne ändern** heißt `packages/jelly-stage` ändern und Server-Seite und Karte der App ansehen.
  Das Paket spricht nicht mit dem Netz: Jeder Nutzer bringt seine `StageSource` mit, die App holt
  alles über Rust. Was nur die Karte braucht (Markierungen, Treffer), bleibt auf dem Beamer aus.
- **Neue Tropfen brauchen auch eine Fläche:** Im optimierten Modus läuft `LiquidGlass` nicht. Jedes neue sichtbare
  `data-liquid`-Element bekommt in `src/optimized.css` einen eigenen Hintergrund, reine Vorlagen werden dort
  ausgeblendet. Jede Schwebe-Animation wird dort abgeschaltet. Die Karte lässt ihr Glas (`src/map/glass.ts`) im
  optimierten Modus ebenfalls weg, ihre `.glass-pill`-Knöpfe bleiben dann einfarbig (`src/map/map.css`).
- **Takt des Jellys:** `src/scene/AnimationClock.tsx` zeichnet mit `advance`, für Pet und Shop. Ein `invalidate` aus einem
  `requestAnimationFrame` käme erst im nächsten Bild an und halbierte die Bildrate am Bildschirmtakt.
- **Identifier** `de.ucb.jelly` nicht ändern, sonst findet die App vorhandene Spielstände nicht mehr.
- **Kein TypeDoc**, solange es TypeScript 7 nicht unterstützt (Begründung in der README).
- **App-Icon** kommt aus `apps/client/public/pet.svg`. Neu erzeugen mit
  `pnpm tauri icon public/pet.svg -o <tmp>` und nur `icon.png`, `icon.ico` und `icon.icns` nach
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
`client`, `site` (die Website `apps/site`), `scene` (das Paket `packages/jelly-scene`), `stage` (das Paket
`packages/jelly-stage`). Inkompatible Änderungen tragen ein `!` nach Typ oder Bereich.

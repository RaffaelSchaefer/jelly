# Jelly-News Implementation Plan

**Goal:** Bühne, Karte und Pet zeigen die Jelly-News des Servers (API 1.39.0) als kurze Nachrichtensendung im
Stil der Mii-News: ernster Ton, belangloser Inhalt, mit Studio, Bauchbinde, Einspielern und eigener Kamera.

**Issues:** #129 (Bühne und App), #118 (Konzept, samt der Kommentare vom 24.11.). Server: #126, fertig.

**Architecture:** Der Server liefert nur Fakten (`gathering` mit `kind: "news"`, `presenter_id`, `news`). Alles
andere rechnet `packages/jelly-stage` rein aus Gathering und Serverzeit: welcher Beitrag läuft, was die Bauchbinde
sagt, wen das Licht trifft und wo die Kamera steht. So zeigen alle Bildschirme dasselbe, auch wer mitten in der
Sendung lädt. Texte stehen im Paket, der Server bleibt sprachlos.

**Tech Stack:** Three.js 0.186, Canvas2D-Overlay, `node --test` im Paket, Rust und Vitest im Client.

## Constraints

- Kein Server-Code in diesem Plan. Was der Server bräuchte, steht unter „Vorschläge an den Server“.
- Die Zahl der Beiträge hängt nur am Gathering, nie am laufenden Stand: Sonst zählen zwei Bildschirme verschieden.
- Rechnende Module (`news.ts`, `newsLines.ts`, `newsCamera.ts`, `newsShots.ts`) importieren weder three noch
  Shader, damit `node --test` sie prüft.
- `view.ts` und `stageSet.ts` liegen an der Schwelle von 350 Zeilen. Neues kommt in neue Dateien, `view.ts` wird
  vorher geteilt.
- Die Karte gehört dem Nutzer: Die News-Kamera übernimmt dort nie von selbst.
- Die Kamera bleibt vor der Halle (Blick Richtung Bühne): Leinwände und Leuchtturm rechnen damit.
- Jede Bewegung hat eine Fassung für „Weniger Bewegung“: Schnitte ja, Fahrten, Wackeln und Laufschrift nein.

## Entscheidungen

| Frage                 | Stand                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Beginn der Sendung    | `starts_at` wird dem Server vorgeschlagen. Bis dahin gilt `ends_at` minus 90 Sekunden.        |
| Kamera auf dem Beamer | Fährt von selbst (`broadcast`-Option der Bühnen-Seite). Auf der Karte nur per Knopf.          |
| Stockfotos            | Erst gezeichnete Karten. Fotos kommen als Dateien dazu, sobald jemand sie mit Lizenz liefert. |
| Interview und Zufall  | Aus `ends_at` und `presenter_id` gerechnet, kein Feld im Vertrag.                             |
| Eigene News-Kamera    | Ja, mit freier Höhe und Neigung (Entscheid vom 25.11.).                                       |

## Die Sendung

Reihenfolge: Vorspann, `top_xp`, Achievements (neueste zuerst), höchster Turm, ein Platz „Vermischtes“,
`next_item`, Abmoderation.

- **Takt:** Länge eines Beitrags ist das Fenster geteilt durch die Zahl der Beiträge, zwischen 6 und 10 Sekunden.
  Reicht die Zeit nicht, fällt erst „Vermischtes“ weg, dann die ältesten Achievements. Bleibt Zeit, läuft die
  Sendung noch einmal.
- **Vermischtes** ist genau ein Platz. Die Vorlage wählt der Zufall: LAN-Wetter, absurde Kurzmeldung,
  Mitspieler-Börse (Schilder), Klatsch (`follow`), Hutdieb (`equipped`) oder Straßeninterview.
- **Interview-Jelly:** das unbeteiligte Jelly mit dem kleinsten Hash aus Zufall und ID. Es bleibt dasselbe, wenn
  andere gehen.
- **Lücken:** fehlendes Jelly, unbekanntes Achievement, `presenter_id: null` und unbekannte Art eines
  Programmpunkts geben eine neutrale Zeile, nie einen Fehler.

## Schussliste

| Beitrag      | Einstellung                                                    | Fahrt                    |
| ------------ | -------------------------------------------------------------- | ------------------------ |
| Vorspann     | Totale der Halle                                               | Kran hinunter zum Studio |
| Anmoderation | Halbnah, Vorleser am Tisch, Leinwand über der Schulter         | langsam heran            |
| `top_xp`     | Nahaufnahme im Publikum, schräg von vorn                       | heran                    |
| Achievements | Nahaufnahme je Jelly, Seite wechselt                           | schnelle Schnitte        |
| Turm         | Gruppe der Genannten, steht der Turm noch: von unten nach oben | Seitfahrt oder Kran      |
| Vermischtes  | Wetter: Halle von oben. Interview: nah mit leichtem Wackeln    | Drift                    |
| Programm     | zurück zum Vorleser, Leinwand zeigt Uhrzeit und Titel          | steht                    |
| Abmoderation | Vorleser, dann zurück in die Totale                            | Kran hinauf              |

Die Pose (Ort, Blickpunkt, Brennweite, Linsenstärke) ist eine reine Funktion aus Beitrag, Fortschritt und den
Orten der Jellies. Zwischen Beiträgen wird geschnitten. Der letzte Schuss endet in der Totalen der normalen
Kamera, die dann wieder übernimmt.

## Aufgaben

0. **Versuch Augenhöhe.** Kamera auf Augenhöhe im Demo-Raum, Aufnahmen von Totale, Halbnah und Nah. Klärt, ob
   Körper, Lichtkegel, Schatten, Ringe und Namen aus dieser Sicht halten. Ergebnis steht unten.
1. **Vertrag.** `presenter_id`, `news`, `starts_at` in `packages/jelly-stage/src/types.ts`. Rust-Spiegel in
   `src-tauri/src/api/stage.rs` mit `#[serde(default)]` und Test in `api/tests.rs`. `findWinner` (`moves.ts`)
   nennt bei `news` den Vorleser.
2. **Ablauf.** `news.ts` (Beiträge, Takt, Zufall) und `newsLines.ts` (Zeilen je Rubrik und Achievement) mit
   Tests: volle Sendung, leere Teile, zu kurzes Fenster, später Einstieg, Wiederholung.
3. **TV-Look.** `newsBar.ts` im Overlay: Vorspann, Senderlogo, Rubrik, Schlagzeile, Unterzeile (`IM STUDIO` oder
   `LIVE AUS DER HALLE`), Uhr, Laufschrift, Karte über der Schulter mit Zeichen und großer Zahl. Blau, bei
   `orga`, `tournament` und Eilmeldung rot. Zu lange Texte: erst kleiner, dann zwei Zeilen, dann Auslassung.
   Achtet auf `insets`.
4. **Inszenierung.** `newsDirector.ts` fügt je Beitrag einmal Effekte an, mit Schlüssel aus `ends_at` und Nummer
   des Beitrags: `spotlight` auf die Genannten, Gesten des Vorlesers, Hüpfer der Genannten. Davor `view.ts`
   teilen.
5. **News-Kamera.** `newsCamera.ts` (Pose rechnen und mischen), `newsShots.ts` (Schussliste), Anschluss in
   `cameraControls.ts`. Dazu: Publikum schaut zur Bühne, nur Vorleser und Genannte in die Linse. Namen hinter der
   Kamera fallen weg, nahe Namen haben eine Höchstgröße. Freie Sicht: über
   Kopfhöhe, aus drei Richtungen die mit der meisten Luft. Knopf „Sendung ansehen“ auf der Karte.
6. **Studio.** Wand hinter der Bühne, Nachrichtentisch (zeichnet nach dem Vorleser), beide Leinwände zeigen die
   Karte per Canvas-Textur (`newsScreens.ts`, `screen.frag.glsl`).
7. **Pet, Eilmeldung, Abschluss.** `gathering.changed` der Art `news` geht ans Pet (`events.rs`).
   `src/pet/news.ts` und `src/useNews.ts` nach dem Muster von `useStack`: „Ich moderiere die Jelly-News!“, „Ich
   bin in den News!“, sonst ein Hinweis auf die Karte. Klang `NEWS_JINGLE` (`voiceClips.ts`). `award.given`
   zeigt 8 Sekunden eine rote Bauchbinde, auch außerhalb der News. `AGENTS.md`, `CHANGELOG.md`.

Jede Aufgabe endet mit den Prüfungen des Pakets (`pnpm test`, `pnpm lint`, `pnpm run check-types`), dazu Client
und Server, denn beide nutzen es.

## Vorschläge an den Server

Nicht Teil der Aufgaben, mit Tomek zu klären:

- `starts_at` im `Gathering`: steht schon in der Tabelle `gatherings`, fehlt nur in der Antwort.
- `--loader:.webp=dataurl` in `internal/web/web.go`, sobald Fotos im Paket liegen.
- Rubriken, die Verlauf brauchen: `snack_index` (Meldungen Essen und Trinken), `shop_trend`
  (`cosmetic.purchased`), `recent_award`, Eilmeldung zum Start eines Turniers.

## Was aus den Issues wo landet

| Punkt                                                | Wo                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Vorleser wächst, Weg-Art `news`                      | Aufgabe 1. Die Art braucht nur einen Kommentar, die Bühne kennt nur `snack` besonders.                                     |
| Licht, großer Name, Symbol je Teil                   | Aufgaben 3 und 4                                                                                                           |
| Typen in Rust und TypeScript                         | Aufgabe 1                                                                                                                  |
| Karte zeigt die News wie die Bühne                   | Aufgaben 1 bis 6, dasselbe Paket                                                                                           |
| „Ich bin in den News!“                               | Aufgabe 7                                                                                                                  |
| `schedule.ts` verträgt `news`                        | Kein Code: Der Zeitplan steht fest im Client. Der Zweig `client/lan-schedule` muss `news` in `CUES` kennen, wenn er kommt. |
| Vorspann, Sprecher, Bauchbinde, Ticker, Abmoderation | Aufgabe 3                                                                                                                  |
| Monitor über der Schulter                            | Aufgabe 3 (Karte), Aufgabe 6 (Leinwände im Raum)                                                                           |
| Vor-Ort-Schalte, O-Ton                               | „Vermischtes“ und Kamera, Aufgabe 5                                                                                        |
| Lückentext-Meldungen, LAN-Wetter                     | Aufgabe 2                                                                                                                  |
| Rubriken aus Schildern, Folgen, Hut                  | „Vermischtes“, aus dem Stand                                                                                               |
| Rote Eilmeldung                                      | Aufgabe 7 für Preise. Turnierstart braucht den Server.                                                                     |
| Kantine, Shop-Trend                                  | Vorschlag an den Server                                                                                                    |
| Zufall für gleiche Bildschirme                       | Aus `ends_at` gerechnet, kein Feld                                                                                         |
| Stockfotos                                           | Platz ist vorgesehen, gezeichnete Karten zuerst                                                                            |
| Jingle, Stimme                                       | Jingle im Pet (Aufgabe 7). Der Beamer bleibt stumm.                                                                        |
| Archiv „Alte Nachrichten“                            | Gestrichen: braucht Speicher                                                                                               |

## Prüfung

- Prüfseite `apps/client/scripts/news-check.html` nach dem Muster von `stack-check`: fünf Achievements, hoher
  Turm, Titel mit 80 Zeichen, fehlendes Jelly, kein Vorleser, später Einstieg, weniger Bewegung, ein Schuss
  eingefroren.
- Browser-Vorschau `/map.html#news`, auch mit `?optimized`.
- Beamer: `pnpm demo` in `apps/server`, Start im Admin unter „Essens-Event und Siegerehrung“.
- Ausrollen: Der Beamer braucht einen Server-Build, Karte und Pet ein Release der App.

## Review focus

Zwei Bildschirme dürfen nie verschiedene Beiträge zeigen. Effekte dürfen nach einem Neuladen nicht doppelt
starten. Die Karte darf die Kamera nie ungefragt verlieren. Kein Text läuft aus der Bauchbinde. Ein Gathering
anderer Art (`food`, `ceremony`) bleibt, wie es war. Shader-Fehler zeigt nur der Browser.

## Ergebnis des Versuchs (Aufgabe 0)

Am 25.11. in der Browser-Vorschau der Karte mit einer fest gesetzten Kamera geprüft (Totale, Studio, Halbnah,
Publikum auf Augenhöhe und von schräg oben):

- **Hält:** Körper, Gesichter, Cosmetics, Türme, Tische, Bühne und Leinwände sehen aus jeder geprüften Höhe
  sauber aus. Die Jellies drehen sich von selbst zur Kamera.
- **Hintergrund:** Der Boden läuft hell aus, über der Bühne steht kein Loch. Die Studiowand ist Kür, kein Muss.
- **Namen:** Jellies hinter der Kamera werfen ihre Namen an falsche Stellen im Bild, nahe Namen werden riesig.
  Beides muss Aufgabe 5 beheben (aussortieren, Höchstgröße).
- **Linse:** Das Fischauge stört in der Nahaufnahme nicht. Die Stärke bleibt, wie sie ist, die Aufgabe entfällt.
- **Nicht geprüft:** Lichtkegel und Ringe aus der Nähe, ein Jelly auf der Bühne. Die Vorschau hat dort keines,
  das zeigt erst die Prüfseite aus Aufgabe 4.

## Stand nach der Umsetzung (25.11.)

Was vom Plan oben abweicht:

- **Kamera-Option:** statt `broadcast` heißt sie `newsCamera` (`"auto"` filmt von selbst, `"manual"` nur nach
  `watchNews(true)`).
- **Karten und Leinwände:** zeigen eigene Emojis mit durchsichtigem Grund (`art/news`, per Bildgenerierung erzeugt)
  statt gezeichneter Zeichen. Bildwände hinter dem Jelly (Studiowand, Wetterkarte, Straße) wurden gebaut und wieder
  entfernt, sie sahen in der Szene schlecht aus.
- **Vorspann:** in 3D mit Globus und Logo (`newsTitle*.ts`, `newsTitle.glb`), die Bänder des 2D-Vorspanns sind das
  Wischen.
- **Jingle:** eine gelieferte Datei (`src/sounds/news/intro.mp3`) als Geräusch der Oberfläche, kein gesungener Clip.
- **Leinwände im Leerlauf:** Testbild statt Equalizer.
- **Vorleser:** ohne Hand-Items während der Sendung. Solange er zur Bühne läuft, ersetzt eine Totale den
  Studio-Schuss.
- **Beginn der Sendung:** Die Bühne merkt ihn sich aus `gathering.changed`. Wer später lädt, rechnet weiter mit
  90 Sekunden, bis der Server `starts_at` schickt.
- **Nicht umgesetzt:** Studiowand (Aufgabe 6) und Stockfotos.

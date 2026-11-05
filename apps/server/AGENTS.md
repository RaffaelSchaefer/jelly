# AGENTS.md: Server

Diese Regeln gelten für allen Code in `apps/server` und ergänzen das
[AGENTS.md im Root](../../AGENTS.md). Aufbau und Betrieb stehen in der [README](README.md), die
Schnittstelle in [docs/api.md](docs/api.md).

## Befehle

```sh
pnpm lint      # golangci-lint und oxlint, müssen ohne Befund durchlaufen
pnpm format    # golangci-lint fmt und run --fix, dazu oxfmt; vor Handarbeit an Lint-Befunden
pnpm test      # go test ./..., die Tests der Bühne laufen im Paket packages/jelly-stage
pnpm check-types  # tsc für web/
pnpm bench     # Benchmarks der Datenbankzugriffe
pnpm bench:load  # Lasttest mit dem Simulator, siehe benchmarks/README.md
pnpm openapi   # docs/openapi.json aus dem Code erzeugen, nach jeder Änderung an /v1
pnpm build     # Seiten bauen (go generate ./internal/web), dann go build
pnpm demo      # Wegwerf-Server mit 70 simulierten Jellies, um die Bühne anzusehen
go test -race -count=1 ./...   # vor jedem PR
```

`pnpm lint` und `pnpm format` starten `golangci-lint` in der festen Version v2.15.0 über `go run`.
Eine globale Installation ist nicht nötig; beim ersten Aufruf lädt Go das Werkzeug in seinen Cache.

Die Regeln stehen in [.golangci.yml](.golangci.yml). Regeln dort nicht abschwächen, um einen Befund
loszuwerden. `//nolint` braucht den konkreten Linter und eine Begründung.

## Grundsatz

Einfaches, idiomatisches Go nach KISS. Kein cleverer Code. Optimierungen nur, wenn sie weder
Lesbarkeit noch Komplexität verschlechtern.

## Sprache

Bezeichner, Kommentare, Log- und Fehlertexte im Server sind auf Englisch. Das gilt abweichend vom
AGENTS.md im Root. Deutsch bleiben nur die Meldungen, die die App anzeigt (`message` in der API).

## Namen

- Code soll sich fast wie englischer Text lesen.
- Bezeichner sind mindestens 3 Zeichen lang, auch Empfänger und Schleifenvariablen:
  `transaction`, `writer`, `request`, `index`. Ausnahmen sind `ok` beim Prüfen von Typ und Map sowie
  `t *testing.T`.
- Namen beschreiben schlicht, was etwas ist. Bei möglicher Verwechslung gehört das Modul oder der
  Zweck in den Namen: `playerID` statt `id`, `gameRules` statt `rules`.
- Funktionen heißen Verb plus Substantiv: `CalculateLevel`, `loadActiveLAN`, `writeProblem`.
  Handler heißen `handle…`. Ausnahmen sind Konstruktoren wie `Open` und Standardmethoden wie `Close`.

## Module

- Es gibt genau einen Einstiegspunkt: `cmd/jelly-server`. Weitere Werkzeuge sind Unterbefehle.
- `internal/rules` enthält reine Funktionen ohne IO und ohne Uhr. Zeiten kommen als Argument herein.
- `internal/movement` plant die Wege der Jellies, ebenfalls ohne IO und ohne Uhr. Den Stand bekommt es
  vom Aufrufer. `internal/api` stößt es an, sobald jemand die Bühne liest, und sonst über
  `RunMovement`, die einzige langlebige Goroutine neben dem HTTP-Server.
- `internal/store` kennt SQLite, aber kein HTTP. `internal/api` kennt HTTP, aber kein SQL.
- Nur `cmd/jelly-server` liest die Umgebung, wählt die echte Uhr und darf den Prozess beenden.
- `internal/simulator` spielt nur über die öffentliche API und kennt weder `store` noch `rules`.
- `internal/web` liefert nur Dateien aus. Daten holen die Seiten über die öffentliche API.
- Logik gehört wenn möglich in reine, einzeln testbare Funktionen.
- Dateien gruppieren zusammengehörigen Code und bleiben unter etwa 500 Zeilen. Große Module werden
  auf mehrere Dateien aufgeteilt.
- Module folgen den gängigen Go-Konventionen: kleine Interfaces beim Nutzer, Interfaces annehmen und
  konkrete Typen zurückgeben, `ctx` als erster Parameter.

## Kein globaler Zustand

- Abhängigkeiten werden als Instanz übergeben, nicht global gelesen. Der Logger entsteht einmal in
  `cmd/jelly-server` und wird weitergereicht. `slog.Info` und `slog.SetDefault` sind tabu.
- Keine globalen Variablen außer unveränderlichen Fehlerwerten und `//go:embed`, kein `init()`.

## Defensiver Code

- Kein `panic`. Fehler werden zurückgegeben, geprüft und mit Kontext umschlossen (`%w`).
- Typumwandlungen immer mit `ok`, Fehlervergleiche mit `errors.Is` und `errors.As`.
- Eingaben von außen sind ungültig, bis sie geprüft wurden. Unbekannte JSON-Felder sind ein Fehler.
- Clients senden nur Absichten. XP, Zeiten und Freischaltungen bestimmt der Server.
- Zustand und Verlauf werden in derselben Transaktion geschrieben.
- IP-Adressen und Tokens werden nicht geloggt, Tokens nur als Hash gespeichert.

## Nebenläufigkeit

Standard ist linearer Code.

- Goroutinen nur, wenn es nicht anders geht. Sie sind kurzlebig und klar begrenzt, langlebige bleiben
  die Ausnahme.
- Vor jeder Goroutine oder jedem Channel klären: Wer startet sie, wodurch endet sie, wer wartet auf
  sie, was passiert bei Fehlern, Abbruch und Neustart? Das Ergebnis steht direkt darüber in einem
  Kommentar, der `Concurrency plan:` enthält. Das prüft `internal/architecture`, Tests sind ausgenommen.
- Channels nur, wenn es mehrere Schreiber gibt. Sonst reichen Rückgabewerte oder `sync.WaitGroup`.
- `go test -race` muss vor jedem PR durchlaufen.

## Kontexte

- `cmd/jelly-server` erzeugt genau einen App-Kontext, der bei SIGINT und SIGTERM endet. Alle anderen
  Kontexte leiten sich davon ab.
- Anfragen laufen auf einem eigenen Zweig, damit sie beim Herunterfahren noch fertig werden.
- Datenbankzugriffe bekommen einen eigenen Kontext mit Zeitlimit (`queryTimeout`,
  `transactionTimeout`). Migrationen begrenzt nur der App-Kontext.
- `context.Background()` gibt es nur im Einstieg und `ctx` wird nie in Structs gespeichert.

## Kommentare

Kommentare helfen beim Orientieren oder machen schwer Lesbares klar.

- Höchstens 1 bis 2 Zeilen. Sie verteidigen oder begründen keine Entscheidungen.
- Länger nur, wenn der Code mehr Kontext braucht, etwa bei einem schwierigen Randfall. Dann nennt der
  Kommentar das Problem, ein Beispiel und die Lösung.

## Wiederverwenden

Modul-Code nutzt vorhandene Logik oder abstrahiert sie gut, statt sie zu kopieren. Handler bleiben
dünn und rufen dieselben Funktionen aus `internal/store` und `internal/rules`, egal ob ein Spieler,
ein Bot oder ein Admin die Aktion auslöst.

## Keine magischen Werte

Zahlen und Texte mit Bedeutung bekommen einen Namen: `registerRetryLimit` statt `5 * time.Second`,
`pathActions` statt `"/actions"`. Der Name sagt, wofür der Wert steht, nicht wie groß er ist. Gleiche
Werte stehen an einer Stelle, und feste Listen stehen in einer benannten Funktion. Das gilt auch für
SQL und TypeScript. Tests dürfen Erwartungswerte direkt nennen, weil sie dort besser lesbar sind.

## SQL

- Jede Query hat einen Namen, der auf `SQL` endet: `const selectBadgesSQL = ...`.
- Sie steht als lokale Konstante direkt über dem Aufruf. So liest man Abfrage und Verwendung zusammen.
- Wird sie an mehreren Stellen gebraucht, wandert sie nur so weit nach oben, dass alle sie erreichen.
  Eine private Paket-Konstante ist nur erlaubt, wenn mehrere Funktionen dieselbe Query nutzen.

## Seiten in `web/`

- Einfaches TypeScript ohne Framework. Die Bühne selbst kommt aus `@jelly/stage`, in `web/stage` stehen
  nur die Seite und der Weg zum Server (`connection.ts`). Kommentare, Namen und `@module`-Kopf wie im
  Go-Code auf Englisch, sichtbare Texte auf Deutsch.
- Für `packages/jelly-stage` gelten dieselben Regeln. Reine Logik (`world.ts`, `walking.ts`, `moves.ts`,
  `zones.ts`, `lens.ts`, `effects.ts`, `picking.ts`, `random.ts`) kennt
  weder DOM noch Canvas noch three.js und hat Tests daneben (`*.test.ts`). Alles mit DOM, Canvas oder
  three.js bleibt so dünn wie möglich.
- Shader stehen in `packages/jelly-stage/src/shaders/*.glsl` und werden per `?raw` importiert (esbuild
  lädt `.glsl` als Text). Werte kommen über `defines` hinein.
- Gebündelt wird aus `node_modules`, also vor `go generate` einmal `pnpm install` im Root. `three`
  hat dieselbe Version wie im Client.
- Die Seiten spiegeln keine Regeln. Was dauerhaft gilt, kommt per `GET /v1/stage`, Ereignisse lösen nur
  ein Neuladen oder eine kurze Animation aus.
- Neue Einstiegsdateien müssen in die `go:generate`-Zeile von `internal/web/web.go`, neue Seiten
  zusätzlich in `listPagePatterns`.
- Änderungen im Browser ansehen, mit `pnpm demo`. Tests finden keine Zeichenfehler. Änderungen am
  Paket zusätzlich in der Karte der App ansehen, sie läuft im WebView des Betriebssystems.

## Messungen und Skripte

Skripte, die man wiederholen will, liegen im Repo statt nur im Terminal, Hilfen in `scripts/`,
Lasttests in `benchmarks/`, die Baselines in [benchmarks/README.md](benchmarks/README.md). Nach einer Änderung,
die Leistung beeinflussen kann, Messung wiederholen und neue Werte mit Commit dort eintragen.

## Feature-Branches und API-Versionen

- Jedes Feature entsteht in einem eigenen Branch `feature/<name>` und geht per Pull Request nach `main`.
- `docs/openapi.json` wird mit `pnpm openapi` aus dem fertigen Code erzeugt und mitgemergt. Sie wird nie
  von Hand geändert, ein Test vergleicht sie mit dem Code.
- Clients bauen auf `docs/openapi.json`, also braucht jeder Weg, Parameter und jedes Feld eine Beschreibung.
  Die Texte stehen in `internal/api/contract_docs.json`, Go-Kommentare landen nicht im Dokument. Fehlt ein
  Text oder beschreibt einer etwas, das es nicht mehr gibt, scheitern `pnpm openapi` und die Tests.
- `internal/api` beschreibt die Wege für App und Bühne mit huma unter `/v1`. Handler geben einfache
  Fehler zurück, `addOperation` übersetzt sie über `listKnownErrors`. `/health` und `/admin/api` nutzen
  weiter `net/http` und stehen nicht im Vertrag. `GET /version` steht im Vertrag, aber außerhalb von
  `/v1` (`addRootOperation`), damit auch alte Apps ihn nach einem Wechsel des Pfads noch finden.
- Jedes Feature erhöht `APIVersion` und bekommt eine Zeile im Changelog von `docs/api.md`. Erweiterungen
  bleiben in `/v1`. Was den Vertrag bricht, bekommt einen neuen Pfad und eine Begründung in `docs/api.md`.

## Weitere Regeln

- Schemaänderungen sind neue, nummerierte [goose](https://github.com/pressly/goose)-Dateien in
  `internal/store/migrations/` mit `-- +goose Up` und `-- +goose Down`. Bestehende bleiben unverändert.
  Der Server führt sie beim Start aus, ein Test prüft auch das Zurückrollen.
- Neue Spielwerte gehören in `rules.Rules`, damit sie sich je LAN ändern lassen.
- Jede Änderung an der Schnittstelle kommt auch in `docs/api.md`, in der Übersicht und im Changelog.

## Was prüft der Linter?

| Regel                                  | Prüfung                                                 |
| -------------------------------------- | ------------------------------------------------------- |
| Namen mit mindestens 3 Zeichen         | `varnamelen`                                            |
| Datei bis 500 Zeilen                   | `revive` (`file-length-limit`)                          |
| Kurze, einfache Funktionen             | `funlen`, `cyclop`, `gocognit`, `nestif`, `maintidx`    |
| Höchstens 5 Parameter und 3 Ergebnisse | `revive` (`argument-limit`, `function-result-limit`)    |
| Getrennte Module, reine Regeln         | `depguard`                                              |
| Seiten: Komplexität und Größe wie im Client | `oxlint`, Typen mit `tsc`                          |
| Keine globalen Variablen, kein `init`  | `gochecknoglobals`, `gochecknoinits`                    |
| Keine magischen Zahlen und Texte       | `mnd`, `goconst` (ab 2 Vorkommen)                       |
| Kein globaler Logger, `snake_case`-Keys | `sloglint`                                             |
| Kleine, klein geschriebene Fehlertexte | `staticcheck` (`ST1005`)                                |
| Kein `panic`, Uhr nur von außen        | `forbidigo`, `revive` (`deep-exit`)                     |
| Fehler geprüft und umschlossen         | `errcheck`, `errorlint`, `err113`, `wrapcheck`, `nilerr` |
| Sichere Typumwandlung                  | `forcetypeassert`, `errcheck`                           |
| Schließen von Ressourcen, Kontext      | `rowserrcheck`, `sqlclosecheck`, `bodyclose`, `noctx`   |
| Doku-Kommentare und Satzende           | `revive` (`exported`), `godot`                          |
| Sonderregeln mit Begründung            | `nolintlint`                                            |

Die Tests in `internal/architecture` prüfen zusätzlich mit `go test`:

- ein einziger Einstiegspunkt
- ein Plan-Kommentar an jeder Goroutine und jedem Channel, aber nicht dessen Inhalt
- benannte SQL-Queries, die nur bei mehreren Nutzern außerhalb einer Funktion stehen

Dafür gibt es keine automatische Prüfung, deshalb im Review darauf achten:

- kurze Namen, die nur in der direkt folgenden Zeile vorkommen, das lässt `varnamelen` durch
- englische Kommentare und Bezeichner
- Verb plus Substantiv und beschreibende Namen
- ob der Plan für Goroutinen und Channels stimmt
- reine Funktionen außerhalb von `internal/rules`
- Länge und Inhalt von Kommentaren
- KISS

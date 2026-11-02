# AGENTS.md: Server

Diese Regeln gelten für allen Go-Code in `apps/server` und ergänzen das
[AGENTS.md im Root](../../AGENTS.md). Aufbau und Betrieb stehen in der [README](README.md), die
Schnittstelle in [docs/api.md](docs/api.md).

## Befehle

```sh
pnpm lint      # golangci-lint run, muss ohne Befund durchlaufen
pnpm format    # golangci-lint fmt (gofumpt, goimports)
pnpm test      # go test ./...
pnpm build     # go build
go test -race -count=1 ./...   # vor jedem Abschluss, sobald Nebenläufigkeit beteiligt ist
```

Benötigt `golangci-lint` in der festen Version v2.15.0 im `PATH`:

```sh
go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0
```

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
- `internal/store` kennt SQLite, aber kein HTTP. `internal/api` kennt HTTP, aber kein SQL.
- Nur `cmd/jelly-server` liest die Umgebung, wählt die echte Uhr und darf den Prozess beenden.
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
- `go test -race` muss durchlaufen.

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

## Weitere Regeln

- Schemaänderungen sind neue, nummerierte [goose](https://github.com/pressly/goose)-Dateien in
  `internal/store/migrations/` mit `-- +goose Up` und `-- +goose Down`. Bestehende bleiben unverändert.
  Der Server führt sie beim Start aus, ein Test prüft auch das Zurückrollen.
- Neue Spielwerte gehören in `rules.Rules`, damit sie sich je LAN ändern lassen.
- Jede Änderung an der Schnittstelle kommt auch in `docs/api.md`.

## Was prüft der Linter?

| Regel                                  | Prüfung                                                 |
| -------------------------------------- | ------------------------------------------------------- |
| Namen mit mindestens 3 Zeichen         | `varnamelen`                                            |
| Datei bis 500 Zeilen                   | `revive` (`file-length-limit`)                          |
| Kurze, einfache Funktionen             | `funlen`, `cyclop`, `gocognit`, `nestif`, `maintidx`    |
| Höchstens 5 Parameter und 3 Ergebnisse | `revive` (`argument-limit`, `function-result-limit`)    |
| Getrennte Module, reine Regeln         | `depguard`                                              |
| Keine globalen Variablen, kein `init`  | `gochecknoglobals`, `gochecknoinits`                    |
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

Dafür gibt es keine automatische Prüfung, deshalb im Review darauf achten:

- kurze Namen, die nur in der direkt folgenden Zeile vorkommen, das lässt `varnamelen` durch
- englische Kommentare und Bezeichner
- Verb plus Substantiv und beschreibende Namen
- ob der Plan für Goroutinen und Channels stimmt
- reine Funktionen außerhalb von `internal/rules`
- Länge und Inhalt von Kommentaren
- KISS

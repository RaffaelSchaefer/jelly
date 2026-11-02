# Jelly-Server

Der Server entscheidet während einer LAN über XP und Freischaltungen. App und Bühne zeigen nur an.
Er ist in Go geschrieben und speichert in einer SQLite-Datei. Die Schnittstelle steht in
[docs/api.md](docs/api.md).

Gebaut sind Konten, Stupser, Berichte, Event-Codes, Cosmetics, Achievements, Emotes, Partner-Emotes,
Schilder, die Raumkarte, Moderation, der Simulator und die 2D-Bühne. Die Admin-Seite folgt.

## Lokal starten

Benötigt Go 1.27. Eine LAN muss laufen, sonst lehnt der Server Registrierung und Stupser ab.

```sh
JELLY_JOIN_CODE=geheim go run ./cmd/jelly-server create-lan \
  -slug test -name "Test-LAN" \
  -from 2026-01-01T00:00:00+01:00 -to 2027-01-01T00:00:00+01:00
JELLY_STAGE_KEY=buehne JELLY_ADMIN_SECRET=admin go run ./cmd/jelly-server

curl -X POST localhost:8080/register \
  -d '{"code":"geheim","name":"Glibber","color":"mint"}'
```

## Bühne ansehen

`scripts/demo.sh` startet einen Wegwerf-Server mit Raumbereichen und 70 simulierten Jellies und nennt
den Link zur Bühne. Mit Strg+C ist alles wieder weg.

```sh
pnpm demo
```

Auf dem echten Server steht die Bühne unter `/stage/?key=<JELLY_STAGE_KEY>`. Sie zeichnet, was der
Server meldet. Wandern ist eine reine Funktion aus Spieler-ID und Serverzeit, daher zeigen alle
Bildschirme dasselbe und der Server speichert keine Positionen.

## Simulator

`jelly-server simulate` spielt viele Jellies über die öffentliche API und braucht keine Datenbank.
Damit lässt sich auch der Server auf dem VPS prüfen. Eine LAN muss laufen.

```sh
JELLY_JOIN_CODE=geheim go run ./cmd/jelly-server simulate -url http://localhost:8080
```

| Option       | Standard                | Zweck                                  |
| ------------ | ----------------------- | -------------------------------------- |
| `-url`       | `http://localhost:8080` | Adresse des Servers                    |
| `-players`   | 70                      | Anzahl der Jellies, höchstens 1000     |
| `-min-delay` | `2s`                    | Kürzeste Zeit zwischen zwei Aktionen   |
| `-max-delay` | `20s`                   | Längste Zeit zwischen zwei Aktionen    |
| `-duration`  | `0`                     | Laufzeit, `0` läuft bis zu einem Signal |

Am Ende stehen im Log angenommene und abgelehnte Aktionen, Fehler und Antwortzeiten. Können alle Bots
sich nicht anmelden, endet der Lauf mit dem Grund. Messungen stehen in
[benchmarks/README.md](benchmarks/README.md).

## Befehle

Über pnpm läuft der Server mit `pnpm test`, `pnpm lint`, `pnpm build` und `pnpm format` zusammen mit
dem Rest des Monorepos. `pnpm lint` braucht `golangci-lint`, die Version und alle Code-Regeln stehen
in [AGENTS.md](AGENTS.md). Node wird nur für Tests und Typprüfung der Seiten gebraucht, das Bauen
läuft über `go tool esbuild`.

| Variable          | Standard   | Zweck                                       |
| ----------------- | ---------- | ------------------------------------------- |
| `JELLY_DB`        | `jelly.db` | Pfad zur Datenbank                          |
| `JELLY_ADDR`      | `:8080`    | Adresse des Servers                         |
| `JELLY_JOIN_CODE` | keiner     | Anmeldecode, nur für `create-lan` nötig     |
| `JELLY_STAGE_KEY` | keiner     | Pflicht: Schlüssel der Bühne                |
| `JELLY_ADMIN_SECRET` | keiner  | Pflicht: Geheimnis der Admin-Anmeldung      |

## Aufbau

| Ort                | Inhalt                                                  |
| ------------------ | ------------------------------------------------------- |
| `cmd/jelly-server` | Einstieg, Serverstart und `create-lan`                  |
| `internal/api`     | HTTP-Wege und Fehlercodes                               |
| `internal/store`   | SQLite, Transaktionen, goose-Migrationen in `migrations/` |
| `internal/architecture` | Tests für Regeln, die kein Linter prüft            |
| `internal/rules`   | Spielregeln als reine Funktionen, ohne IO               |
| `internal/simulator` | Simulierte Spieler, nutzt nur die öffentliche API     |
| `internal/web`     | Liefert die gebauten Seiten aus, mit Sicherheits-Headern |
| `web/stage`        | Quelltext der Bühne in TypeScript, ohne Framework       |
| `scripts`          | Wiederholbare Hilfen wie die Demo                       |
| `benchmarks`       | Lasttest und Baselines                                  |
| `testdata/contract`| Regelfälle als JSON, Teil des API-Vertrags              |

## Betrieb

Das Image entsteht aus dem `Dockerfile` und speichert unter `/app/data`, das als Volume bestehen
bleiben muss. SIGINT und SIGTERM beenden den Server geordnet, offene Anfragen haben dafür bis zu 8
Sekunden und damit weniger als die 10 Sekunden von `docker stop`. Die Datenbank darf nicht im
laufenden Betrieb einfach kopiert werden. Backups entstehen mit `sqlite3 jelly.db "VACUUM INTO 'backup.db'"` und gehören auf ein anderes System.

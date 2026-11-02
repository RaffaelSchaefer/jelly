# Jelly-Server

Der Server entscheidet während einer LAN über XP und Freischaltungen. App und Bühne zeigen nur an.
Er ist in Go geschrieben und speichert in einer SQLite-Datei. Die Schnittstelle steht in
[docs/api.md](docs/api.md).

Gebaut sind Konten, Stupser, Berichte, Event-Codes, Cosmetics, Achievements, Emotes, Partner-Emotes,
Schilder, die Raumkarte und Moderation. Bühne, Admin-Seite und Simulator folgen.

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

## Befehle

Über pnpm läuft der Server mit `pnpm test`, `pnpm lint`, `pnpm build` und `pnpm format` zusammen mit
dem Rest des Monorepos. `pnpm lint` braucht `golangci-lint`, die Version und alle Code-Regeln stehen
in [AGENTS.md](AGENTS.md).

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
| `testdata/contract`| Regelfälle als JSON, Teil des API-Vertrags              |

## Betrieb

Das Image entsteht aus dem `Dockerfile` und speichert unter `/app/data`, das als Volume bestehen
bleiben muss. SIGINT und SIGTERM beenden den Server geordnet, offene Anfragen haben dafür bis zu 8
Sekunden und damit weniger als die 10 Sekunden von `docker stop`. Die Datenbank darf nicht im
laufenden Betrieb einfach kopiert werden. Backups entstehen mit `sqlite3 jelly.db "VACUUM INTO 'backup.db'"` und gehören auf ein anderes System.

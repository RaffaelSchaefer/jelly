# Messungen

Hier stehen wiederholbare Messungen und ihre Baselines. Nach einer Änderung, die Leistung beeinflussen
kann, Messung wiederholen und eine neue Zeile mit Commit eintragen.

Die Werte stammen von einem Laptop, Server und Simulator laufen dort auf demselben Rechner. Sie taugen
zum Vergleich zwischen Commits, nicht als Vorhersage für den VPS.

## Datenbankzugriffe

`pnpm bench` misst die wichtigsten Zugriffe mit 70 Spielern in einer echten SQLite-Datei.

| Datum      | Commit    | Rechner      | `ApplyPoke`  | `LoadStageState` | `ListEventsAfter` |
| ---------- | --------- | ------------ | ------------ | ---------------- | ----------------- |
| 2026-11-02 | `b16a0c4` | i7-1185G7, 8 | 726 µs       | 220 µs           | 106 µs            |
| 2026-11-03 | `e36f219` | i7-1185G7, 8, Akku | 1.275 µs | 493 µs           | 271 µs            |

## Lasttest

`pnpm bench:load [Spieler] [kürzeste Pause] [längste Pause] [Sekunden]` startet einen frischen Server und
lässt den Simulator dagegen spielen. „Abgelehnt“ ist normal, zum Beispiel eine Abklingzeit.

| Datum      | Commit    | Spieler | Pausen      | Dauer | Angenommen | Abgelehnt | Fehler | Mittel  | Maximum |
| ---------- | --------- | ------- | ----------- | ----- | ---------- | --------- | ------ | ------- | ------- |
| 2026-11-02 | `b16a0c4` | 70      | 2 bis 20 s  | 60 s  | 353        | 3         | 0      | 4,7 ms  | 9,8 ms  |
| 2026-11-02 | `b16a0c4` | 70      | 20 bis 100 ms | 15 s | 10.300    | 5.865     | 0      | 4,5 ms  | 97 ms   |
| 2026-11-03 | `e36f219` | 70      | 2 bis 20 s  | 60 s  | 355        | 7         | 0      | 4,4 ms  | 10 ms   |
| 2026-11-03 | `e36f219` | 70      | 20 bis 100 ms | 15 s | 4.215     | 1.393     | 0      | 123 ms  | 1,2 s   |

Die erste Zeile entspricht etwa der LAN-Last, die zweite ist ein Vielfaches davon, rund 1.080 Aktionen
pro Sekunde.

Die Zeilen vom 2026-11-03 entstanden auf Akku im Modus `powersave` und taugen nicht zum Vergleich mit den
Netzteil-Werten: Abwechselnd gemessen schafft `652790c`, der Stand der ersten Baseline, dort dasselbe. Der
Wechsel auf huma ändert im Vergleich auf demselben Rechner nichts Messbares. Vor neuen Baselines am Netzteil
messen.

Noch nicht gemessen sind offene Streams vieler Bühnen, eine über Tage gewachsene Datenbank und der
VPS hinter Traefik.

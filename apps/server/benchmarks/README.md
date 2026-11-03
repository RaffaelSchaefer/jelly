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

## Lasttest

`pnpm bench:load [Spieler] [kürzeste Pause] [längste Pause] [Sekunden]` startet einen frischen Server und
lässt den Simulator dagegen spielen. „Abgelehnt“ ist normal, zum Beispiel eine Abklingzeit.

| Datum      | Commit    | Spieler | Pausen      | Dauer | Angenommen | Abgelehnt | Fehler | Mittel  | Maximum |
| ---------- | --------- | ------- | ----------- | ----- | ---------- | --------- | ------ | ------- | ------- |
| 2026-11-02 | `b16a0c4` | 70      | 2 bis 20 s  | 60 s  | 353        | 3         | 0      | 4,7 ms  | 9,8 ms  |
| 2026-11-02 | `b16a0c4` | 70      | 20 bis 100 ms | 15 s | 10.300    | 5.865     | 0      | 4,5 ms  | 97 ms   |

Die erste Zeile entspricht etwa der LAN-Last, die zweite ist ein Vielfaches davon, rund 1.080 Aktionen
pro Sekunde.

## 3D-Bühne

Die Bühne zeichnet mit höchstens 30 Bildern pro Sekunde. Gemessen mit `scripts/demo-docker.sh start
[Spieler]` und Chromium über das DevTools-Protokoll (`Performance.getMetrics`): Rechenzeit des
Hauptthreads pro Sekunde, davon Skript, bei 1920×1080 und `?scale=1`. Ein Bild darf höchstens 33 ms
kosten.

| Datum      | Commit     | Rechner                     | Jellies | Skript pro Bild | Hauptthread pro Bild |
| ---------- | ---------- | --------------------------- | ------- | --------------- | -------------------- |
| 2026-11-03 | `stage-3d` | Ryzen 7 5700X, RTX 3090     | 70      | 4,3 ms          | 6,3 ms               |
| 2026-11-03 | `stage-3d` | Ryzen 7 5700X, RTX 3090     | 200     | 12,5 ms         | 23 ms                |
| 2026-11-03 | `stage-3d` | Ryzen 7 5700X, RTX 3090     | 70, Halle mit Bühne, Lounge, Snackbar und Fischauge | 4,7 ms | 7,2 ms |

Die Grafikkarte war bei beiden Messungen nicht der Engpass. Auf schwächerer Grafik hilft `?scale=0.5`.
Noch nicht gemessen ist ein Rechner mit integrierter Grafik, wie er bei der LAN die Bühne zeigen könnte.

Noch nicht gemessen sind offene Streams vieler Bühnen, eine über Tage gewachsene Datenbank und der
VPS hinter Traefik.

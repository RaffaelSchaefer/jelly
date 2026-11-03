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

## 3D-Bühne

Die Bühne zeichnet mit höchstens 30 Bildern pro Sekunde. Gemessen mit `pnpm demo` oder
`scripts/demo-docker.sh start [Spieler]` und Chromium über das DevTools-Protokoll
(`Performance.getMetrics`): Rechenzeit des Hauptthreads pro Bild, davon Skript, bei 1920×1080 und
`?scale=1`. Ein Bild darf höchstens 33 ms kosten. Das Skript wartet, bis die Jellies stehen, misst
dann und speichert auf Wunsch ein Bildschirmfoto:

```sh
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node benchmarks/stage.mjs "http://127.0.0.1:18092/stage/?key=demo-stage" 20 buehne.png
```

| Datum      | Commit     | Rechner                     | Jellies | Skript pro Bild | Hauptthread pro Bild |
| ---------- | ---------- | --------------------------- | ------- | --------------- | -------------------- |
| 2026-11-03 | `stage-3d` | Ryzen 7 5700X, RTX 3090     | 70      | 4,3 ms          | 6,3 ms               |
| 2026-11-03 | `stage-3d` | Ryzen 7 5700X, RTX 3090     | 200     | 12,5 ms         | 23 ms                |
| 2026-11-03 | `stage-3d` | Ryzen 7 5700X, RTX 3090     | 70, Halle mit Bühne, Lounge, Snackbar und Fischauge | 4,7 ms | 7,2 ms |
| 2026-11-03 | `97b009b`  | Apple M1 Pro                | 70, Halle wie oben              | 4,1 ms          | 4,7 ms               |
| 2026-11-03 | `stage-3d` | Apple M1 Pro                | 70, eingerichtete Bühne, Lounge und Snackbar | 4,2 ms | 4,8 ms       |
| 2026-11-03 | `stage-3d` | Apple M1 Pro                | 70, wie oben, Leinwand 3840×2160 | 4,6 ms          | 5,3 ms               |
| 2026-11-03 | `40f575e`  | Apple M1 Pro, `stage.mjs`   | 70, wie oben, 1.473 Draw-Calls   | 5,7 ms          | 6,4 ms               |
| 2026-11-03 | `0c770d8`  | Apple M1 Pro, `stage.mjs`   | 70, wie oben, 449 Draw-Calls     | 4,6 ms          | 5,4 ms               |

Die Grafikkarte war bei keiner Messung der Engpass, die Zeit geht in die Vorbereitung der Draw-Calls
in three.js. Deshalb teilen sich gleiche Teile Geometrie und Material (`deab2e5`). Die beiden
`stage.mjs`-Zeilen sind Mittel aus drei abwechselnden Läufen zu je 30 Sekunden. Einzelne Läufe streuen
auf dem Laptop um gut 1 ms, Vergleiche daher immer abwechselnd messen. Auf schwächerer Grafik hilft `?scale=0.5`.
Noch nicht gemessen ist ein Rechner mit integrierter Grafik, wie er bei der LAN die Bühne zeigen könnte.

Noch nicht gemessen sind offene Streams vieler Bühnen, eine über Tage gewachsene Datenbank und der
VPS hinter Traefik.

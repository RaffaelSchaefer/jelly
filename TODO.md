# TODO

Was noch zu tun ist. Erledigtes einfach löschen, die Git-Historie merkt es sich.

## 1. Spielzeit-Tracking für Achievements

Die Erfolge „Erste Runde“ (`first-game`) und „Marathon“ (`marathon`, 10 h am Stück) stehen fest auf
0, siehe `achievementProgress` in `apps/client/src/pet/achievements.ts`. Daran hängt auch das
Cosmetic `glow-aura`. Recherche mit Quellen: `apps/client/docs/research/2026-10-21-steam-discord-integration.md`.

- [ ] Quelle festlegen:
  - **Steam Web API, `GetPlayerSummaries` → `gameid`, jede Minute abfragen.** Offiziell. Der
    API-Key darf aber nicht in die App, braucht also einen Server (siehe 2). Klappt nur bei
    öffentlichen Spieldetails.
  - **Lokal unter Windows über die Registry, `HKCU\Software\Valve\Steam\RunningAppID`.** Kein Key
    und kein Server nötig. Undokumentiert und leicht zu fälschen. Nur Windows, nur über Steam
    gestartete Spiele.
- [ ] SteamID mit dem Pet verknüpfen: Steam OpenID über den Server, oder für die LAN einfach die
      Profil-URL eingeben lassen.
- [ ] Rust: eigene Liste `sessions: Vec<{ appid, start, end }>` im Spielstand (nicht in `log`, das
      sind nur XP-Gewinne). Neues Feld mit `#[serde(default)]`, damit alte Spielstände weiter laden.
- [ ] „Am Stück“ definieren, zum Beispiel höchstens 15 Minuten Pause zwischen zwei Sitzungen.
- [ ] Oberfläche: Wird kein `gameid` geliefert (private Spieldetails), das erklären statt still 0 h
      anzuzeigen.
- [ ] Gibt es XP fürs Spielen? Wenn ja, wie viel und mit welchem Limit.

## 2. Server

Ziele: andere Leute verbinden, deren angepasste Jellies sehen, Multiplayer-Funktionen wie Game-Lobbys
suchen. Gebaut wird der Server in Go unter `apps/server/`, siehe dessen README. Bisher kann er
Registrierung, eigenen Stand und Stupser.

### Server

Zentraler Server, weil:

- Der Steam-API-Key und später ein Discord-Bot müssen sowieso auf einem Server liegen (siehe 1).
- Lobbys, „wer ist online“ und die Liste der Jellies brauchen eine gemeinsame Wahrheit. P2P müsste
  den Zustand zwischen allen Clients abgleichen, inklusive Konflikten und Nachzüglern.
- P2P findet andere Geräte nur im selben Netz (mDNS). Hinter NAT, also im Uni-WLAN oder von zu Hause,
  braucht es trotzdem einen Vermittlungs- oder Relay-Server.
- Nur ein Server kann Schummeln begrenzen, etwa bei XP oder Event-Teilnahmen.

Nachteil: Er muss betrieben werden und fällt eventuell aus. Während einer LAN kommt XP nur vom
Server. Ohne Server startet die App weiter und zeigt den letzten Stand, vergibt aber keine XP.

### Offene Fragen

- [ ] **Datenschutz:** Was sehen andere von mir? Name, Farbe, Cosmetic, Level, gerade gespieltes Spiel?

### Funktionen (erste Ideen)

- [ ] Präsenz: Wer ist mit welchem Jelly online.
- [ ] Jellies anderer ansehen: Name, Farbe, Cosmetic, Level.
- [ ] Game-Lobbys: anlegen, suchen, beitreten (gab es früher in `apps/bot` und `apps/backend`, Commit `baaa0b7`).
- [ ] Event-Teilnahmen bestätigen und an `record_event` schicken (der Rust-Befehl existiert schon).

## 3. Sonstiges

- [ ] Transparente Fensterbereiche durchklickbar machen.
- [ ] Fensterposition und -größe speichern.
- [ ] Systemweite Aktivität (Eingabezähler, keine Inhalte) prüfen: Windows zuerst, Linux/X11/Wayland
      getrennt, Anti-Cheat-Verträglichkeit testen.
- [ ] Linux und macOS auf echter Hardware testen.
- [ ] Bundling: `icon.icns` für macOS, Installer, Signierung, Updates.
- [ ] Cosmetic-Modelle (`.glb`) in Blender bauen und nach `apps/client/src/cosmetics/` exportieren.
- [ ] TypeDoc nachrüsten, sobald es TypeScript 7 unterstützt.

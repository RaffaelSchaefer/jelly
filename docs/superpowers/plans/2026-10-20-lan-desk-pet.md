# LAN Desk Pet Implementation Plan

**Goal:** Startbarer lokaler Desktop-Prototyp für die LAN mit echtem Rust-Spielstand.

**Architecture:** Rust besitzt Spielzustand, Aktionen und Dateizugriff; Tauri ist
die Desktop-Hülle. React zeigt die kleine Bedienleiste und einen austauschbaren
React-Three-Fiber-Charakter.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Vite, React Three Fiber 9.

**Spec:** `docs/superpowers/specs/2026-10-20-lan-desk-pet-design.md`

## Constraints
Kein Server, keine Accounts, keine Käufe-Verifikation. Eingaben zunächst nur im
eigenen Fenster. Browsermodus ist ausdrücklich eine Vorschau. Keine bestehende
Codebasis oder Spielstände im Repository; deshalb keine Migration von Altdaten.

## Aufgaben
1. Toolchain und aktuelle Tauri-/R3F-Dokumentation prüfen; Projektkonfiguration anlegen.
2. Rust-Domänentests zuerst: XP/Level, Cooldown, Name/Farbe, Datei-Roundtrip,
   defekte Datei und fehlgeschlagene Speicherung. Dann Modell, Store und IPC anbinden.
3. Frontend-Vertrag und Levelanzeige testen, dann UI und transparente Shader-Szene
   implementieren. Fehler sichtbar machen, Tastaturbedienung und reduzierte Bewegung beachten.
4. Frontend-Tests und Produktionsbuild, Rust-Tests/Formatierung/Clippy, nativen Build
   und Browseransicht prüfen. README mit Startbefehlen und Plattformgrenzen schreiben.

## Review focus
Defekte/zu neue Spielstände nicht überschreiben; Fehler beim Speichern nicht als
Erfolg anzeigen; Eingaben in Namensfeldern nicht zählen; Rendering-Ausfall erklären;
Browseransicht nicht mit dem nativen Desktopbetrieb verwechseln.

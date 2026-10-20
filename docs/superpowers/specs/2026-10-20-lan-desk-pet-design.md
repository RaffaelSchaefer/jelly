# LAN Desk Pet — erster Prototyp

## Ziel
Ein lokaler Begleiter für die LAN am Umwelt-Campus Birkenfeld im November 2026.
Ein minimalistischer 3D-Charakter lebt über einer kleinen Glas-Leiste auf dem
Desktop. Essen, Getränke und Veranstaltungen werden auf Vertrauensbasis selbst
gemeldet. Windows und Linux haben Priorität; macOS ist ein nachrangiges Ziel.

## Architektur
Tauri 2 stellt das rahmenlose, transparente Desktop-Fenster und das Rust-Backend.
React und TypeScript bilden die Oberfläche; React Three Fiber / Three.js rendern
den austauschbaren 3D-Platzhalter mit einem einfachen Toon-Shader. Zunächst WebGL
für eine breitere WebView-Abdeckung. WebGPU ist keine Voraussetzung für Shader.
Ein Rust-Modul verwaltet Spielstand, Validierung, Aktionen und XP. Gespeichert
wird lokal im App-Datenverzeichnis, ohne Server, Account oder Bezahlanbindung.

## Erster Umfang
- Ein transparentes, verschiebbares, stets oben liegendes Fenster (420 × 620).
- Minimalistischer animierter 3D-Platzhalter; finaler Charakter wird später gestaltet.
- XP: Pet anklicken / Taste im fokussierten Pet-Fenster = 1, Essen = 15,
  Getränk = 10, Event = 30. Je 100 XP ein Level; keine negativen Bedürfnisse.
- Eingabe-XP höchstens einmal pro Sekunde; keine Speicherung von Tasteninhalten.
- Name (1–24 Zeichen), drei Farben und abschaltbare Animation.
- Lokaler JSON-Spielstand mit Schemaversion, Validierung und atomarem Dateiersatz.
  Defekte Dateien werden als Fehler gemeldet, niemals still überschrieben.
- Browseransicht als ausdrücklich markierte visuelle Vorschau. Sie simuliert keine
  Rust-Persistenz; Spielaktionen sind dort deaktiviert.

## Grenzen und nächste Entscheidungen
Systemweite Maus-/Tastatur-Hooks sind noch nicht implementiert. Das Pet reagiert
zunächst nur im eigenen Fenster. Hintergrundaktivität benötigt eine bewusste,
optionale native Integration mit Zählern statt Tastaturinhalten; Wayland und
Anti-Cheat-Verträglichkeit müssen dafür separat geprüft werden.
Transparente Pixel reichen Eingaben im ersten Stand noch nicht durch. Always-on-top
garantiert keine Anzeige über exklusiven Vollbildspielen. Linux-Compositoren und
WebViews sowie macOS-Transparenz werden auf echter Hardware geprüft.
Native Desktop-Unschärfe ist keine Voraussetzung: CSS-Glas erhält einen lesbaren
halbtransparenten Untergrund; echtes Wallpaper-Blur wäre eine spätere Plattformarbeit.

## Fehlerbehandlung und Prüfung
Rust ist die maßgebliche Quelle für Spielzustand und XP. Änderungen werden erst
nach erfolgreichem Speichern übernommen. Eine zentrale Sperre serialisiert Befehle.
Das offizielle Single-Instance-Plugin verhindert parallele schreibende App-Instanzen.
Tests prüfen XP/Levelgrenzen, Eingabe-Cooldown, ungültige Einstellungen, defekte
Spielstände und persistente Änderungen. TypeScript-Build, Frontend-Tests,
Rust-Tests und nativer Windows-Build prüfen die technische Grundlage.

## Referenzen
- https://v2.tauri.app/start/frontend/vite/
- https://v2.tauri.app/learn/window-customization/
- https://v2.tauri.app/security/capabilities/
- https://r3f.docs.pmnd.rs/getting-started/installation
- https://r3f.docs.pmnd.rs/api/canvas

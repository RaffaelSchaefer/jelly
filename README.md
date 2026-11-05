# Jelly

pnpm-/Turborepo-Monorepo für Jelly, den Desktop-Begleiter für die LAN am Umwelt-Campus Birkenfeld.

- `apps/client`: Tauri-Desktop-App (Rust-Backend, React-Oberfläche)
- `apps/server`: Server in Go mit der 3D-Bühne für die LAN, siehe
  [apps/server/README.md](apps/server/README.md)
- `packages/jelly-scene`: das 3D-Jelly als reines three.js, genutzt von App und Bühne
- `packages/jelly-stage`: die 3D-Bühne als reines three.js, genutzt von der Bühnen-Seite des Servers
  und der Karte der App

```sh
pnpm install                              # Abhängigkeiten für alle Apps
pnpm --filter @jelly/client tauri dev     # Desktop-App starten
pnpm lint                                 # oxlint, clippy und golangci-lint in allen Apps
pnpm test                                 # Tests aller Apps und Pakete (Rust: pnpm --filter @jelly/client test:rust)
```

Details, Aufbau und Konventionen: [apps/client/README.md](apps/client/README.md).

# Jelly

pnpm-/Turborepo-Monorepo für Jelly, den Desktop-Begleiter für die LAN am Umwelt-Campus Birkenfeld.

- `apps/client`: Tauri-Desktop-App (Rust-Backend, React-Oberfläche)

```sh
pnpm install                              # Abhängigkeiten für alle Apps
pnpm --filter @jelly/client tauri dev     # Desktop-App starten
pnpm lint                                 # oxlint und clippy
pnpm test                                 # Frontend-Tests (Rust: pnpm --filter @jelly/client test:rust)
```

Details, Aufbau und Konventionen: [apps/client/README.md](apps/client/README.md).

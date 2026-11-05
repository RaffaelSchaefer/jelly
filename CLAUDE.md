# CLAUDE.md

Alle Projektregeln stehen in AGENTS.md (gilt für alle Agenten). Hier nur Ergänzungen für Claude Code.

@AGENTS.md

## Nur für Claude Code

- Passende Projekt-Skills aus `.claude/skills/` nutzen: `tauri-development` und `rust-best-practices`
  für `src-tauri/`, `threejs-shaders` für alle `shaders/` (Client, `packages/jelly-scene`,
  `packages/jelly-stage`), `threejs-react-three-fiber` für `src/scene/`, `vitest` für Tests,
  `vercel-react-best-practices` für React-Komponenten und Hooks.
- Änderungen an der Oberfläche in der Browser-Vorschau (`pnpm run webpreview:dev`) ansehen, Änderungen
  am Jelly zusätzlich auf der Bühne des Servers (`pnpm demo` in `apps/server`). Shader werden erst
  zur Laufzeit kompiliert, Build und Tests finden Shader-Fehler nicht.

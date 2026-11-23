import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages liefert die Seite unter https://raffaelschaefer.github.io/jelly/ aus.
  base: "/jelly/",
  clearScreen: false,
  build: {
    target: ["es2022", "chrome105", "safari15"],
    // Schriften als eigene Datei, wie im Client: Sie laden parallel und bleiben im Cache.
    assetsInlineLimit: (file) => (file.endsWith(".woff2") ? false : undefined),
    // Three.js allein ist gut 500 kB groß. Es kommt erst nach dem ersten Bild, im eigenen Bündel.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      // `@jelly/scene` hat beim Import keine Nebenwirkungen. Ohne diesen Hinweis kämen alle
      // Cosmetic-Modelle als Data-URL in das Bündel der Startseite, obwohl sie nur das Jelly zeigt.
      treeshake: { moduleSideEffects: (id: string) => !/\/jelly-scene\/src\/[^/]+\.ts$/.test(id) },
    },
  },
});

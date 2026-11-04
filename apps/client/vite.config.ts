import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: ["es2022", "chrome105", "safari15"],
    // Das Pet und die Karte im eigenen Fenster sind zwei Seiten.
    rolldownOptions: { input: { main: "index.html", map: "map.html" } },
  },
});

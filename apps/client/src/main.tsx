/**
 * Einstieg der Oberfläche: markiert Desktop oder Browser-Vorschau für das CSS und startet React.
 *
 * @module
 */

import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { desktop } from "./backend";
import "./styles.css";

// styles.css blendet je nach Umgebung Vorschau-Hintergrund und -Rahmen ein oder aus.
document.documentElement.dataset.surface = desktop ? "desktop" : "preview";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

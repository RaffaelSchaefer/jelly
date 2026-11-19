/**
 * Einstieg des Shop-Fensters: markiert Desktop oder Browser-Vorschau für das CSS und startet React.
 * Rust öffnet die Seite als eigenes Fenster (`src-tauri/src/popout.rs`), die Vorschau als
 * Browser-Fenster.
 *
 * Die Grundlagen des Ladens (`css/base.css`) kommen nach `styles.css` und `optimized.css`, jedes
 * Bauteil bringt sein eigenes CSS mit.
 *
 * @module
 */

import "../styles.css";
import "../optimized.css";
import "./css/base.css";
import React from "react";
import { createRoot } from "react-dom/client";

import { desktop } from "../backend";
import Shop from "./Shop";

document.documentElement.dataset.surface = desktop ? "desktop" : "preview";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Shop />
  </React.StrictMode>,
);

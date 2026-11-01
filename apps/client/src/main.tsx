import { isTauri } from "@tauri-apps/api/core";
import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles.css";

document.documentElement.dataset.surface = isTauri() ? "desktop" : "preview";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

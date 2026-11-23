/**
 * Zeigt das Pet groß mit beliebigen Cosmetics, zum Ansehen neuer Modelle ohne Studio. Unter
 * /scripts/cosmetic-check.html über den Vite-Server öffnen.
 *
 * Parameter: `wear` (Schlüssel, kommagetrennt, der Platz kommt aus `COSMETICS`), `color` (Farbe des
 * Jellys, sonst `mint`), `tint` (Farbe der einfärbbaren Teile als Hex-Text), `optimized` für den
 * optimierten Körper, `bg` (Hintergrund als CSS-Farbe), `emote` (Schlüssel einer Geste, die
 * dauerhaft läuft) und `motion` (volle Bewegung statt reduzierter, etwa fürs Pulsieren). Für
 * Nahaufnahmen ein großes Fenster wählen und ausschneiden.
 *
 * @module
 */

import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { COSMETICS, FULL_RENDERING, OPTIMIZED_RENDERING } from "../src/pet/index.ts";
import PetScene from "../src/scene/PetScene.tsx";

const PARAMS = new URLSearchParams(location.search);
const tint = PARAMS.get("tint");
const equipped = Object.fromEntries(
  (PARAMS.get("wear") ?? "")
    .split(",")
    .map((key) => COSMETICS.find((cosmetic) => cosmetic.id === key))
    .filter(Boolean)
    .map((cosmetic) => [cosmetic.slot, { key: cosmetic.id, color: tint }]),
);
if (PARAMS.has("bg")) document.body.style.background = PARAMS.get("bg");

createRoot(document.querySelector("#root")).render(
  createElement(PetScene, {
    rendering: {
      ...(PARAMS.has("optimized") ? OPTIMIZED_RENDERING : FULL_RENDERING),
      glass: false,
      dpr: 2,
    },
    frameLimit: null,
    color: PARAMS.get("color") ?? "mint",
    pulse: 0,
    reducedMotion: !PARAMS.has("motion"),
    equipped,
    emote: PARAMS.has("emote")
      ? { key: PARAMS.get("emote"), label: "", startedAt: performance.now(), seconds: 600 }
      : null,
  }),
);

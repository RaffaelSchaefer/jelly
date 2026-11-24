/**
 * Zeigt das Pet groß mit beliebigen Cosmetics, zum Ansehen neuer Modelle ohne Studio. Unter
 * /scripts/cosmetic-check.html über den Vite-Server öffnen.
 *
 * Parameter: `wear` (Schlüssel, kommagetrennt, der Platz kommt aus `COSMETICS`), `color` (Farbe des
 * Jellys, sonst `mint`), `tint` (Farbe der einfärbbaren Teile als Hex-Text), `optimized` für den
 * optimierten Körper, `bg` (Hintergrund als CSS-Farbe), `emote` (Schlüssel einer Geste, die
 * dauerhaft läuft), `motion` (volle Bewegung statt reduzierter, etwa fürs Pulsieren), `poke`
 * (Millisekunden bis zu einem Stupser, sonst 1500) und `window` (die Canvas des Pet-Fensters bei
 * dieser Größe in Prozent, sonst 100, statt eines Quadrats). Für Nahaufnahmen ein großes Fenster
 * wählen und ausschneiden.
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
if (PARAMS.has("window")) {
  // Die Canvas des Pet-Fensters (`pet/layout.ts`), mittig im 384 px breiten Fenster.
  const scale = (Number(PARAMS.get("window")) || 100) / 100;
  Object.assign(document.querySelector("#root").style, {
    width: `${396 * scale}px`,
    height: `${315 * scale}px`,
    clipPath: `inset(0 ${(396 * scale - 384) / 2}px)`,
  });
}

/** Die Szene mit dem Zählerstand `pulse`: Ändert er sich, wird das Pet gestupst. */
const scene = (pulse) =>
  createElement(PetScene, {
    rendering: {
      ...(PARAMS.has("optimized") ? OPTIMIZED_RENDERING : FULL_RENDERING),
      glass: false,
      dpr: 2,
    },
    frameLimit: null,
    color: PARAMS.get("color") ?? "mint",
    pulse,
    reducedMotion: !PARAMS.has("motion"),
    equipped,
    emote: PARAMS.has("emote")
      ? { key: PARAMS.get("emote"), label: "", startedAt: performance.now(), seconds: 600 }
      : null,
  });

const root = createRoot(document.querySelector("#root"));
root.render(scene(0));
if (PARAMS.has("poke")) setTimeout(() => root.render(scene(1)), Number(PARAMS.get("poke")) || 1500);

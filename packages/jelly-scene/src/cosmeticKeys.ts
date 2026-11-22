/**
 * Für welche Cosmetics es ein 3D-Modell gibt, ohne Three.js und ohne die Modelle selbst. So weiß
 * der Kaufbrief des Shops, ob eine Ware schon ein Abbild hat, ohne Three.js in den ersten Chunk zu
 * ziehen. Import als `@jelly/scene/cosmetic-keys`.
 *
 * Ein neues Modell gehört hierher und nach `COSMETIC_MODELS` in `cosmetic.ts`. Ein Test hält beide
 * Listen gleich.
 *
 * @module
 */

/** Die Schlüssel aller Cosmetics mit Modell, wie in `COSMETIC_MODELS`. */
export const COSMETIC_MODEL_KEYS: readonly string[] = [
  "bandana",
  "bat-wings",
  "beanie",
  "bell-collar",
  "cat-ears",
  "cat-paws",
  "cat-tail",
  "cat-whiskers",
  "chicken",
  "crown",
  "cyber-cat-ears",
  "fairy-wings",
  "golden-cup",
  "goose",
  "headset",
  "headset-neutral",
  "hood",
  "kamina-glasses",
  "kitten",
  "knit-scarf",
  "long-schnoerbi",
  "mini-backpack",
  "ogre-ears",
  "party-hat",
  "piercings",
  "pixel-glasses",
  "schnoerbi-mask",
  "snail-shell",
  "sprout",
  "yarn-ball",
];

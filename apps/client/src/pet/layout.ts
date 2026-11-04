/**
 * Geometrie der Pet-Bühne je nach Pet-Größe. Das Ergebnis landet als CSS-Variablen auf
 * `.pet-window` (siehe `App.tsx` und `styles.css`).
 *
 * @module
 */

import { PET_SIZE } from "./types";

/** Maße der Bühne bei 100 % in CSS-Pixeln. Muss zu `.pet-stage` in `styles.css` passen. */
const BASE = {
  stage: 330,
  canvas: { top: 43, width: 396, height: 315 },
  /** Von der Canvas-Oberkante bis dahin, wo er steht. */
  feet: 256,
  /** Von der Canvas-Oberkante bis zu seinem Scheitel. */
  head: 52,
  /** Von der Oberkante der Sprechblase bis zu seinem Scheitel. */
  bubbleGap: 75,
  bubbleTop: 20,
};

/**
 * Wo alles auf der Bühne bei einer bestimmten Größe (in Prozent) hingehört.
 *
 * Beim Verkleinern bleiben die Füße am Boden. Die Bühne behält ihre Höhe, damit die Panels weiter
 * passen. Beim Vergrößern bleibt der Kopf, wo er war, und die Bühne wächst nach unten in den freien
 * Platz unter dem Dock. So muss das Fenster selbst nie seine Größe ändern. Die Sprechblase schwebt
 * immer im gleichen Abstand über dem Kopf, die Fensterknöpfe darüber wandern mit.
 */
export function stageLayout(size: number) {
  const scale = Math.min(PET_SIZE.max, Math.max(PET_SIZE.min, size)) / 100;
  const baseFeet = BASE.canvas.top + BASE.feet;
  const baseHead = BASE.canvas.top + BASE.head;
  const feet = Math.max(baseFeet, baseHead + (BASE.feet - BASE.head) * scale);
  const canvasTop = feet - BASE.feet * scale;
  const headTop = canvasTop + BASE.head * scale;
  const stage = feet + (BASE.stage - baseFeet);
  const bubbleTop = headTop - BASE.bubbleGap;
  return {
    scale,
    canvas: {
      top: canvasTop,
      width: BASE.canvas.width * scale,
      height: BASE.canvas.height * scale,
    },
    feet,
    bubbleTop,
    toolsOffset: Math.max(0, bubbleTop - BASE.bubbleTop),
    stage,
  };
}

/**
 * Geometrie der Pet-Bühne je nach Pet-Größe. Das Ergebnis landet als CSS-Variablen auf
 * `.pet-window` (siehe `App.tsx` und `styles.css`).
 *
 * @module
 */

import { PET_SIZE } from "./types";

/**
 * So viel größer als die Maße hier ist die Canvas wirklich. Die Tropfen des Studios brauchen Platz
 * über ihren Rand hinaus. Das Pet bleibt, wo es ist: Die Canvas ragt nach allen Seiten gleich weit
 * über, und die Kamera sieht um denselben Faktor mehr (siehe `scene/PetScene.tsx`).
 */
export const CANVAS_OVERSCAN = 1.5;

/**
 * Bis hierhin reicht die Canvas mindestens nach oben, in Pixeln ab der Oberkante der Bühne. Das
 * Glas von Sprechblase, Emote-Auswahl und Schild-Säule zeichnet die Canvas: Bei einem kleinen Jelly
 * ragt sie deshalb weiter über als {@link CANVAS_OVERSCAN}, sonst fehlte ihnen oben das Glas.
 */
const GLASS_TOP = 0;

/**
 * So klein zeigen Studio, Einstieg und Aufstieg das Jelly höchstens. Darunter fänden die Tropfen
 * des Studios um das Jelly keinen Platz, und Ei und Zahl des Aufstiegs würden unlesbar.
 */
export const SHOWCASE_SIZE = 70;

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

/** Breite des Fensters. Feste Breite, denn Panels brauchen 340 px, und das Jelly bleibt so mittig. */
const WINDOW_WIDTH = 384;

/** Fensterhöhe ohne Bühne: oben 8, Knöpfe 30, Abstand 8, Dock 40, unten 14. Siehe `.pet-window`. */
const WINDOW_CHROME = 100;

/**
 * Wo alles auf der Bühne bei einer bestimmten Größe (in Prozent) hingehört.
 *
 * Beim Verkleinern bleiben die Füße am Boden. Die Bühne behält ihre Höhe, damit die Panels weiter
 * passen. Beim Vergrößern bleibt der Kopf, wo er war, und die Bühne wächst nach unten. Das Fenster
 * wächst mit, damit es nie größer ist als sein Inhalt: Durchsichtige Fensterfläche schluckt Klicks.
 * Die Sprechblase schwebt immer im gleichen Abstand über dem Kopf, die Fensterknöpfe darüber
 * wandern mit. Die Canvas schrumpft mit dem Jelly, ragt dann aber weiter über (`canvas.overscan`).
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
  const height = BASE.canvas.height * scale;
  // Die Canvas ragt nach allen Seiten gleich weit über, oben mindestens bis `GLASS_TOP`.
  const overscan = Math.max(CANVAS_OVERSCAN, 1 + (2 * (canvasTop - GLASS_TOP)) / height);
  return {
    scale,
    canvas: {
      top: canvasTop,
      width: BASE.canvas.width * scale,
      height,
      overscan,
      /** Oberkante der wirklich gezeichneten Canvas. */
      glassTop: canvasTop - (height * (overscan - 1)) / 2,
    },
    feet,
    bubbleTop,
    toolsOffset: Math.max(0, bubbleTop - BASE.bubbleTop),
    stage,
    window: { width: WINDOW_WIDTH, height: stage + WINDOW_CHROME },
  };
}

/**
 * In welcher Größe die Bühne das Jelly gerade zeigt. Studio, Einstieg und Aufstieg zeigen ein
 * kleines Jelly in {@link SHOWCASE_SIZE}, danach schrumpft es zurück.
 *
 * @param showcase - Ob Studio, Einstieg oder Aufstieg offen ist.
 */
export function stageSize(size: number, showcase: boolean) {
  return showcase ? Math.max(size, SHOWCASE_SIZE) : size;
}

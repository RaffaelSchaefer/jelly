/**
 * Wie aufwendig das Jelly oben auf der Seite gezeichnet wird: Startwahl nach Gerät und ein Messer,
 * das auf die optimierte Fassung umschaltet, wenn die Bilder zu langsam kommen. Reine Rechnung.
 *
 * @module
 */

import type { JellyQuality } from "@jelly/scene";

/** Was über die Hardware bekannt ist. Fehlende Werte gelten als gut. */
export interface HardwareHints {
  /** `navigator.hardwareConcurrency`. */
  cores?: number;
  /** `navigator.deviceMemory` in GB, nur Chromium. */
  memory?: number;
  /** `navigator.connection.saveData`. */
  saveData?: boolean;
}

/** Startet mit dem optimierten Körper auf kleinen Geräten und im Datensparmodus. */
export function initialQuality({ cores, memory, saveData }: HardwareHints): JellyQuality {
  if (saveData) return "optimized";
  if (cores !== undefined && cores <= 4) return "optimized";
  if (memory !== undefined && memory <= 4) return "optimized";
  return "full";
}

/** Höchste Pixeldichte je Fassung: Mehr kostet nur GPU, ohne dass man es sieht. */
export function pixelRatioFor(quality: JellyQuality, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio || 1, quality === "full" ? 2 : 1.25);
}

/** So viele Bilder misst das Messer, die ersten werden übersprungen (Shader kompilieren). */
const SAMPLE = { skip: 20, count: 60 } as const;

/**
 * Langsamer als das im Mittel (in Sekunden je Bild) gilt als zu langsam: unter 30 Bildern pro
 * Sekunde.
 */
const SLOW_FRAME = 1 / 30;

/**
 * Ein Messer für die ersten Bilder. Gibt einmal `true` zurück, sobald feststeht, dass das Gerät
 * nicht hinterherkommt, danach immer `false`.
 */
export function createSlowMeter(): (seconds: number) => boolean {
  let seen = 0;
  let total = 0;
  let done = false;
  return (seconds) => {
    if (done) return false;
    seen += 1;
    if (seen <= SAMPLE.skip) return false;
    total += seconds;
    if (seen < SAMPLE.skip + SAMPLE.count) return false;
    done = true;
    return total / SAMPLE.count > SLOW_FRAME;
  };
}

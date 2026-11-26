/**
 * Die ganz leise Musik zur Polonaise: `sounds/conga/bed.mp3` in Schleife nach `congaBedSegments`,
 * solange das eigene Jelly in einer steht. Sie spielt über die Geräusche der Oberfläche wie die
 * Musik der Jelly-News: Schalter und Lautstärke gelten, sie läuft nie doppelt und blendet weich ein
 * und aus.
 *
 * @module
 */

import { CONGA_BED, congaBedSegments } from "./pet";
import { playSegments } from "./uiBed";
import { levelFor, uiSounds, type Hush } from "./uiSound";

/** Die gewünschte Musik: wie sie endet und ob sie schon klingt. `null` ohne Polonaise. */
let bed: { stop: Hush | null; sounding: boolean } | null = null;

/** Spielt die Musik von vorn und blendet eine laufende aus. */
export function playCongaBed() {
  stopCongaBed();
  const mine: NonNullable<typeof bed> = { stop: null, sounding: false };
  mine.stop = uiSounds.playWith("congaBed", ({ context, output }, buffer, ended) => {
    mine.sounding = true;
    const track = { context, output: levelFor(context, "congaBed", output), buffer };
    return playSegments(track, congaBedSegments(), context.currentTime, ended);
  });
  bed = mine;
}

/** Blendet die Musik aus, etwa wenn die Polonaise endet. */
export function stopCongaBed() {
  bed?.stop?.(CONGA_BED.fadeOut);
  bed = null;
}

/**
 * Beginnt die gewünschte Musik noch einmal, falls sie bisher nicht klingen durfte: Sperrt die
 * WebView Ton bis zur ersten Geste, käme sie sonst gar nicht mehr (`LATE_MS` in `uiSound.ts`).
 * Klingt sie schon, bleibt sie, wie sie ist.
 */
export function retryCongaBed() {
  if (bed && !bed.sounding) playCongaBed();
}

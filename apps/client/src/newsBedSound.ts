/**
 * Die leise Musik unter den Jelly-News, live im Pet und beim Rendern: `sounds/news/bed.mp3` in
 * Abschnitten nach `bedSegments`. Sie setzt {@link BED_ENTRY_SECONDS} nach dem Beginn unter dem
 * Ausklang des Jingles ein, läuft in Schleife und blendet mit der Sendung aus. Live spielt sie über
 * die Geräusche der Oberfläche: Schalter und Lautstärke gelten, mit dem Schalter verstummt sie, und
 * eine neue Sendung löst die alte ab, statt sie zu doppeln.
 *
 * @module
 */

import { BED_ENTRY_SECONDS, bedSegments, NEWS_BED } from "./pet";
import { playSegments, startSegment } from "./uiBed";
import { decodeUiSound, levelFor, uiOutput, uiSounds, type Hush } from "./uiSound";

export { BED_ENTRY_SECONDS };

/** Wie die laufende Musik endet, `null` ohne. */
let stopBed: Hush | null = null;

/**
 * Spielt die Musik zu einer Sendung, die in `seconds` Sekunden endet, und blendet eine laufende
 * aus. Die neue setzt erst unter dem Ausklang des Jingles ein, beide überlappen also nicht.
 */
export function playNewsBed(seconds: number) {
  stopNewsBed();
  const segments = bedSegments(seconds - BED_ENTRY_SECONDS);
  if (segments.length === 0) return;
  stopBed = uiSounds.playWith("newsBed", ({ context, output }, buffer, ended) => {
    const track = { context, output: levelFor(context, "newsBed", output), buffer };
    return playSegments(track, segments, context.currentTime + BED_ENTRY_SECONDS, ended);
  });
}

/** Blendet die Musik aus, etwa wenn die Sendung vorzeitig endet. */
export function stopNewsBed() {
  stopBed?.(NEWS_BED.fadeOut);
  stopBed = null;
}

/**
 * Plant die Musik einer Sendung von `seconds` Sekunden, die bei `t0` beginnt, in einen fremden
 * Kontext wie einen `OfflineAudioContext`: dieselben Abschnitte und Pegel wie live bei voller
 * Lautstärke.
 */
export async function scheduleNewsBed(context: BaseAudioContext, t0: number, seconds: number) {
  const buffer = await decodeUiSound(context, "newsBed");
  const track = { context, output: levelFor(context, "newsBed", uiOutput(context)), buffer };
  for (const segment of bedSegments(seconds - BED_ENTRY_SECONDS)) {
    startSegment(track, segment, t0 + BED_ENTRY_SECONDS);
  }
}

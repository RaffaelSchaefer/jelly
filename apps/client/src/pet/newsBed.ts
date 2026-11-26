/**
 * Die leise Musik unter den Jelly-News (`sounds/news/bed.mp3`) als reiner Plan: welche Abschnitte
 * der Datei wann klingen. Der Jingle eröffnet allein, unter seinem Ausklang blendet die Musik ein
 * und läuft in Schleife, bis die Sendung endet. Dort blendet sie aus.
 *
 * Die Datei ist der gleichmäßige Mittelteil des gelieferten Stücks. Die Schleife springt am Ende
 * zurück an eine Stelle, an der die Musik im selben Takt weiterläuft, mit einer Überblendung von
 * drei Sekunden. Gespielt wird der Plan in `uiBed.ts`, live wie beim Rendern. Die Musik zur
 * Polonaise (`conga.ts`) läuft mit derselben Rechnung ({@link loopSegments}).
 *
 * @module
 */

/** Ein Abschnitt eines Tons, alle Zeiten in Sekunden. */
export interface SoundSegment {
  /** Beginn ab dem Start des Tons. */
  at: number;
  /** Stelle in der Datei, an der er beginnt. */
  offset: number;
  duration: number;
  /** So lange blendet er ein und am Ende aus. */
  fadeIn: number;
  fadeOut: number;
}

/** Wo eine Musik in ihrer Datei in Schleife läuft und wie sie ein- und ausblendet, in Sekunden. */
export interface SoundLoop {
  /** Die Schleife springt am Ende hierher zurück. */
  loopStart: number;
  /** Hier beginnt die Überblendung zurück an den Anfang der Schleife. */
  loopEnd: number;
  /** Länge der Überblendung. Die Datei reicht so weit über das Ende der Schleife hinaus. */
  crossfade: number;
  /** So lange blendet sie am Anfang ein. */
  fadeIn: number;
  /** So lange blendet sie am Ende aus. */
  fadeOut: number;
}

/** Die Schleife der Musik unter den Jelly-News. Sie blendet unter dem Jingle ein. */
export const NEWS_BED = {
  loopStart: 4.35,
  loopEnd: 36.43,
  crossfade: 3,
  fadeIn: 2,
  fadeOut: 2,
} as const satisfies SoundLoop;

/**
 * So viele Sekunden nach dem Beginn der Sendung setzt die Musik ein: kurz bevor der Jingle nach
 * 13,5 Sekunden ausklingt. So überlappen beide nur gut eine Sekunde, und die Musik ist voll da,
 * wenn der Jingle still ist.
 */
export const BED_ENTRY_SECONDS = 12.5;

/**
 * Ein Abschnitt, der vor `end` endet: Was darüber hinausginge, blendet bis `end` in höchstens
 * `fadeOut` Sekunden aus.
 */
function clip(segment: SoundSegment, end: number, fadeOut: number): SoundSegment {
  if (segment.at + segment.duration <= end) return segment;
  const duration = end - segment.at;
  return {
    ...segment,
    duration,
    fadeIn: Math.min(segment.fadeIn, duration / 2),
    fadeOut: Math.min(fadeOut, duration / 2),
  };
}

/**
 * Die Abschnitte einer Musik in Schleife für `seconds` Sekunden ab ihrem Einsatz. Der erste spielt
 * die Datei von vorn bis zum Ende der Schleife, jeder weitere die Schleife, und je zwei überblenden
 * sich. Alles endet mit `seconds`, das letzte Stück blendet dabei aus.
 */
export function loopSegments(bed: SoundLoop, seconds: number): SoundSegment[] {
  const { loopStart, loopEnd, crossfade, fadeIn, fadeOut } = bed;
  if (seconds <= 0) return [];
  const loop = loopEnd - loopStart;
  const segments: SoundSegment[] = [
    { at: 0, offset: 0, duration: loopEnd + crossfade, fadeIn, fadeOut: crossfade },
  ];
  for (let at = loopEnd; at < seconds; at += loop) {
    segments.push({
      at,
      offset: loopStart,
      duration: loop + crossfade,
      fadeIn: crossfade,
      fadeOut: crossfade,
    });
  }
  return segments.map((segment) => clip(segment, seconds, fadeOut));
}

/** Die Abschnitte der Musik unter den Jelly-News für `seconds` Sekunden ab ihrem Einsatz. */
export function bedSegments(seconds: number): SoundSegment[] {
  return loopSegments(NEWS_BED, seconds);
}

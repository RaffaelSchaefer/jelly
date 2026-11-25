/**
 * Die leise Musik unter den Jelly-News (`sounds/news/bed.mp3`) als reiner Plan: welche Abschnitte
 * der Datei wann klingen. Der Jingle eröffnet allein, unter seinem Ausklang blendet die Musik ein
 * und läuft in Schleife, bis die Sendung endet. Dort blendet sie aus.
 *
 * Die Datei ist der gleichmäßige Mittelteil des gelieferten Stücks. Die Schleife springt am Ende
 * zurück an eine Stelle, an der die Musik im selben Takt weiterläuft, mit einer Überblendung von
 * drei Sekunden. Gespielt wird der Plan in `uiBed.ts`, live wie beim Rendern.
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

/** Wo die Musik in ihrer Datei in Schleife läuft und wie sie ein- und ausblendet, in Sekunden. */
export const NEWS_BED = {
  /** Die Schleife springt am Ende hierher zurück. */
  loopStart: 4.35,
  /** Hier beginnt die Überblendung zurück an den Anfang der Schleife. */
  loopEnd: 36.43,
  /** Länge der Überblendung. Die Datei reicht so weit über das Ende der Schleife hinaus. */
  crossfade: 3,
  /** So lange blendet sie unter dem Jingle ein. */
  fadeIn: 2,
  /** So lange blendet sie am Ende der Sendung aus. */
  fadeOut: 2,
} as const;

/**
 * So viele Sekunden nach dem Beginn der Sendung setzt die Musik ein: kurz bevor der Jingle nach
 * 13,5 Sekunden ausklingt. So überlappen beide nur gut eine Sekunde, und die Musik ist voll da,
 * wenn der Jingle still ist.
 */
export const BED_ENTRY_SECONDS = 12.5;

/** Ein Abschnitt, der vor `end` endet: Was darüber hinausginge, blendet bis `end` aus. */
function clip(segment: SoundSegment, end: number): SoundSegment {
  if (segment.at + segment.duration <= end) return segment;
  const duration = end - segment.at;
  return {
    ...segment,
    duration,
    fadeIn: Math.min(segment.fadeIn, duration / 2),
    fadeOut: Math.min(NEWS_BED.fadeOut, duration / 2),
  };
}

/**
 * Die Abschnitte der Musik für `seconds` Sekunden ab ihrem Einsatz. Der erste spielt die Datei von
 * vorn bis zum Ende der Schleife, jeder weitere die Schleife, und je zwei überblenden sich. Alles
 * endet mit `seconds`, das letzte Stück blendet dabei aus.
 */
export function bedSegments(seconds: number): SoundSegment[] {
  const { loopStart, loopEnd, crossfade, fadeIn } = NEWS_BED;
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
  return segments.map((segment) => clip(segment, seconds));
}

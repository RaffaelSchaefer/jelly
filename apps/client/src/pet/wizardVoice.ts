/**
 * Was der Zauberer singt, wenn er spricht: die Silben des Jellys (`speechNotes`), aber alt. Zehn
 * Halbtöne tiefer, sodass die Melodie in D-Dur-Pentatonik landet wie das Ambiente des Shops. Dazu
 * langsamer, mit Zittern in jeder Silbe, kleinen Unsauberkeiten und einer gedehnten letzten Silbe.
 *
 * Die Silben beginnen genau dort, wo die Sprechblase sie im selben Tempo aufdeckt
 * (`SaidLine.tempo`). Seine Laute ohne Worte stehen in `wizardClips.ts`, seine Klangfarbe in
 * `voiceTimbre.ts`.
 *
 * @module
 */

import { inMood, speechNotes, type VoiceNote } from "./voice";
import { WIZARD_TEMPO, type Priority, type SayStyle } from "./wizardScripts";

/** Wie weit seine Stimme unter der des Jellys liegt, in Halbtönen. */
export const WIZARD_PITCH = -10;

/** Wie eine Sprechweise klingt: Tempo, Lautstärke und wie stark jede Silbe zittert, in Cent. */
interface StyleVoice {
  tempo: number;
  gain: number;
  shake: number;
}

/** Gesprochen, gedacht (leise, flott) und als Zauberspruch (langsam, bebend). */
const STYLES: Readonly<Record<Exclude<SayStyle, "snore">, StyleVoice>> = {
  speech: { tempo: WIZARD_TEMPO, gain: 1, shake: 12 },
  thought: { tempo: 1.05, gain: 0.5, shake: 12 },
  incantation: { tempo: 0.85, gain: 1, shake: 24 },
};

/** Ab dieser Länge zittert eine Silbe mindestens so stark, in Sekunden und Cent. */
const LONG_NOTE = { seconds: 0.2, shake: 16 } as const;

/** So weit verfehlt er jeden Ton, nach oben oder unten, in Cent. */
const JITTER_CENTS = 12;

/** Die letzte Silbe dehnt er und lässt sie einen Halbton tiefer sinken. */
const DRAWL = { stretch: 1.5, semitones: -1 } as const;

/** Beiläufiges (Rang 3) spricht er leiser, so übertönt es nie eine Antwort. */
const AMBIENT_GAIN = 0.55;

/** Das Tempo einer Sprechweise. Die Sprechblase deckt ihre Silben im selben Tempo auf. */
export function wizardTempo(style: SayStyle) {
  return style === "snore" ? 1 : STYLES[style].tempo;
}

/** Eine Folge von Zufallszahlen von −1 bis 1, die allein vom Text abhängt. */
function seededRandom(text: string) {
  let state = 2166136261;
  for (let index = 0; index < text.length; index++) {
    state = Math.imul(state ^ text.charCodeAt(index), 16777619);
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return ((state >>> 8) / 0xffffff) * 2 - 1;
  };
}

/** Eine Tonhöhe um `cents` verschoben. */
function detune(hz: number, cents: number) {
  return hz * 2 ** (cents / 1200);
}

/**
 * Die Noten, mit denen er `text` sagt. Das Schnarchen hat keine Worte, es kommt als Laut
 * (`wizardClips.ts`).
 *
 * @param priority - Wie wichtig das Skript ist. Beiläufiges klingt leiser.
 */
export function wizardVoice(text: string, style: SayStyle = "speech", priority: Priority = 1) {
  if (style === "snore") return [];
  const { tempo, gain, shake } = STYLES[style];
  const level = gain * (priority === 3 ? AMBIENT_GAIN : 1);
  const jitter = seededRandom(text);
  const notes = inMood(speechNotes(text), { pitch: WIZARD_PITCH, tempo });
  const last = notes.length - 1;
  return notes.map((note, index): VoiceNote => {
    const final = index === last;
    const duration = final ? note.duration * DRAWL.stretch : note.duration;
    const cents = jitter() * JITTER_CENTS;
    const long = duration >= LONG_NOTE.seconds ? LONG_NOTE.shake : 0;
    return {
      ...note,
      duration,
      from: detune(note.from, cents),
      to: detune(note.to, cents + (final ? DRAWL.semitones * 100 : 0)),
      gain: note.gain * level,
      shake: Math.max(note.shake ?? 0, shake, long),
    };
  });
}

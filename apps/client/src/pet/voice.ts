/**
 * Die Stimme des Jellys als reine Rechnung: Text wird zu Silben, Silben werden zu gesungenen Noten.
 *
 * Es klingt nach einer kleinen Synth-Figur, die in Silben singt. Jede Silbe behält den Vokal aus
 * dem Text, die Melodie ergibt sich aus dem Text selbst: Derselbe Satz klingt also immer gleich.
 * Hörbar macht das alles erst `src/voice.ts`.
 *
 * @module
 */

/** Ein Vokal, wie ihn die Formant-Filter in `src/voice.ts` kennen. */
export type Vowel = "a" | "e" | "i" | "o" | "u";

/** Ein gesungener Ton. Noten einer Phrase überlappen nie. */
export interface VoiceNote {
  /** Beginn in Sekunden ab dem Anfang der Phrase. */
  at: number;
  /** Länge in Sekunden. */
  duration: number;
  /** Tonhöhe am Anfang in Hertz. */
  from: number;
  /** Tonhöhe, zu der der Ton gleitet, in Hertz. */
  to: number;
  vowel: Vowel;
  /** Lautstärke von 0 bis 1. */
  gain: number;
  /** Kurzes Geräusch am Anfang: `tick` wie bei „t“, `hiss` wie bei „s“. */
  onset?: "tick" | "hiss";
  /** Stärke des Vibratos in Cent. */
  shake?: number;
  /** Singt der Partner eines Partner-Emotes. Sonst das eigene Jelly. */
  by?: "partner";
}

/** Wie eine Stimmung die Stimme färbt: Halbtöne höher oder tiefer, Tempo schneller oder langsamer. */
export interface VoiceMood {
  pitch: number;
  /** Über 1 schneller, unter 1 langsamer. */
  tempo: number;
}

/** Eine Silbe des Texts und wann sie an der Reihe ist, in Sekunden. */
export interface SpokenSyllable {
  text: string;
  at: number;
}

/** Tempo des Vibratos in Hertz. Der Mund zittert im selben Takt wie der Ton. */
export const VIBRATO_HZ = 5.8;

/** Der Grundton der Stimme in Hertz. Alles andere liegt in Halbtönen darum herum. */
const BASE_HZ = 523.25;

/**
 * Verstärkung zu einer Lautstärke in Prozent. Quadratisch, denn das Ohr hört Pegel logarithmisch:
 * So klingt die Mitte des Reglers auch ungefähr halb so laut.
 */
export function volumeGain(percent: number) {
  return (percent / 100) ** 2;
}

/** Singt Noten in einer Stimmung: um `pitch` Halbtöne verschoben, im Tempo `tempo`. */
export function inMood(notes: VoiceNote[], { pitch, tempo }: VoiceMood): VoiceNote[] {
  const factor = 2 ** (pitch / 12);
  return notes.map((note) => ({
    ...note,
    at: note.at / tempo,
    duration: note.duration / tempo,
    from: note.from * factor,
    to: note.to * factor,
  }));
}

/** Tonhöhe `semitones` Halbtöne über dem Grundton. */
export function noteHz(semitones: number) {
  return BASE_HZ * 2 ** (semitones / 12);
}

/** Dur-Pentatonik in Halbtönen: Hier klingt jede Folge nach einer kleinen Melodie. */
const SCALE = [-5, -3, 0, 2, 4, 7, 9, 12];

/** Wo die Melodie beginnt, als Platz in {@link SCALE}. */
const START_STEP = 3;

/** Schritte der Melodie von Silbe zu Silbe, als Plätze in {@link SCALE}. */
const MELODY_STEPS = [-2, -1, -1, 1, 1, 2];

/** Sprechtempo: Sekunden je Silbe. */
const SYLLABLE_SECONDS = 0.115;

/** Atempausen nach Satzzeichen. */
const COMMA_PAUSE = 0.09;
const STOP_PAUSE = 0.16;

/** Länger spricht das Jelly nicht am Stück. Längere Sätze werden schneller. */
const MAX_SPEECH_SECONDS = 2.4;

/** Die letzte Silbe klingt etwas aus. */
const LAST_NOTE_SECONDS = 0.24;

/** Abstand zwischen zwei Noten, damit Silben hörbar bleiben. */
const NOTE_GAP = 0.006;

/** Eine Silbe vor einer Pause wird nicht länger als das. */
const LONGEST_NOTE = SYLLABLE_SECONDS * 1.25;

/** Betonung am Wortanfang und im Wort. */
const WORD_START_GAIN = 1;
const INSIDE_WORD_GAIN = 0.82;

/** Zeichen, die eine Silbe tragen. Zahlen spricht das Jelly wie einen Vokal. */
const SINGING = /[aeiouyäöü0-9]/i;
const LETTER = /\p{L}/u;
const HISS_START = /^[^\p{L}]*(?:sch|[szßfvwcxh])/iu;
const TICK_START = /^[^\p{L}]*[ptkbdgq]/iu;
const COMMA_END = /[,;:–]\s*$/;
const STOP_END = /[.!?…]\s*$/;

/** Welchem gesungenen Vokal ein Zeichen entspricht. */
const VOWEL_OF: Record<string, Vowel> = {
  a: "a",
  ä: "e",
  e: "e",
  i: "i",
  y: "i",
  ü: "i",
  o: "o",
  ö: "e",
  u: "u",
};

/**
 * Teilt Text in Silben, die zusammen wieder genau den Text ergeben. Eine neue Silbe beginnt mit dem
 * nächsten Vokal und nimmt einen Konsonanten davor mit. Getrennt wird nur an Buchstaben und
 * Vokalen, ein Emoji bleibt also ganz.
 */
function splitSyllables(text: string) {
  const parts: string[] = [];
  let start = 0;
  let voiced = false;
  let inVowels = false;
  for (let index = 0; index < text.length; index++) {
    const singing = SINGING.test(text.charAt(index));
    if (singing && voiced && !inVowels) {
      const cut = LETTER.test(text.charAt(index - 1)) ? index - 1 : index;
      parts.push(text.slice(start, cut));
      start = cut;
    }
    voiced ||= singing;
    inVowels = singing;
  }
  parts.push(text.slice(start));
  return parts;
}

/** Wie lange das Jelly nach einem Stück Text Luft holt. */
function pauseAfter(part: string) {
  if (STOP_END.test(part)) return STOP_PAUSE;
  return COMMA_END.test(part) ? COMMA_PAUSE : 0;
}

/**
 * Die Silben eines Texts mit ihrem Einsatz. Das Aufdecken in der Sprechblase und die Noten der
 * Stimme nutzen dieselben Zeiten, deshalb laufen sie gemeinsam.
 */
export function speechSyllables(text: string): SpokenSyllable[] {
  const parts = splitSyllables(text);
  let time = 0;
  const starts = parts.map((part) => {
    const start = time;
    time += SYLLABLE_SECONDS + pauseAfter(part);
    return start;
  });
  const scale = Math.min(1, MAX_SPEECH_SECONDS / time);
  return parts.map((part, index) => ({ text: part, at: (starts[index] ?? 0) * scale }));
}

/** Eine Folge von Zufallszahlen, die allein vom Text abhängt. */
function createRandom(text: string) {
  let state = 2166136261;
  for (let index = 0; index < text.length; index++) {
    state = Math.imul(state ^ text.charCodeAt(index), 16777619);
  }
  return (count: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 16) % count;
  };
}

/** Die Halbtöne der Melodie. Mit `!` liegt sie eine Stufe höher. */
function createMelody(text: string, count: number, excited: boolean) {
  const random = createRandom(text);
  const top = SCALE.length - 1;
  let step = START_STEP + (excited ? 1 : 0);
  return Array.from({ length: count }, () => {
    const semitones = SCALE[step] ?? 0;
    step = Math.min(top, Math.max(0, step + (MELODY_STEPS[random(MELODY_STEPS.length)] ?? 0)));
    return semitones;
  });
}

/** Wo der letzte Ton hingleitet: Fragen steigen, Ausrufe bleiben oben, sonst sinkt die Stimme. */
function endingGlide(ending: string) {
  if (ending === "?") return 5;
  return ending === "!" ? -1 : -3;
}

/** Der gesungene Vokal einer Silbe. Ohne Vokal, etwa bei „XP“, singt das Jelly ein „a“. */
function vowelOf(part: string): Vowel {
  const found = SINGING.exec(part)?.[0]?.toLowerCase();
  if (!found) return "a";
  return VOWEL_OF[found] ?? "i";
}

/** Das Geräusch am Anfang einer Silbe. */
function onsetOf(part: string): VoiceNote["onset"] {
  if (HISS_START.test(part)) return "hiss";
  return TICK_START.test(part) ? "tick" : undefined;
}

/** Die Noten, mit denen das Jelly `text` spricht. */
export function speechNotes(text: string): VoiceNote[] {
  const syllables = speechSyllables(text);
  const ending = text.trimEnd().slice(-1);
  const melody = createMelody(text, syllables.length, ending === "!");
  const last = syllables.length - 1;
  return syllables.map(({ text: part, at }, index) => {
    const semitones = melody[index] ?? 0;
    // Die Stimme rutscht vom letzten Ton in den neuen, wie beim Singen.
    const slide = index === 0 ? semitones - 2 : 0.3 * (melody[index - 1] ?? 0) + 0.7 * semitones;
    const next = syllables[index + 1];
    const wordStart = index === 0 || /\s$/.test(syllables[index - 1]?.text ?? "");
    return {
      at,
      duration: next ? Math.min(LONGEST_NOTE, next.at - at - NOTE_GAP) : LAST_NOTE_SECONDS,
      from: noteHz(slide),
      to: noteHz(index === last ? semitones + endingGlide(ending) : semitones),
      vowel: vowelOf(part),
      gain: wordStart ? WORD_START_GAIN : INSIDE_WORD_GAIN,
      onset: onsetOf(part),
      shake: index === last ? 18 : undefined,
    };
  });
}

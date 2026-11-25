/**
 * Die Stimme des Vorlesers der Jelly-News: welche Klangfarbe er hat und welchen Satz er zu einem
 * Beitrag sagt. Er plappert in den Silben des Jellys, aber im Tonfall eines Nachrichtensprechers:
 * gleichmäßiges Tempo, betonte Wortanfänge, eine Stimme, die über den Satz sinkt und am Ende fällt.
 * Die Begrüßung klingt freundlich, eine dringende Meldung fester, „Vermischtes“ fragend.
 *
 * Alles hängt nur am Beitrag und an einer Zahl aus der Sendung: Jedes Pet sagt zum selben Beitrag
 * denselben Satz. Wann er fällt, rechnet `newsSchedule.ts`.
 *
 * @module
 */

import { scramble, type NewsBeat } from "@jelly/stage/news";

import { noteHz, type VoiceNote, type Vowel } from "./voice";
import { JELLY_TIMBRE, type VoiceTimbre } from "./voiceTimbre";

/** Wie ein Satz des Vorlesers verläuft. */
export type AnchorContour = "greeting" | "report" | "urgent" | "musing" | "farewell";

/** Mit welcher Stimme der Vorleser spricht. */
export interface AnchorVoice {
  /** Ob das eigene Jelly vorliest. Dann spricht es mit seiner eigenen Stimme und eigenem Mund. */
  own: boolean;
  /** Halbtöne gegenüber der Stimme des Jellys. */
  pitch: number;
  timbre: VoiceTimbre;
}

/** Ein Satz des Vorlesers, wie ihn die Stimme spielt. Jeder neue Satz ist ein neues Objekt. */
export interface AnchorLine {
  notes: VoiceNote[];
  timbre: VoiceTimbre;
  own: boolean;
}

/** Wie ein Verlauf klingt, alle Tonhöhen in Halbtönen. */
interface Shape {
  /** Die erste Silbe. */
  start: number;
  /** So weit sinkt die Stimme über den ganzen Satz. */
  drift: number;
  /** So viel höher setzt jedes Wort ein. */
  accent: number;
  /** Wohin die letzte Silbe gleitet: fallend wie ein Punkt, steigend wie eine Frage. */
  ending: number;
  /** Über 1 schneller. */
  tempo: number;
  /** Lautstärke der Silben im Wort. Die erste jedes Worts hat 1. */
  soft: number;
  /** Nach so vielen Wörtern holt er Luft, `0` nie. */
  breathAfter: number;
}

const SHAPES: Readonly<Record<AnchorContour, Shape>> = {
  // „Guten Abend, …“: hell und freundlich, nach den ersten zwei Wörtern eine Pause.
  greeting: { start: 5, drift: -4, accent: 2, ending: -5, tempo: 0.95, soft: 0.8, breathAfter: 2 },
  report: { start: 3, drift: -4, accent: 1.5, ending: -5, tempo: 1, soft: 0.78, breathAfter: 4 },
  // Fest und etwas schneller, jede Silbe kräftig, der Schluss fällt tief.
  urgent: { start: 4, drift: -3, accent: 3, ending: -7, tempo: 1.12, soft: 0.95, breathAfter: 3 },
  // „Vermischtes“: flacher, am Ende fragend nach oben.
  musing: { start: 2, drift: -2, accent: 1.5, ending: 6, tempo: 0.95, soft: 0.75, breathAfter: 4 },
  // „… und eine gute Nacht.“: langsamer, tiefer Schluss.
  farewell: {
    start: 3,
    drift: -5,
    accent: 1.5,
    ending: -6,
    tempo: 0.9,
    soft: 0.78,
    breathAfter: 3,
  },
};

/**
 * Sprechtempo des Vorlesers: Sekunden je Silbe, zügig wie im Studio, kaum langsamer als das
 * Plappern des Jellys.
 */
const SYLLABLE_SECONDS = 0.12;
/** Pausen zwischen Silben, Wörtern und beim Luftholen, in Sekunden. */
const GAPS = { note: 0.008, word: 0.025, breath: 0.14 } as const;
/** Die letzte Silbe ist so viel länger. */
const LAST_STRETCH = 1.7;
/** So weit verfehlt er jede Silbe nach oben oder unten, in Halbtönen. */
const WOBBLE = 0.6;
/** Kürzer als zwei Wörter ist kein Satz. */
const FEWEST_WORDS = 2;
/** Vokale nach ihrer Häufigkeit im Deutschen, grob. */
const VOWELS: readonly Vowel[] = ["a", "a", "a", "e", "e", "e", "e", "i", "i", "o", "u", "u"];

/**
 * Programmpunkte, die die Bühne rot zeigt: dann spricht er fest. Dieselben Arten wie `URGENT_KINDS`
 * in `packages/jelly-stage/src/newsLines.ts`.
 */
const URGENT_KINDS: ReadonlySet<string> = new Set(["orga", "tournament"]);

/** Die Stimme fremder Vorleser: so viele Halbtöne tiefer als das Jelly, und so viel tiefer noch. */
const ANCHOR_PITCH = { highest: -4, steps: 4 } as const;
/** Die Formanten fremder Vorleser, als Anteil der Formanten des Jellys: ein größerer Kopf. */
const ANCHOR_FORMANTS = { smallest: 0.84, step: 0.02, steps: 5 } as const;

/** Eine Folge von Zahlen von 0 bis 1, die allein von `seed` abhängt. */
function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Die Klangfarbe eines fremden Vorlesers: die des Jellys mit tieferen Formanten, mehr Körper, fast
 * ohne Vibrato und mit wenig Atem, ruhig wie im Studio.
 */
function anchorTimbre(scale: number): VoiceTimbre {
  const formants = Object.fromEntries(
    Object.entries(JELLY_TIMBRE.formants).map(([vowel, three]) => [
      vowel,
      three.map((hz) => Math.round(hz * scale)),
    ]),
  ) as unknown as VoiceTimbre["formants"];
  return {
    ...JELLY_TIMBRE,
    formants,
    bodyGain: 0.22,
    bodyCutoff: 2000,
    detuneCents: 5,
    vibratoCents: 2,
    breath: 0.035,
  };
}

/**
 * Die Stimme des Vorlesers `presenterId`, auf jedem Rechner dieselbe. Liest das eigene Jelly
 * `ownId` vor, spricht es mit seiner Alltagsstimme, so hört man: Das bin ich auf Sendung. Fremde
 * Vorleser liegen mindestens vier Halbtöne tiefer und klingen größer. Ohne Vorleser spricht eine
 * Stimme aus dem Off, die von `0`.
 */
export function anchorVoice(presenterId: number | null, ownId: number): AnchorVoice {
  if (presenterId === ownId) return { own: true, pitch: 0, timbre: JELLY_TIMBRE };
  const hash = scramble(presenterId ?? 0);
  const pitch = ANCHOR_PITCH.highest - (hash % ANCHOR_PITCH.steps);
  const step = (hash >>> 8) % ANCHOR_FORMANTS.steps;
  return {
    own: false,
    pitch,
    timbre: anchorTimbre(ANCHOR_FORMANTS.smallest + step * ANCHOR_FORMANTS.step),
  };
}

/** Wie der Vorleser einen Beitrag spricht. */
export function contourOf(beat: NewsBeat): AnchorContour {
  if (beat.kind === "intro") return "greeting";
  if (beat.kind === "outro") return "farewell";
  if (beat.kind === "extra") return "musing";
  if (beat.kind === "next" && URGENT_KINDS.has(beat.item.kind)) return "urgent";
  return "report";
}

/**
 * Wie viele Silben der Satz zu einem Beitrag hat, wenn genug Zeit ist. Er wächst mit dem, was der
 * Server zählt: Ziffern der XP, Länge des Erfolgs, Höhe des Turms, Länge des Titels.
 */
export function syllablesOf(beat: NewsBeat): number {
  switch (beat.kind) {
    case "intro":
      // Kurz: Die Begrüßung muss vor dem Schlag des Jingles fertig sein.
      return 8;
    case "top_xp":
      return 15 + 2 * String(Math.max(0, Math.round(beat.xp))).length;
    case "achievement":
      return 14 + Math.min(6, Math.ceil(beat.key.length / 3));
    case "stack":
      return 14 + Math.min(8, 2 * beat.memberIds.length);
    case "next":
      return 13 + Math.min(10, Math.ceil(beat.item.title.length / 4));
    case "extra":
      return 16;
    default:
      return 11;
  }
}

/** Teilt `syllables` Silben in Wörter von einer bis drei Silben. */
function splitWords(syllables: number, random: () => number) {
  const words: number[] = [];
  let left = syllables;
  while (left > 0) {
    const size = Math.min(left, random() < 0.25 ? 1 : random() < 0.75 ? 2 : 3);
    words.push(size);
    left -= size;
  }
  return words;
}

/** Wie lange Wörter dauern, mit allen Pausen dazwischen und der gedehnten letzten Silbe. */
function measure(words: number[], shape: Shape) {
  const syllable = SYLLABLE_SECONDS / shape.tempo;
  const count = words.reduce((sum, size) => sum + size, 0);
  const breaths = shape.breathAfter > 0 ? Math.floor((words.length - 1) / shape.breathAfter) : 0;
  const lastExtra = syllable * (LAST_STRETCH - 1);
  return (
    count * (syllable + GAPS.note) +
    (words.length - 1) * GAPS.word +
    breaths * GAPS.breath +
    lastExtra
  );
}

/** Lässt hinten Wörter weg, bis der Satz in `seconds` passt. Zu kurz für einen Satz: leer. */
function fitWords(words: number[], shape: Shape, seconds: number) {
  const kept = [...words];
  while (kept.length > FEWEST_WORDS && measure(kept, shape) > seconds) kept.pop();
  return measure(kept, shape) <= seconds ? kept : [];
}

/** Das Geräusch am Anfang einer Silbe: Wörter setzen meist mit einem Konsonanten ein. */
function onsetOf(first: boolean, random: () => number): VoiceNote["onset"] {
  const roll = random();
  if (first) return roll < 0.5 ? "tick" : roll < 0.8 ? "hiss" : undefined;
  return roll < 0.3 ? "tick" : roll < 0.45 ? "hiss" : undefined;
}

/** Was die Silben eines Satzes gemeinsam haben. */
interface Speaking {
  shape: Shape;
  /** Halbtöne der Stimme. */
  pitch: number;
  /** Zahl aller Silben. */
  total: number;
  random: () => number;
}

/** Eine Silbe an Stelle `index` im Satz, beginnend bei `at`. */
function syllable(speaking: Speaking, index: number, at: number, first: boolean): VoiceNote {
  const { shape, pitch, total, random } = speaking;
  const last = index === total - 1;
  const along = total > 1 ? index / (total - 1) : 0;
  const tone = pitch + shape.start + shape.drift * along + (first ? shape.accent : 0);
  const height = tone + (random() * 2 - 1) * WOBBLE;
  const length = (SYLLABLE_SECONDS / shape.tempo) * (last ? LAST_STRETCH : 1);
  return {
    at,
    duration: length,
    from: noteHz(height),
    to: noteHz(last ? height + shape.ending : height - 0.3),
    vowel: VOWELS[Math.floor(random() * VOWELS.length)] ?? "a",
    gain: first ? 1 : shape.soft,
    onset: onsetOf(first, random),
    shake: last ? 8 : undefined,
  };
}

/** Die Noten zu Wörtern: Silbe für Silbe, mit Pausen zwischen Wörtern und beim Luftholen. */
function speak(words: number[], speaking: Speaking): VoiceNote[] {
  const notes: VoiceNote[] = [];
  let at = 0;
  words.forEach((size, word) => {
    for (let index = 0; index < size; index++) {
      const note = syllable(speaking, notes.length, at, index === 0);
      notes.push(note);
      at += note.duration + GAPS.note;
    }
    const { breathAfter } = speaking.shape;
    at += GAPS.word + (breathAfter > 0 && (word + 1) % breathAfter === 0 ? GAPS.breath : 0);
  });
  return notes;
}

/**
 * Der Satz des Vorlesers zu `beat`, höchstens `seconds` lang: Passt er nicht, fallen hinten Wörter
 * weg, und ist selbst ein Satz aus zwei Wörtern zu lang, bleibt er leer. `seed` macht ihn für den
 * Beitrag unverwechselbar, `pitch` verschiebt ihn in die Lage der Stimme.
 */
export function anchorNotes(
  beat: NewsBeat,
  { seed, seconds, pitch }: { seed: number; seconds: number; pitch: number },
): VoiceNote[] {
  const shape = SHAPES[contourOf(beat)];
  const random = seededRandom(seed);
  const words = fitWords(splitWords(syllablesOf(beat), random), shape, seconds);
  const total = words.reduce((sum, size) => sum + size, 0);
  return total === 0 ? [] : speak(words, { shape, pitch, total, random });
}

/** Wie lange Noten klingen, in Sekunden. */
export function notesSeconds(notes: VoiceNote[]): number {
  const last = notes.at(-1);
  return last ? last.at + last.duration : 0;
}

/**
 * Der Satz, den die Stimme des Vorlesers jetzt beginnt, oder `null`. Nur ein neuer Satz, nur mit
 * Ton, und nur, solange das eigene Jelly schweigt: Seine Sätze gehen vor, der Vorleser setzt dann
 * für diesen Beitrag aus.
 *
 * @param ownBusy - Ob das eigene Jelly gerade spricht oder in diesem Moment zu sprechen beginnt.
 */
export function pickAnchor(
  before: AnchorLine | null,
  after: AnchorLine | null,
  sound: boolean,
  ownBusy: boolean,
): AnchorLine | null {
  if (!sound || !after || after === before || ownBusy) return null;
  return after.notes.length > 0 ? after : null;
}

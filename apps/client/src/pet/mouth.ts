/**
 * Der Lipsync: welche Mundform das Jelly zu welchem Zeitpunkt eines Lauts zeigt.
 *
 * Die Form kommt aus dem Vokal der Note, darüber liegt die Animation: Jede Form federt auf, leise
 * Töne bleiben kleiner, zum Ende einer Silbe schließt sich der Mund etwas, lange Töne zittern mit
 * dem Vibrato und am Wortanfang nickt der Kopf. Klingt das Sprechen zu hektisch oder zu steif, sind
 * die Werte hier die Stellschrauben. Die Formen selbst stehen in
 * `packages/jelly-scene/src/mouthShapes.ts`.
 *
 * @module
 */

import type { MouthFrame } from "@jelly/scene";

import { VIBRATO_HZ, type VoiceNote } from "./voice";

/**
 * Eine kürzere Lücke zählt schon zur nächsten Note. Bei 30 Bildern je Sekunde wäre sie nur ein
 * Zucken.
 */
const JOIN_GAP_SECONDS = 0.055;

/** Bis zu dieser Lücke schließt sich der Mund, bei längerer Stille lächelt das Jelly wieder. */
const CLOSED_GAP_SECONDS = 0.15;

/** So lange bleibt der Mund bei einem harten Konsonanten zu. Bei 30 Bildern je Sekunde gut ein Bild. */
const TICK_SECONDS = 0.035;

/** Die Feder, mit der eine neue Form aufspringt: Startgröße, Abklingen und Schwingen. */
const SPRING = { startBelow: 0.25, decaySeconds: 0.04, speed: 60 };

/** So groß bleibt der Mund bei einem ganz leisen Ton. */
const QUIETEST_SIZE = 0.7;

/** Ab diesem Anteil der Note schließt sich der Mund, und um so viel. */
const CLOSING_FROM = 2 / 3;
const CLOSING_AMOUNT = 0.35;

/** Wie stark der Mund je Cent Vibrato zittert. */
const WIGGLE_PER_CENT = 0.0025;

/** Wie schnell das Nicken am Wortanfang abklingt. Nach drei Zeitkonstanten ist es vorbei. */
const NOD_DECAY_SECONDS = 0.04;

/** Der geschlossene Mund in einer kurzen Pause. */
const CLOSED: MouthFrame = { shape: "m", width: 1, height: 1, nod: 0 };

/** Die Größe, `time` Sekunden nach dem Beginn der Note: erst zu klein, dann kurz zu groß. */
function springAt(time: number) {
  const { startBelow, decaySeconds, speed } = SPRING;
  return 1 - startBelow * Math.exp(-time / decaySeconds) * Math.cos(time * speed);
}

/** Wie weit sich der Mund zum Ende der Note schon geschlossen hat. */
function closingAt(share: number) {
  return (CLOSING_AMOUNT * Math.max(0, share - CLOSING_FROM)) / (1 - CLOSING_FROM);
}

/** Der Mund während einer Note, `time` Sekunden nach ihrem Beginn. */
function singing(note: VoiceNote, time: number): MouthFrame {
  const size = (QUIETEST_SIZE + (1 - QUIETEST_SIZE) * note.gain) * springAt(time);
  const wiggle = (note.shake ?? 0) * WIGGLE_PER_CENT * Math.sin(time * 2 * Math.PI * VIBRATO_HZ);
  return {
    // Nur harte Konsonanten schließen ihn: `hiss` steht auch für h, w, f und v, das flackerte nur.
    shape: note.onset === "tick" && time < TICK_SECONDS ? "m" : note.vowel,
    width: size * (1 - wiggle),
    height: size * (1 + wiggle) * (1 - closingAt(time / note.duration)),
    nod: note.gain >= 1 ? Math.exp(-time / NOD_DECAY_SECONDS) : 0,
  };
}

/** Der Mund in der Lücke vor `note`. `previous` fehlt vor der ersten Note. */
function waiting(note: VoiceNote, previous?: VoiceNote): MouthFrame | undefined {
  if (!previous) return undefined;
  const gap = note.at - previous.at - previous.duration;
  if (gap < JOIN_GAP_SECONDS) return singing(note, 0);
  return gap <= CLOSED_GAP_SECONDS ? CLOSED : undefined;
}

/**
 * Was der Mund `elapsed` Sekunden nach dem Anfang eines Lauts zeigt.
 *
 * @returns Ohne Wert lächelt das Jelly: vor der ersten und nach der letzten Note, in langer Stille.
 */
export function mouthAt(notes: VoiceNote[], elapsed: number): MouthFrame | undefined {
  const index = notes.findIndex((item) => elapsed < item.at + item.duration);
  const note = notes[index];
  if (!note) return undefined;
  return elapsed < note.at ? waiting(note, notes[index - 1]) : singing(note, elapsed - note.at);
}

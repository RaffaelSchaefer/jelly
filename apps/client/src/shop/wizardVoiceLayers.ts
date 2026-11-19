/**
 * Was die Stimme des Zauberers alt macht, neben ihrer Klangfarbe (`WIZARD_TIMBRE`): eine Brust eine
 * Oktave tiefer, ein Knarren auf der letzten Silbe und hörbare Luft. Die Schichten laufen parallel
 * zur Stimme in denselben Ausgang und stoppen mit ihrer Phrase. Brust und Luft folgen der Hüllkurve
 * der Stimme (`voiceLevel` der Klangfarbe), ihre Pegel gelten relativ dazu.
 *
 * @module
 */

import type { VoiceNote } from "../pet/voice";

import {
  scheduleEnvelope,
  schedulePitch,
  startNoise,
  type PhraseSetup,
  type VoiceLayers,
} from "../voice";

/** Die Brust: ein Sinus eine Oktave unter der Stimme, gedämpft unter 400 Hz. */
const CHEST = { level: 0.16, cutoff: 400 } as const;

/**
 * Das Knarren („hmmm“) auf der letzten Silbe, ab ihrer Mitte: ein tiefer Sägezahn durch einen
 * weichen Bandpass.
 */
const CREAK = { hz: 52, band: 600, q: 1.5, level: 0.08, from: 0.5 } as const;

/** Die Luft: Rauschen über 3,5 kHz im Takt der Silben. */
const AIR = { cutoff: 3500, level: 0.035 } as const;

/** Die Brust folgt der Melodie eine Oktave tiefer. */
function chest({ context, notes, start, timbre }: PhraseSetup, output: AudioNode) {
  const tone = context.createOscillator();
  tone.type = "sine";
  const low = notes.map((note) => ({ ...note, from: note.from / 2, to: note.to / 2 }));
  schedulePitch(tone.frequency, low, start);
  const envelope = context.createGain();
  scheduleEnvelope(envelope.gain, notes, start, CHEST.level * timbre.voiceLevel);
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = CHEST.cutoff;
  tone.connect(envelope).connect(filter).connect(output);
  tone.start(start);
  return tone;
}

/** Wie das Knarren auf der letzten Note ein- und ausschwingt. */
function creakEnvelope(gain: AudioParam, last: VoiceNote, start: number) {
  const from = start + last.at + last.duration * CREAK.from;
  const end = start + last.at + last.duration;
  gain.setValueAtTime(0, start);
  gain.setValueAtTime(0, from);
  gain.linearRampToValueAtTime(CREAK.level * last.gain, from + (end - from) * 0.4);
  gain.linearRampToValueAtTime(0, end);
}

/** Das Knarren auf der letzten Note. */
function creak({ context, notes, start }: PhraseSetup, output: AudioNode) {
  const last = notes.at(-1);
  if (!last) return [];
  const saw = context.createOscillator();
  saw.type = "sawtooth";
  saw.frequency.value = CREAK.hz;
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = CREAK.band;
  band.Q.value = CREAK.q;
  const gain = context.createGain();
  creakEnvelope(gain.gain, last, start);
  saw.connect(band).connect(gain).connect(output);
  saw.start(start);
  return [saw];
}

/** Hörbare Luft zu jeder Silbe. */
function air({ context, notes, start, timbre }: PhraseSetup, output: AudioNode) {
  const noise = startNoise(context, start);
  const filter = context.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = AIR.cutoff;
  const envelope = context.createGain();
  scheduleEnvelope(envelope.gain, notes, start, AIR.level * timbre.voiceLevel);
  noise.connect(filter).connect(envelope).connect(output);
  return noise;
}

/** Die Schichten seiner Stimme, für `createVoice({ layers })` und `phrasePlayer`. */
export const wizardVoiceLayers: VoiceLayers = (setup, output) => [
  chest(setup, output),
  ...creak(setup, output),
  air(setup, output),
];

/**
 * Der Hall des Zauberladens: ein kleiner Holzraum, als Impulsantwort gerechnet statt aufgenommen.
 * Er klingt 1,1 s nach (RT60 0,85 s), das Holz schluckt mit der Zeit die Höhen, und sechs frühe
 * Reflexionen geben ihm Wände. Der rechte Kanal hört sie 1,3 ms später, das macht ihn breit.
 *
 * @module
 */

import { dbToGain, REVERB_RETURN_DB } from "../../pet/shopMix";
import { createShopRng } from "../../pet/shopScore";

/** Länge der Impulsantwort in Sekunden. */
const LENGTH = 1.1;

/** Nach so vielen Sekunden ist der Hall um 60 dB leiser. */
const RT60 = 0.85;

/** Der Nachhall beginnt erst nach dieser Zeit. */
const PRE_DELAY = 0.009;

/** Frühe Reflexionen: Zeit in Sekunden und Stärke. */
const REFLECTIONS = [
  [0.007, 0.5],
  [0.011, 0.4],
  [0.017, 0.33],
  [0.023, 0.28],
  [0.031, 0.22],
  [0.041, 0.18],
] as const;

/** So viel später hört der rechte Kanal die Reflexionen. */
const RIGHT_SHIFT = 0.0013;

/** Holz schluckt Höhen: Die Grenze des Tiefpasses fällt von 8,1 kHz auf 1,1 kHz. */
function cutoff(time: number) {
  return 1100 + 7000 * Math.exp(-time / 0.35);
}

/** Die Nachhallfahne eines Kanals: Rauschen, das abklingt und dabei dunkler wird. */
function fillTail(data: Float32Array, rate: number, seed: number) {
  const rng = createShopRng(seed);
  const fall = Math.exp(-6.908 / (RT60 * rate));
  let level = 1;
  let low = 0;
  for (let index = Math.round(PRE_DELAY * rate); index < data.length; index++) {
    const pole = Math.exp((-2 * Math.PI * cutoff(index / rate)) / rate);
    low = (1 - pole) * (rng() * 2 - 1) + pole * low;
    data[index] = low * level;
    level *= fall;
  }
}

/** Setzt die frühen Reflexionen in einen Kanal. */
function addReflections(data: Float32Array, rate: number, shift: number) {
  for (const [time, gain] of REFLECTIONS) {
    const index = Math.round((time + shift) * rate);
    if (index < data.length) data[index] = (data[index] ?? 0) + gain;
  }
}

/** Die Impulsantwort des Holzraums, stereo, mit festem Startwert. */
export function roomImpulse(context: BaseAudioContext) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(2, Math.round(LENGTH * rate), rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    fillTail(data, rate, 31 + channel);
    addReflections(data, rate, channel * RIGHT_SHIFT);
  }
  return buffer;
}

/** Der Hall als Baustein: Eingang für die Anteile der Busse, Ausgang mit {@link REVERB_RETURN_DB}. */
export function createRoom(context: BaseAudioContext) {
  const convolver = context.createConvolver();
  convolver.buffer = roomImpulse(context);
  const output = context.createGain();
  output.gain.value = dbToGain(REVERB_RETURN_DB);
  convolver.connect(output);
  return { input: convolver as AudioNode, output: output as AudioNode };
}

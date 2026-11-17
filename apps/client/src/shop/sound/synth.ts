/**
 * Die Klangbausteine des Zauberladens, ganz ohne Samples: Glocke, Münze, Harfe, Rauschstoß,
 * Pergament-Körner, dumpfer Schlag, Klopfen und gleitende Töne. Jeder Baustein nimmt einen Kontext
 * und einen Ausgang und plant ab einer Zeit, deshalb lässt er sich auch offline rendern. Er liefert
 * die Quellen, die er gestartet hat.
 *
 * Rauschen und der Klang einer Münze werden je Kontext einmal gerechnet, mit festem Startwert.
 *
 * @module
 */

import { between, COIN_PARTIALS, createShopRng, type ShopRng } from "../../pet/shopScore";

/** Die gestarteten Quellen eines Bausteins. */
export type Sources = AudioScheduledSourceNode[];

/** Rauschen und Münze eines Kontexts. */
interface Bank {
  white: AudioBuffer;
  brown: AudioBuffer;
  coin: AudioBuffer | null;
}

/** Je Kontext nur einmal gerechnet. */
const BANKS = new WeakMap<BaseAudioContext, Bank>();

/** Fester Startwert: Offline klingt dasselbe Rauschen jedes Mal gleich. */
const NOISE_SEED = 1;

/** Grundhöhe der gerechneten Münze. Andere Höhen spielt die Abspielrate. */
export const COIN_BASE_HZ = 2500;

/** So viel höher spielt eine Münze höchstens. Teiltöne darüber fallen schon beim Rechnen weg. */
const COIN_MAX_RATE = 1.6;

/** Zwei Sekunden weißes Rauschen. */
function whiteNoise(context: BaseAudioContext) {
  const rng = createShopRng(NOISE_SEED);
  const buffer = context.createBuffer(1, 2 * context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index++) data[index] = rng() * 2 - 1;
  return buffer;
}

/** Vier Sekunden braunes Rauschen, dessen Ende wieder beim Anfang liegt: Die Schleife knackt nicht. */
function brownNoise(context: BaseAudioContext) {
  const rng = createShopRng(NOISE_SEED + 1);
  const buffer = context.createBuffer(1, 4 * context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  let level = 0;
  for (let index = 0; index < data.length; index++) {
    level = (level + 0.02 * (rng() * 2 - 1)) / 1.02;
    data[index] = level * 3.5;
  }
  const drift = ((data[data.length - 1] ?? 0) - (data[0] ?? 0)) / (data.length - 1);
  for (let index = 0; index < data.length; index++) data[index] -= drift * index;
  return buffer;
}

/** Ein abklingender Teilton als Resonator gerechnet, schneller als `Math.sin` je Sample. */
function addMode(
  data: Float32Array,
  rate: number,
  mode: { hz: number; gain: number; decay: number },
) {
  const radius = Math.exp(-1 / (mode.decay * rate));
  const step = (2 * Math.PI * mode.hz) / rate;
  const factor = 2 * radius * Math.cos(step);
  let before = 0;
  let current = mode.gain * radius * Math.sin(step);
  for (let index = 1; index < data.length; index++) {
    data[index] += current;
    const next = factor * current - radius * radius * before;
    before = current;
    current = next;
  }
}

/** Der Anschlag: 3 ms hochpassgefiltertes Rauschen. */
function addStrike(data: Float32Array, rate: number) {
  const rng = createShopRng(NOISE_SEED + 2);
  const length = Math.round(0.003 * rate);
  let previous = 0;
  for (let index = 0; index < length; index++) {
    const noise = rng() * 2 - 1;
    data[index] += 0.35 * (noise - previous) * (1 - index / length);
    previous = noise;
  }
}

/** Bringt die Spitze auf 1 und blendet die letzten 10 % aus. */
function finish(data: Float32Array) {
  const peak = data.reduce((top, value) => Math.max(top, Math.abs(value)), 0) || 1;
  const fade = Math.round(data.length * 0.1);
  for (let index = 0; index < data.length; index++) {
    data[index] = ((data[index] ?? 0) / peak) * Math.min(1, (data.length - index) / fade);
  }
}

/** Eine Münze: fünf unharmonische Teiltöne und ein kurzer Anschlag, 1,2 s lang. */
function coinSound(context: BaseAudioContext) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.round(1.2 * rate), rate);
  const data = buffer.getChannelData(0);
  COIN_PARTIALS.ratios.forEach((ratio, index) => {
    const hz = COIN_BASE_HZ * ratio;
    if (hz * COIN_MAX_RATE > 0.45 * rate) return;
    const gain = COIN_PARTIALS.gains[index] ?? 0;
    addMode(data, rate, { hz, gain, decay: COIN_PARTIALS.decays[index] ?? 0.1 });
  });
  addStrike(data, rate);
  finish(data);
  return buffer;
}

/** Rauschen und Münze dieses Kontexts. */
function bankOf(context: BaseAudioContext) {
  let bank = BANKS.get(context);
  if (!bank) {
    bank = { white: whiteNoise(context), brown: brownNoise(context), coin: null };
    BANKS.set(context, bank);
  }
  return bank;
}

/** Rechnet Rauschen und Münze vorab, damit der erste Kauf nicht stockt. */
export function prepareSynth(context: BaseAudioContext) {
  const bank = bankOf(context);
  bank.coin ??= coinSound(context);
}

/** Rauschen als Schleife, ab einer Stelle `offset` von 0 bis 1. */
export function noiseSource(context: BaseAudioContext, kind: "white" | "brown") {
  const source = context.createBufferSource();
  source.buffer = bankOf(context)[kind];
  source.loop = true;
  return source;
}

/** Startet Rauschen ab `offset` (0 bis 1 seiner Länge) und stoppt es bei `end`. */
function startNoise(source: AudioBufferSourceNode, at: number, end: number, offset = 0) {
  source.start(at, (offset % 1) * (source.buffer?.duration ?? 0));
  source.stop(end);
  return [source];
}

/** Startet alle Quellen bei `at` und stoppt sie bei `end`. */
export function startAll(sources: Sources, at: number, end: number) {
  for (const source of sources) {
    source.start(at);
    source.stop(end);
  }
  return sources;
}

/** Ein Oszillator in fester Höhe. */
export function oscillator(context: BaseAudioContext, type: OscillatorType, hz: number) {
  const node = context.createOscillator();
  node.type = type;
  node.frequency.value = hz;
  return node;
}

/** Eine feste Verstärkung. */
export function gainNode(context: BaseAudioContext, gain: number) {
  const node = context.createGain();
  node.gain.value = gain;
  return node;
}

/** Ein fester Platz im Stereobild. Ohne StereoPanner (altes WebKitGTK) bleibt es eine Verstärkung. */
export function createPan(context: BaseAudioContext, pan: number): AudioNode {
  if (typeof context.createStereoPanner !== "function") return context.createGain();
  const panner = context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  return panner;
}

/** Ein Platz, der von `from` nach `to` wandert, zwischen `at` und `until`. */
export function createSweepPan(context: BaseAudioContext, from: number, to: number, span: Span) {
  if (typeof context.createStereoPanner !== "function") return context.createGain();
  const panner = context.createStereoPanner();
  panner.pan.setValueAtTime(from, span.at);
  panner.pan.linearRampToValueAtTime(to, span.until);
  return panner;
}

/** Ein Zeitraum auf der Kontext-Uhr. */
export interface Span {
  at: number;
  until: number;
}

/** Eine Hüllkurve: linear hinauf in `attack`, dann Abklingen mit `tau`. */
export interface Envelope {
  at: number;
  gain: number;
  attack: number;
  tau: number;
}

/** Plant eine Hüllkurve. Liefert, wann sie unter −60 dB liegt. */
export function envelope(param: AudioParam, shape: Envelope) {
  param.setValueAtTime(0, shape.at);
  param.linearRampToValueAtTime(shape.gain, shape.at + shape.attack);
  param.setTargetAtTime(0, shape.at + shape.attack, shape.tau);
  return shape.at + shape.attack + shape.tau * 6.9;
}

/** Eine Glocke: Beginn, Ton, Spitze und ein Faktor auf die natürliche Abklingzeit. */
export interface BellSpec {
  at: number;
  hz: number;
  gain: number;
  decay?: number;
}

/** Die Modulation einer Glocke: hell im Anschlag, dann weich. Hohe Glocken bleiben sanfter. */
function modulate(context: BaseAudioContext, carrier: OscillatorNode, spec: BellSpec) {
  const modulator = oscillator(context, "sine", spec.hz * 3.5);
  const depth = context.createGain();
  const index = 2.2 * Math.min(1, 1500 / spec.hz) * spec.hz * 3.5;
  depth.gain.setValueAtTime(index, spec.at);
  depth.gain.setTargetAtTime((index * 0.3) / 2.2, spec.at, 0.08);
  modulator.connect(depth).connect(carrier.frequency);
  return modulator;
}

/** Der Glas-Teilton einer Glocke bei 2,76 f, nur unterhalb der Nyquist-Grenze. */
function glassPartial(context: BaseAudioContext, output: AudioNode, hz: number): Sources {
  if (hz * 2.76 > 0.45 * context.sampleRate) return [];
  const partial = oscillator(context, "sine", hz * 2.76);
  partial.connect(gainNode(context, 0.18)).connect(output);
  return [partial];
}

/** Eine Glocke wie eine Celesta: FM-Sinus, dazu ein Glas-Teilton. */
export function bell(context: BaseAudioContext, output: AudioNode, spec: BellSpec): Sources {
  const tau = 0.35 * (880 / spec.hz) ** 0.3 * (spec.decay ?? 1);
  const shape = context.createGain();
  const end = envelope(shape.gain, { at: spec.at, gain: spec.gain, attack: 0.002, tau });
  shape.connect(output);
  const carrier = oscillator(context, "sine", spec.hz);
  carrier.connect(shape);
  const sources = [
    carrier,
    modulate(context, carrier, spec),
    ...glassPartial(context, shape, spec.hz),
  ];
  return startAll(sources, spec.at, end);
}

/** Eine Harfe: Sägezahn durch einen schnell schließenden Tiefpass, dazu die Oktave als Sinus. */
export function pluck(context: BaseAudioContext, output: AudioNode, spec: BellSpec): Sources {
  const shape = context.createGain();
  const end = envelope(shape.gain, { at: spec.at, gain: spec.gain, attack: 0.002, tau: 0.2 });
  shape.connect(output);
  const filter = context.createBiquadFilter();
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(4 * spec.hz, spec.at);
  filter.frequency.setTargetAtTime(1.2 * spec.hz, spec.at, 0.08);
  filter.connect(shape);
  const saw = oscillator(context, "sawtooth", spec.hz);
  saw.connect(filter);
  const octave = oscillator(context, "sine", 2 * spec.hz);
  octave.connect(gainNode(context, 0.12)).connect(shape);
  return startAll([saw, octave], spec.at, end);
}

/** Ein Filter, dessen Frequenz von `from` nach `to` gleitet. */
export interface Sweep {
  filter: BiquadFilterType;
  from: number;
  to?: number;
  /** Wie lange das Gleiten dauert, in Sekunden. */
  sweep?: number;
  q?: number;
}

/** Baut einen gleitenden Filter ab `at`. */
export function sweepFilter(context: BaseAudioContext, at: number, sweep: Sweep) {
  const filter = context.createBiquadFilter();
  filter.type = sweep.filter;
  filter.Q.value = sweep.q ?? 1;
  filter.frequency.setValueAtTime(sweep.from, at);
  if (sweep.to && sweep.to !== sweep.from) {
    filter.frequency.exponentialRampToValueAtTime(sweep.to, at + (sweep.sweep ?? 0.1));
  }
  return filter;
}

/** Ein Rauschstoß durch einen gleitenden Filter. */
export interface BurstSpec extends Envelope, Sweep {
  noise?: "white" | "brown";
  /** Wo im Rauschen er beginnt, 0 bis 1. */
  offset?: number;
  /** Spätestens hier ist er zu Ende. */
  until?: number;
  /** Flattern: Lautstärke schwankt `hz` Mal je Sekunde um den Anteil `depth`. */
  flutter?: { hz: number; depth: number };
}

/** Lässt ein Signal flattern. Liefert den Eingang und die Quelle des Flatterns. */
function flutterOf(context: BaseAudioContext, output: AudioNode, flutter: BurstSpec["flutter"]) {
  if (!flutter) return { input: output, sources: [] as Sources };
  const input = gainNode(context, 1 - flutter.depth / 2);
  const wobble = oscillator(context, "square", flutter.hz);
  wobble.connect(gainNode(context, flutter.depth / 2)).connect(input.gain);
  input.connect(output);
  return { input, sources: [wobble] as Sources };
}

/** Ein Rauschstoß: Rauschen durch einen gleitenden Filter mit eigener Hüllkurve. */
export function burst(context: BaseAudioContext, output: AudioNode, spec: BurstSpec): Sources {
  const shape = context.createGain();
  const end = Math.min(spec.until ?? Infinity, envelope(shape.gain, spec));
  shape.connect(output);
  const flutter = flutterOf(context, shape, spec.flutter);
  const filter = sweepFilter(context, spec.at, spec);
  filter.connect(flutter.input);
  const source = noiseSource(context, spec.noise ?? "white");
  source.connect(filter);
  startAll(flutter.sources, spec.at, end);
  return [...startNoise(source, spec.at, end, spec.offset), ...flutter.sources];
}

/** Viele kleine Rauschkörner wie raschelndes Pergament. */
export interface GrainSpec {
  at: number;
  count: number;
  seconds: number;
  from: number;
  to: number;
  gain: number;
  rng: ShopRng;
  q?: number;
}

/** Pergament: eine Quelle, ein Bandpass, eine Hüllkurve mit einem Anschlag je Korn. */
export function grains(context: BaseAudioContext, output: AudioNode, spec: GrainSpec): Sources {
  const shape = context.createGain();
  shape.gain.setValueAtTime(0, spec.at);
  for (let index = 0; index < spec.count; index++) {
    const at = spec.at + (spec.seconds * (index + spec.rng() * 0.8)) / spec.count;
    shape.gain.setValueAtTime(spec.gain * between(spec.rng, 0.35, 1), at);
    shape.gain.setTargetAtTime(0, at + 0.0005, between(spec.rng, 0.003, 0.009));
  }
  shape.connect(output);
  const sweep = { filter: "bandpass", from: spec.from, to: spec.to, sweep: spec.seconds } as const;
  const filter = sweepFilter(context, spec.at, { ...sweep, q: spec.q ?? 1.2 });
  filter.connect(shape);
  const source = noiseSource(context, "white");
  source.connect(filter);
  return startNoise(source, spec.at, spec.at + spec.seconds + 0.08, spec.rng());
}

/** Ein Ton, der gleiten kann: von `hz` nach `to` in `glide` Sekunden. */
export interface ToneSpec extends Envelope {
  hz: number;
  to?: number;
  glide?: number;
  type?: OscillatorType;
  until?: number;
}

/** Ein einzelner Ton mit Hüllkurve, etwa ein dumpfer Schlag oder ein Seufzer. */
export function tone(context: BaseAudioContext, output: AudioNode, spec: ToneSpec): Sources {
  const shape = context.createGain();
  const end = Math.min(spec.until ?? Infinity, envelope(shape.gain, spec));
  shape.connect(output);
  const node = context.createOscillator();
  node.type = spec.type ?? "sine";
  node.frequency.setValueAtTime(spec.hz, spec.at);
  if (spec.to) node.frequency.exponentialRampToValueAtTime(spec.to, spec.at + (spec.glide ?? 0.1));
  node.connect(shape);
  return startAll([node], spec.at, end);
}

/** Ein dumpfer Schlag: Beginn, Ton von `from` hinab nach `to` in `glide` s, Spitze und Abklingen. */
export interface ThudSpec {
  at: number;
  from: number;
  to: number;
  glide: number;
  gain: number;
  tau: number;
}

/** Ein dumpfer Schlag wie ein Stempel oder ein zuklappendes Buch: ein Sinus, der in die Tiefe fällt. */
export function thud(context: BaseAudioContext, output: AudioNode, spec: ThudSpec): Sources {
  const { at, from, to, glide, gain, tau } = spec;
  return tone(context, output, { at, hz: from, to, glide, gain, attack: 0.003, tau });
}

/** Eine Münze aus dem gerechneten Klang, auf `hz` gestimmt. */
export function clink(context: BaseAudioContext, output: AudioNode, spec: BellSpec): Sources {
  const bank = bankOf(context);
  bank.coin ??= coinSound(context);
  const source = context.createBufferSource();
  source.buffer = bank.coin;
  source.playbackRate.value = Math.min(COIN_MAX_RATE, spec.hz / COIN_BASE_HZ);
  source.connect(gainNode(context, spec.gain)).connect(output);
  source.start(spec.at);
  return [source];
}

/** Klopfen auf Holz: ein kurzer Rauschstoß durch einen Bandpass und ein kurzer Sinus. */
export interface KnockSpec {
  at: number;
  hz: number;
  band: number;
  q: number;
  gain: number;
  /** Länge des Rauschens in Sekunden. */
  noise: number;
  offset?: number;
}

/** Klopft auf Holz. */
export function knock(context: BaseAudioContext, output: AudioNode, spec: KnockSpec): Sources {
  const { at, gain, noise } = spec;
  const shape = { at, gain, attack: 0.0005, tau: noise / 3, until: at + noise };
  const sweep = { filter: "bandpass", from: spec.band, q: spec.q, offset: spec.offset } as const;
  return [
    ...burst(context, output, { ...shape, ...sweep }),
    ...tone(context, output, { at, hz: spec.hz, gain: gain * 0.6, attack: 0.001, tau: 0.022 }),
  ];
}

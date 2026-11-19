/**
 * Das Ambiente des Zauberladens: Raumton, Brummen unter den Dielen, die summende Kugel, das
 * Knistern der Kerze und der Atem ihrer Flamme. Alles läuft dauerhaft und kostet zusammen nur 15
 * Knoten: Brummen und Kugel sind je ein Oszillator mit eingebauten Obertönen, Knistern und Atem
 * teilen sich eine Rauschquelle, und jedes Knistern ist nur Automation.
 *
 * Ein Planer schaut voraus: live alle 200 ms 0,6 s weit, offline einmal für die ganze Dauer. Wann
 * es knistert und wie leise es beim Dösen wird, rechnet `pet/shopAmbience.ts`.
 *
 * @module
 */

import {
  AMBIENCE_GAINS,
  BREATH_WALK,
  createCandleScore,
  DRONE_HZ,
  droneSway,
  moodGain,
  MOOD_TAU,
  ORB_HZ,
  roomCutoff,
  type AmbienceLayer,
  type AmbienceMood,
  type CrackleHit,
  type MoodChange,
} from "../../pet/shopAmbience";
import { createLevel, createSpanLevel, type SpanLevel } from "./mixer";
import { gainNode, noiseSource, oscillator } from "./synth";

/**
 * Gleicht die Schichten an, damit das ganze Ambiente bei voller Lautstärke um −46 dBFS RMS liegt
 * und kein Knistern über −36 dBFS. Gemessen in `scripts/shop-sound-check.html`.
 */
const TRIM: Readonly<Record<AmbienceLayer, number>> = {
  room: 0.3,
  drone: 0.18,
  orb: 0.12,
  crackle: 0.48,
  breath: 2.4,
};

/** In diesen Schritten bekommen Brummen und Raum ihre langsamen Schwankungen geplant. */
const SWAY_STEP = 0.1;

/** Was das Ambiente zum Start braucht. */
export interface AmbienceOptions {
  /** Wohin die Kugel summt, sonst in den gemeinsamen Ausgang. */
  orb?: AudioNode;
  /** Startwert für Knistern und Atem. */
  seed: number;
  /** Wann es beginnt, in Sekunden der Kontext-Uhr. */
  at: number;
  mood: AmbienceMood;
}

/** Das laufende Ambiente. */
export interface Ambience {
  /** Plant voraus bis `time`. Live ruft das ein Takt, offline einmal für die ganze Dauer. */
  scheduleUntil(time: number): void;
  /** Wach oder dösend, mit einem Übergang von rund vier Sekunden. */
  setMood(mood: AmbienceMood): void;
  /** Hebt das Summen der Kugel für eine Weile, in dB. Es gilt das stärkste Anheben. */
  readonly swell: SpanLevel;
  /** Lässt die Kugel schneller schweben, Schwebung in Hertz. Es gilt die schnellste. */
  readonly beat: SpanLevel;
  /** Hält alles bei `at` an. Danach plant es nichts mehr. */
  stop(at: number): void;
}

/** Ein Oszillator mit festen Obertönen, Stärke je Harmonischer ab der ersten. */
function harmonicOscillator(context: BaseAudioContext, hz: number, harmonics: readonly number[]) {
  const imag = Float32Array.from([0, ...harmonics]);
  const constraints = { disableNormalization: true };
  const wave = context.createPeriodicWave(new Float32Array(imag.length), imag, constraints);
  const node = context.createOscillator();
  node.setPeriodicWave(wave);
  node.frequency.value = hz;
  return node;
}

/** Der Raumton: braunes Rauschen, dunkel gefiltert. Der Tiefpass atmet mit dem Planer. */
function createRoomTone(context: BaseAudioContext, output: AudioNode, at: number, seed: number) {
  const source = noiseSource(context, "brown");
  const low = context.createBiquadFilter();
  low.Q.value = 0.5;
  low.frequency.setValueAtTime(roomCutoff(at), at);
  const high = context.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 40;
  const level = gainNode(context, AMBIENCE_GAINS.awake.room * TRIM.room);
  source.connect(low).connect(high).connect(level).connect(output);
  source.start(at, (Math.abs(seed) % 997) / 250);
  return { source, cutoff: low.frequency };
}

/** Das Brummen: D2 mit D3 und A3 als Obertönen, ein Oszillator ohne Filter. */
function createDrone(context: BaseAudioContext, output: AudioNode, at: number) {
  const node = harmonicOscillator(context, DRONE_HZ[0], [0.35, 0.5, 0.146, 0, 0, 0, 0, 0, 0.008]);
  const level = context.createGain();
  level.gain.setValueAtTime(0, at);
  node.connect(level).connect(output);
  node.start(at);
  return { source: node, gain: level.gain };
}

/** Die Kugel: A3 mit leisem E5 und ein Nachbar, der sie schweben lässt. Ein Bandpass wäre nur Pegel. */
function createOrb(context: BaseAudioContext, output: AudioNode, at: number, mood: AmbienceMood) {
  const main = harmonicOscillator(context, ORB_HZ.base, [0.743, 0, 0.045]);
  const neighbour = oscillator(context, "sine", ORB_HZ.base + ORB_HZ.beat);
  const swell = context.createGain();
  const level = context.createGain();
  main.connect(swell);
  neighbour.connect(gainNode(context, 0.743)).connect(swell);
  swell.connect(level).connect(output);
  main.start(at);
  neighbour.start(at);
  const beat = (hz: number) => ORB_HZ.base + Math.max(ORB_HZ.beat, hz);
  return {
    sources: [main, neighbour],
    swell: createSpanLevel(swell.gain, context),
    beat: createSpanLevel(neighbour.frequency, context, beat),
    level: createLevel(level.gain, context, AMBIENCE_GAINS[mood].orb * TRIM.orb),
  };
}

/** Die Kerze: eine Rauschquelle für Knistern und Atem, je ein Bandpass und eine Hüllkurve. */
function createCandle(context: BaseAudioContext, output: AudioNode, at: number) {
  const source = noiseSource(context, "white");
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  const crackle = context.createGain();
  crackle.gain.setValueAtTime(0, at);
  source.connect(filter).connect(crackle).connect(output);
  const flame = context.createBiquadFilter();
  flame.type = "bandpass";
  flame.frequency.value = 330;
  flame.Q.value = 0.9;
  const breath = context.createGain();
  breath.gain.setValueAtTime(0, at);
  source.connect(flame).connect(breath).connect(output);
  source.start(at);
  return { source, filter, crackle: crackle.gain, breath: breath.gain };
}

/** Plant ein Knistern: Filter auf seinen Ton, dann ein Stoß, der schnell abklingt. */
function scheduleHit(candle: ReturnType<typeof createCandle>, hit: CrackleHit, level: number) {
  candle.filter.frequency.setValueAtTime(hit.hz, hit.at);
  candle.filter.Q.setValueAtTime(hit.q, hit.at);
  candle.crackle.setValueAtTime(hit.gain * level, hit.at);
  candle.crackle.setTargetAtTime(0, hit.at + 0.0003, hit.tau);
}

/** Startet das Ambiente. Es braucht keinen Takt: `scheduleUntil` plant, was kommt. */
export function startAmbience(
  context: BaseAudioContext,
  output: AudioNode,
  options: AmbienceOptions,
): Ambience {
  const { at, seed } = options;
  const room = createRoomTone(context, output, at, seed);
  const drone = createDrone(context, output, at);
  const orb = createOrb(context, options.orb ?? output, at, options.mood);
  const candle = createCandle(context, output, at);
  const score = createCandleScore(seed, at);
  const state = {
    until: at,
    mood: options.mood,
    change: { at, from: options.mood, to: options.mood } as MoodChange,
    stopped: false,
  };
  const layer = (name: AmbienceLayer, time: number) =>
    moodGain(name, state.change, time) * TRIM[name];

  /** Brummen und Raum schwanken langsam, geplant in kleinen linearen Schritten. */
  function sway(from: number, until: number) {
    const first = Math.ceil(from / SWAY_STEP + 1e-6) * SWAY_STEP;
    if (from === at) drone.gain.setValueAtTime(layer("drone", at) * droneSway(at), at);
    for (let time = first; time <= until; time += SWAY_STEP) {
      drone.gain.linearRampToValueAtTime(layer("drone", time) * droneSway(time), time);
      room.cutoff.linearRampToValueAtTime(roomCutoff(time), time);
    }
  }

  /** Knistern und Atem der Kerze bis `until`. Was schon vorbei ist, fällt weg. */
  function flicker(now: number, until: number) {
    for (const hit of score.crackles(until, state.mood)) {
      if (hit.at >= now) scheduleHit(candle, hit, layer("crackle", hit.at));
    }
    for (const step of score.breath(until)) {
      const target = step.level * layer("breath", step.at);
      candle.breath.setTargetAtTime(target, Math.max(now, step.at), BREATH_WALK.tau);
    }
  }

  return {
    scheduleUntil(time) {
      if (state.stopped || time <= state.until) return;
      sway(Math.max(state.until, context.currentTime), time);
      flicker(context.currentTime, time);
      state.until = time;
    },
    setMood(mood) {
      if (mood === state.mood) return;
      state.change = { at: Math.max(state.until, context.currentTime), from: state.mood, to: mood };
      state.mood = mood;
      orb.level.glide(AMBIENCE_GAINS[mood].orb * TRIM.orb, MOOD_TAU);
    },
    swell: orb.swell,
    beat: orb.beat,
    stop(time) {
      state.stopped = true;
      for (const source of [room.source, drone.source, ...orb.sources, candle.source]) {
        source.stop(time);
      }
    },
  };
}

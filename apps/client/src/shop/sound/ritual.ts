/**
 * Das Kaufritual und die Momente am Jelly. Beim Kauf klirren Münzen in die Schale, die Ladenglocke
 * klingt, und der Zauber sammelt sich beim Zauberer, saust über die Bühne und zerspringt beim
 * Kunden in Glocken. Dazu der Stempel, die Anprobe, das Anlegen und das Ablegen. Was wann klingt,
 * planen `ritualScore` und die Noten in `pet/shopScore.ts`, hier wird es hörbar.
 *
 * Die Bühne eines Geräuschs (`createStage`) stellt seine Teile an ihre Plätze im Bus und trennt
 * alles wieder, sobald die letzte Quelle verklungen ist.
 *
 * @module
 */

import type { CosmeticSlot } from "../../pet/types";

import { SOUND_PANS } from "../../pet/shopMix";
import {
  EQUIP_BEATS,
  EQUIP_CHORD,
  equipRun,
  GATHER_TONES,
  KNOCK_HZ,
  ownedBells,
  shortScore,
  STAMP_THUDS,
  SUB_BLOOM,
  TAKE_OFF_SCORE,
  TILL_BELL,
  tryOnBells,
  TRY_ON_PEAK,
  type BellNote,
  type CoinHit,
  type RitualScore,
  type ShopRng,
  type TimeSpan,
} from "../../pet/shopScore";
import {
  bell,
  burst,
  clink,
  createPan,
  createSweepPan,
  gainNode,
  grains,
  knock,
  oscillator,
  startAll,
  thud,
  tone,
  type Sources,
} from "./synth";

/** Stellt die Teile eines Geräuschs an ihre Plätze in einem Bus und räumt danach auf. */
export interface Stage {
  /** Ein Ausgang an einem Platz im Stereobild oder durch einen eigenen Panner, `gain` relativ. */
  at(place: number | AudioNode, gain?: number): AudioNode;
  /** Trennt alles, sobald alle `sources` verklungen sind, und ruft dann `done`. */
  release(sources: Sources, done?: () => void): void;
}

/** Eine Bühne im Bus `bus`. `level` gilt für alle ihre Teile. */
export function createStage(context: BaseAudioContext, bus: AudioNode, level = 1): Stage {
  const nodes: AudioNode[] = [];
  return {
    at(place, gain = 1) {
      const input = gainNode(context, level * gain);
      const panner = typeof place === "number" ? createPan(context, place) : place;
      input.connect(panner).connect(bus);
      nodes.push(input, panner);
      return input;
    },
    release(sources, done) {
      let left = sources.length;
      const finish = () => {
        for (const node of nodes) node.disconnect();
        done?.();
      };
      if (left === 0) finish();
      for (const source of sources) {
        source.addEventListener("ended", () => {
          left -= 1;
          if (left === 0) finish();
        });
      }
    },
  };
}

/** Was ein Teil des Rituals zum Spielen braucht. */
export interface RitualRun {
  context: BaseAudioContext;
  stage: Stage;
  /** Zeitpunkt null, in Sekunden der Kontext-Uhr. */
  at: number;
  rng: ShopRng;
}

/** Ein Moment am Jelly: dazu sein Hauptausgang, die Ware und der Hall. */
export interface MomentRun extends RitualRun {
  /** Der Hauptausgang, schon an seinem Platz und auf seinem Pegel. */
  output: AudioNode;
  options: { slot?: CosmeticSlot; price?: number };
  /** Eingang des Halls, für einen größeren Anteil. */
  reverb: AudioNode | null;
}

/** Pegel der Teile des Rituals, gemessen in der Hörprobe gegen `CUE_TARGETS`. */
export const RITUAL_LEVELS = {
  clink: 0.064,
  tock: 0.085,
  till: 0.14,
  gather: 0.095,
  whoosh: 0.16,
  trail: 0.04,
  sparkle: 0.06,
  bloom: 0.2,
} as const;

/** Glocken an ihren eigenen Plätzen, ab dem Zeitpunkt null. */
export function bellsAt(run: RitualRun, notes: readonly BellNote[], level: number): Sources {
  return notes.flatMap((note) =>
    bell(run.context, run.stage.at(note.pan ?? 0, level), { ...note, at: run.at + note.at }),
  );
}

/** Glocken eines Moments: ohne eigenen Platz am Hauptausgang. */
export function bellsOn(run: MomentRun, notes: readonly BellNote[], output = run.output): Sources {
  return notes.flatMap((note) => {
    const target = note.pan === undefined ? output : run.stage.at(note.pan);
    return bell(run.context, target, { ...note, at: run.at + note.at });
  });
}

/** Eine Seite wird umgeschlagen: Rascheln und ein Luftzug. */
export function pageTurn(run: RitualRun, output: AudioNode, gain = 1): Sources {
  const { context, at, rng } = run;
  const air = { at, gain: 0.7 * gain, attack: 0.06, tau: 0.08, offset: rng() };
  return [
    ...grains(context, output, { at, count: 18, seconds: 0.22, from: 3500, to: 2200, gain, rng }),
    ...burst(context, output, { ...air, filter: "lowpass", from: 700 }),
  ];
}

/** Klopfen auf Holz, `delay` Sekunden nach dem Beginn. */
export function woodKnock(run: RitualRun, output: AudioNode, spec: WoodSpec): Sources {
  const shape = { at: run.at + spec.delay, hz: spec.hz, band: spec.band, q: 2, gain: spec.gain };
  return knock(run.context, output, { ...shape, noise: 0.008, offset: run.rng() });
}

/** Ton, Band, Lautstärke und Verzögerung eines Klopfens. */
export interface WoodSpec {
  hz: number;
  band: number;
  gain: number;
  delay: number;
}

/** Ein Münzanschlag in der Schale, beim ersten Aufschlag mit einem kurzen Tock der Theke. */
export function coinHit(run: RitualRun, hit: CoinHit): Sources {
  const at = run.at + hit.at;
  const output = run.stage.at(hit.pan, RITUAL_LEVELS.clink * hit.gain);
  const sources = clink(run.context, output, { at, hz: hit.hz, gain: 1 });
  if (!hit.tock) return sources;
  const tock = { at, hz: KNOCK_HZ.tock, gain: 1, attack: 0.0008, tau: 0.003, until: at + 0.008 };
  return [...sources, ...tone(run.context, run.stage.at(hit.pan, RITUAL_LEVELS.tock), tock)];
}

/** Die Ladenglocke: D6 mit vier Teiltönen, die verschieden lang klingen. */
export function tillBell(run: RitualRun, time: number): Sources {
  const output = run.stage.at(SOUND_PANS.tray, RITUAL_LEVELS.till);
  return TILL_BELL.ratios.flatMap((ratio, index) => {
    const hz = TILL_BELL.hz * ratio;
    if (hz > 0.45 * run.context.sampleRate) return [];
    const gain = TILL_BELL.gains[index] ?? 0;
    const tau = TILL_BELL.decays[index] ?? 0.2;
    return tone(run.context, output, { at: run.at + time, hz, gain, attack: 0.002, tau });
  });
}

/** Ein Zittern von ±20 Cent, siebenmal je Sekunde, für gleitende Töne. */
function vibrato(context: BaseAudioContext, sources: Sources) {
  const wobble = oscillator(context, "sine", 7);
  const depth = gainNode(context, 20);
  wobble.connect(depth);
  for (const source of sources) {
    if (source instanceof OscillatorNode) depth.connect(source.detune);
  }
  return wobble;
}

/** Der Zauber sammelt sich: Rauschen wird heller, zwei Töne gleiten mit Zittern eine Oktave hinauf. */
export function gather(run: RitualRun, span: TimeSpan): Sources {
  const { context } = run;
  const at = run.at + span.from;
  const length = span.to - span.from;
  const output = run.stage.at(SOUND_PANS.wizard, RITUAL_LEVELS.gather);
  const shape = { at, attack: length, tau: 0.08, until: at + length + 0.4 };
  const tones = GATHER_TONES.flatMap(([from, to]) =>
    tone(context, output, { ...shape, gain: 0.45, hz: from, to, glide: length }),
  );
  const sweep = { filter: "bandpass", from: 400, to: 1800, sweep: length, q: 3 } as const;
  const noise = burst(context, output, { ...shape, ...sweep, gain: 1, offset: run.rng() });
  const wobble = vibrato(context, tones);
  return [...noise, ...tones, ...startAll([wobble], at, shape.until)];
}

/** Der Wusch quer über die Bühne, vom Zauberer zum Kunden. */
export function whoosh(run: RitualRun, span: TimeSpan): Sources {
  const at = run.at + span.from;
  const until = run.at + span.to;
  const { wizard, customer } = SOUND_PANS;
  const path = createSweepPan(run.context, wizard, customer, { at, until });
  const output = run.stage.at(path, RITUAL_LEVELS.whoosh);
  const sweep = { filter: "bandpass", from: 1800, to: 650, sweep: 0.44, q: 1.4 } as const;
  const shape = { at, gain: 1, attack: 0.1, tau: (until - at) / 3, until: until + 0.15 };
  return burst(run.context, output, { ...shape, ...sweep, offset: run.rng() });
}

/** Das tiefe Aufblühen: D3 und D2 beim Kunden. */
export function bloom(run: RitualRun, time: number, level: number = RITUAL_LEVELS.bloom): Sources {
  const output = run.stage.at(SOUND_PANS.customer, level);
  const at = run.at + time;
  return SUB_BLOOM.flatMap(({ hz, gain }) =>
    tone(run.context, output, { at, hz, gain, attack: 0.02, tau: 0.25 }),
  );
}

/** Der Einschlag beim Kunden: Glocken aus zwei Oktaven und das tiefe Aufblühen. */
export function impact(run: RitualRun, time: number, sparkle: readonly BellNote[]): Sources {
  return [...bellsAt(run, sparkle, RITUAL_LEVELS.sparkle), ...bloom(run, time)];
}

/** Der Zauber allein: Sammeln, Wusch mit Glocken und Einschlag. */
export function playSpell(run: RitualRun, score: RitualScore): Sources {
  return [
    ...(score.gather ? gather(run, score.gather) : []),
    ...(score.whoosh ? whoosh(run, score.whoosh) : []),
    ...bellsAt(run, score.trail, RITUAL_LEVELS.trail),
    ...impact(run, score.impact, score.sparkle),
  ];
}

/** Das ganze Ritual: Münzen, Ladenglocke und Zauber. */
export function playRitual(run: RitualRun, score: RitualScore): Sources {
  return [
    ...score.hits.flatMap((hit) => coinHit(run, hit)),
    ...tillBell(run, score.till),
    ...playSpell(run, score),
  ];
}

/** Ein Stempel: ein Schlag, der in die Tiefe fällt, Holz und, beim schweren, Wachs. */
export function stamp(run: MomentRun, heavy: boolean): Sources {
  const { context, output, at } = run;
  const [from, to] = heavy ? STAMP_THUDS.heavy : STAMP_THUDS.light;
  const fall = { at, from, to, glide: heavy ? 0.09 : 0.08, gain: 1, tau: heavy ? 0.07 : 0.05 };
  const wood = { at, gain: 0.7, attack: 0.001, tau: 0.004, until: at + 0.012 };
  const parts = [
    ...thud(context, output, fall),
    ...burst(context, output, {
      ...wood,
      filter: "bandpass",
      from: 1100,
      q: 2.5,
      offset: run.rng(),
    }),
  ];
  if (!heavy) return parts;
  const squish = { at: at + 0.008, gain: 0.5, attack: 0.015, tau: 0.06, offset: run.rng() };
  return [
    ...parts,
    ...burst(context, output, { ...wood, gain: 0.8, filter: "bandpass", from: 220, q: 1.4 }),
    ...burst(context, output, { ...squish, filter: "lowpass", from: 1400 }),
  ];
}

/** Der Puff der Anprobe: Rauschen, das hell wird und nach 80 ms am vollsten ist. */
function poof(run: MomentRun, gain = 1): Sources {
  const shape = { at: run.at, gain, attack: TRY_ON_PEAK, tau: 0.09, offset: run.rng() };
  const sweep = { filter: "bandpass", from: 500, to: 2600, sweep: 0.16, q: 1.1 } as const;
  return burst(run.context, run.output, { ...shape, ...sweep });
}

/** Die Anprobe: Puff, Glitzern ab dem Grundton des Platzes und eine Seite am Siegel. */
export function tryOn(run: MomentRun): Sources {
  const { slot = "head", price = 1 } = run.options;
  const seal = run.stage.at(SOUND_PANS.seal, 0.5);
  return [...poof(run), ...bellsOn(run, tryOnBells(slot, price)), ...pageTurn(run, seal)];
}

/** Zu teuer: Puff, zwei Glocken, ein Seufzer, Klopfen am Siegel und ein leerer Beutel. */
export function short(run: MomentRun): Sources {
  const { context, at } = run;
  const score = shortScore(run.options.slot ?? "head");
  const { sigh } = score;
  const purse = run.stage.at(SOUND_PANS.purse, 0.5);
  const seal = run.stage.at(SOUND_PANS.seal, 0.8);
  const fall = { at: at + sigh.at, hz: sigh.hz, to: sigh.hz * sigh.to, glide: sigh.seconds };
  return [
    ...poof(run, 0.8),
    ...bellsOn(run, score.bells),
    ...tone(context, run.output, { ...fall, gain: 0.35, attack: 0.02, tau: 0.12 }),
    ...woodKnock(run, seal, { hz: KNOCK_HZ.tok, band: 700, gain: 1, delay: score.knockAt }),
    ...score.clinks.flatMap((time, index) =>
      clink(context, purse, { at: at + time, hz: 2000 - index * 150, gain: 1 - index * 0.3 }),
    ),
  ];
}

/** Schon im Besitz: ein kleiner Puff und zwei tiefe, kurze Glocken. */
export function owned(run: MomentRun): Sources {
  return [...poof(run, 0.7), ...bellsOn(run, ownedBells(run.options.slot ?? "head"))];
}

/** Der Akkord beim Anlegen: drei Sägezähne, deren Filter bis zum Höhepunkt aufgeht. */
function glowChord(run: MomentRun): Sources {
  const { context, at } = run;
  const { peak, end } = EQUIP_BEATS;
  const filter = context.createBiquadFilter();
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(500, at);
  filter.frequency.exponentialRampToValueAtTime(3200, at + peak);
  filter.frequency.exponentialRampToValueAtTime(1200, at + end);
  const shape = context.createGain();
  shape.gain.setValueAtTime(0, at);
  shape.gain.linearRampToValueAtTime(0.7, at + 0.12);
  shape.gain.linearRampToValueAtTime(1, at + peak);
  shape.gain.linearRampToValueAtTime(1, at + 0.75);
  shape.gain.setTargetAtTime(0, at + 0.75, 0.25);
  filter.connect(shape).connect(run.output);
  const saws = EQUIP_CHORD.map((hz, index) => {
    const saw = oscillator(context, "sawtooth", hz);
    saw.detune.value = [-6, 6, -3][index] ?? 0;
    saw.connect(gainNode(context, 0.18)).connect(filter);
    return saw;
  });
  return startAll(saws, at, at + 0.75 + 0.25 * 6.9);
}

/** Anlegen: ein Lauf hinauf, der Akkord blüht auf, unten der tiefe Nachklang, mehr Hall. */
export function equip(run: MomentRun): Sources {
  if (run.reverb) run.output.connect(gainNode(run.context, 0.11)).connect(run.reverb);
  return [...bellsOn(run, equipRun()), ...glowChord(run), ...bloom(run, EQUIP_BEATS.peak, 0.6)];
}

/** Ablegen: ein Wusch nach rechts hinaus, dort ein Plopp und eine leise Glocke. */
export function takeOff(run: MomentRun): Sources {
  const { context, at } = run;
  const { seconds, popAt, popFrom, popTo, panTo } = TAKE_OFF_SCORE;
  const path = createSweepPan(context, SOUND_PANS.customer, panTo, { at, until: at + seconds });
  const away = run.stage.at(panTo);
  const air = { at, gain: 1, attack: 0.12, tau: 0.1, until: at + seconds + 0.2, offset: run.rng() };
  const sweep = { filter: "bandpass", from: 2600, to: 320, sweep: seconds, q: 1.6 } as const;
  const pop = { at: at + popAt, hz: popFrom, to: popTo, glide: 0.04, attack: 0.002, tau: 0.03 };
  return [
    ...burst(context, run.stage.at(path), { ...air, ...sweep }),
    ...tone(context, away, { ...pop, gain: 0.6 }),
    ...bell(context, away, { at: at + popAt, hz: TAKE_OFF_SCORE.bell, gain: 0.35, decay: 0.6 }),
  ];
}

/**
 * Die Rezepte des Zauberladens: aus welchen Bausteinen jedes Geräusch besteht, wo es steht, in
 * welchem Bus es läuft und wie laut es ist. Hier stehen die Geräusche der Oberfläche und des
 * Zauberers, die Momente am Jelly und das Kaufritual in `ritual.ts`. Die Noten kommen aus
 * `pet/shopScore.ts`. Jedes Rezept plant ab einer Zeit in einen Bus, deshalb rendert die Hörprobe
 * sie offline.
 *
 * @module
 */

import type { SoundBus, SoundPlace } from "../../pet/shopMix";

import { SOUND_PANS } from "../../pet/shopMix";
import {
  coinHz,
  COIN_GAIN_BELL,
  cueJitter,
  FIZZLE_BELLS,
  GLINT_BELLS,
  harpHz,
  HAT_TIP_BELLS,
  KNOCK_HZ,
  ORB_CHIME,
  SHIMMER_BELLS,
  sparkleBells,
  trailBells,
  WAX_TONES,
  type CueJitter,
  type ShopCue,
  type ShopRng,
  type ShopSfx,
} from "../../pet/shopScore";
import {
  bellsAt,
  bellsOn,
  coinHit,
  createStage,
  equip,
  impact,
  owned,
  pageTurn,
  RITUAL_LEVELS,
  short,
  stamp,
  takeOff,
  tillBell,
  tryOn,
  whoosh,
  woodKnock,
  type MomentRun,
} from "./ritual";
import { bell, burst, clink, grains, knock, pluck, thud, tone, type Sources } from "./synth";

/** Was ein Geräusch genauer bestimmt. */
export interface CueOptions {
  /** Wo es steht, sonst an seinem eigenen Platz. */
  place?: SoundPlace;
  /** Zeile der Harfe unter dem Zeiger, ab 0. */
  step?: number;
  /** Preis der Ware: Teure Waren glitzern länger. */
  price?: number;
  /** Platz der Ware am Jelly, er wählt den Grundton der Anprobe. */
  slot?: MomentRun["options"]["slot"];
  /** Harfe, Wachs oder Münze unter dem Zeiger, zu teuer oder schon im Besitz bei der Anprobe. */
  variant?: "harp" | "wax" | "coin" | "short" | "owned";
  /** Stärke von 0 bis 1, etwa beim Rascheln. */
  intensity?: number;
  /** Verzögerung ab jetzt in Millisekunden. */
  delayMs?: number;
}

/** Alle Rezepte: die Geräusche des Ladens, Spielarten unter dem Zeiger und Teile des Rituals. */
export type CueName =
  | ShopCue
  | "hoverWax"
  | "hoverCoin"
  | "clink"
  | "till"
  | "orbHum"
  | "spellBurst"
  | "whoosh"
  | "impact";

/** Wie ein Rezept gespielt wird. */
export interface CueRun extends MomentRun {
  options: CueOptions;
  jitter: CueJitter;
}

/** Ein Rezept. */
interface Recipe {
  bus: SoundBus;
  /** Wo es steht. `pointer` folgt dem letzten Klick. */
  place: SoundPlace | "pointer";
  /** Pegel, gemessen in der Hörprobe gegen `CUE_TARGETS`. */
  level: number;
  /** Ob der Beginn leicht schwanken darf. Momente mit Bild bleiben genau. */
  loose: boolean;
  play(run: CueRun): Sources;
}

/** Ein Rezept der Oberfläche: leiser Bus, Beginn darf schwanken. */
function ui(place: Recipe["place"], level: number, play: Recipe["play"]): Recipe {
  return { bus: "ui", place, level, loose: true, play };
}

/** Ein Rezept der Effekte: im Takt der Bilder, ohne Schwanken. */
function sfx(place: SoundPlace, level: number, play: Recipe["play"]): Recipe {
  return { bus: "sfx", place, level, loose: false, play };
}

/** Holz unter dem Finger: kurzes Klopfen auf D5. */
function tap(run: CueRun): Sources {
  const spec = { at: run.at, hz: KNOCK_HZ.tap, band: 1900 * run.jitter.filter, q: 2.5 };
  return knock(run.context, run.output, { ...spec, gain: 1, noise: 0.005, offset: run.rng() });
}

/** Pergament: Körner, deren Mitte von `from` nach `to` wandert. */
function page(run: CueRun, from: number, to: number): Sources {
  const { filter } = run.jitter;
  const spec = { at: run.at, count: 22, seconds: 0.3, gain: 1, rng: run.rng };
  return grains(run.context, run.output, { ...spec, from: from * filter, to: to * filter });
}

/** Das Buch geht zu: Rascheln zurück und ein dumpfer Schlag. */
function pageClose(run: CueRun): Sources {
  const from = KNOCK_HZ.thump;
  const shape = { at: run.at + 0.24, from, to: from * 0.8, glide: 0.06, gain: 0.5, tau: 0.05 };
  return [...page(run, 4500, 2000), ...thud(run.context, run.output, shape)];
}

/** Gesperrt: Tok-Tok und ein leerer Beutel. */
function blocked(run: CueRun): Sources {
  const purse = run.stage.at(SOUND_PANS.purse, 0.4);
  return [
    ...woodKnock(run, run.output, { hz: KNOCK_HZ.tok, band: 900, gain: 1, delay: 0 }),
    ...woodKnock(run, run.output, { hz: KNOCK_HZ.tik, band: 800, gain: 0.85, delay: 0.085 }),
    ...clink(run.context, purse, { at: run.at + 0.17, hz: 1900, gain: 1 }),
    ...clink(run.context, purse, { at: run.at + 0.235, hz: 2050, gain: 0.7 }),
  ];
}

/** Ein Riegel aus Messing: zwei Klicks, 28 ms auseinander. */
function latch(run: CueRun, from: number, to: number): Sources {
  const tick = (at: number, band: number) => {
    const shape = { at, gain: 1, attack: 0.0004, tau: 0.003, until: at + 0.015 };
    return burst(run.context, run.output, { ...shape, filter: "bandpass", from: band, q: 6 });
  };
  return [...tick(run.at, from), ...tick(run.at + 0.028, to)];
}

/** Gelingen: vier Glocken hinauf und ein Hauch darüber. */
function shimmer(run: CueRun): Sources {
  const air = { at: run.at, count: 8, seconds: 0.18, from: 6000, to: 9000, gain: 0.25 };
  return [
    ...bellsOn(run, SHIMMER_BELLS),
    ...grains(run.context, run.output, { ...air, rng: run.rng }),
  ];
}

/** Ein Fehler zischt: zwei stumpfe Glocken und Rauschen, das hinabgleitet. */
function fizzle(run: CueRun): Sources {
  const { context, output, at } = run;
  const hiss = { at, gain: 0.9, attack: 0.012, tau: 0.12, until: at + 0.42, offset: run.rng() };
  const sweep = { filter: "bandpass", from: 2200, to: 400, sweep: 0.32, q: 2 } as const;
  return [
    ...FIZZLE_BELLS.flatMap((hz, index) =>
      bell(context, output, { at: at + index * 0.012, hz, gain: 0.8, decay: 0.58 }),
    ),
    ...burst(context, output, { ...hiss, ...sweep }),
  ];
}

/** Münzen kommen dazu: zwei fallen, dann eine Glocke. */
function coinGain(run: CueRun): Sources {
  const { context, output, at } = run;
  return [
    ...clink(context, output, { at, hz: 2637, gain: 1 }),
    ...clink(context, output, { at: at + 0.07, hz: 2349, gain: 0.8 }),
    ...bellsOn(run, [COIN_GAIN_BELL]),
  ];
}

/** Die Harfe unter dem Zeiger, eine Stufe je Zeile. */
function harp(run: CueRun): Sources {
  const hz = harpHz(run.options.step ?? 0);
  return pluck(run.context, run.output, { at: run.at, hz, gain: 1 });
}

/** Wachs unter dem Zeiger: zwei weiche Dreiecke unter einem Tiefpass. */
function wax(run: CueRun): Sources {
  const filter = run.context.createBiquadFilter();
  filter.frequency.value = 520;
  filter.connect(run.output);
  const shape = { at: run.at, gain: 0.5, attack: 0.04, tau: 0.18, type: "triangle" } as const;
  return WAX_TONES.flatMap((hz) => tone(run.context, filter, { ...shape, hz }));
}

/** Rascheln beim Scrollen, länger und dichter mit mehr Weg. */
function rustle(run: CueRun): Sources {
  const strength = Math.max(0, Math.min(1, run.options.intensity ?? 1));
  const { filter } = run.jitter;
  const band = { from: 2600 * filter, to: 4800 * filter };
  const spec = {
    at: run.at,
    count: Math.round(8 + 24 * strength),
    seconds: 0.16 + 0.14 * strength,
  };
  return grains(run.context, run.output, {
    ...spec,
    ...band,
    gain: 0.4 + 0.6 * strength,
    rng: run.rng,
  });
}

/** Ein Schnauben beim Aufwachen: Rauschen, das 40 Mal je Sekunde flattert. */
function snort(run: CueRun): Sources {
  const shape = { at: run.at, gain: 1, attack: 0.012, tau: 0.03, until: run.at + 0.12 };
  const sweep = { filter: "bandpass", from: 600, q: 2, offset: run.rng() } as const;
  return burst(run.context, run.output, { ...shape, ...sweep, flutter: { hz: 40, depth: 0.85 } });
}

/** Der Zauber wird geworfen: Wusch vom Zauberer zum Kunden, Glocken folgen ihm. */
function spellBurst(run: CueRun): Sources {
  const trail = bellsAt(run, trailBells(run.rng, 0.6), RITUAL_LEVELS.trail);
  return [...whoosh(run, { from: 0, to: 0.6 }), ...trail];
}

/** Eine Münze fällt in die Schale und springt nach. */
function coinClink(run: CueRun): Sources {
  const hz = coinHz(run.rng);
  const pan = SOUND_PANS[run.options.place ?? "tray"];
  return [
    ...coinHit(run, { at: 0, hz, gain: 1, pan, tock: true }),
    ...coinHit(run, { at: 0.052, hz: hz * 1.004, gain: 0.45, pan, tock: false }),
  ];
}

/** Alle Rezepte mit Bus, Platz und Pegel. */
const RECIPES: Readonly<Record<CueName, Recipe>> = {
  tap: ui("pointer", 0.24, tap),
  pageOpen: ui("pointer", 0.36, (run) => page(run, 2000, 4500)),
  pageClose: ui("pointer", 0.36, pageClose),
  pageTurn: ui("pointer", 0.39, (run) => pageTurn(run, run.output)),
  blocked: ui("pointer", 0.28, blocked),
  latchOn: ui("pointer", 0.87, (run) => latch(run, 3100, 3600)),
  latchOff: ui("pointer", 0.87, (run) => latch(run, 3600, 3100)),
  shimmer: ui("pointer", 0.17, shimmer),
  fizzle: ui("pointer", 0.13, fizzle),
  coinGain: ui("pointer", 0.27, coinGain),
  hover: ui("ledger", 0.071, harp),
  hoverWax: ui("seal", 0.054, wax),
  hoverCoin: ui("purse", 0.038, (run) =>
    clink(run.context, run.output, { at: run.at, hz: 3520, gain: 1 }),
  ),
  rustle: ui("ledger", 0.22, rustle),
  tryOn: sfx("customer", 0.084, tryOn),
  short: sfx("customer", 0.095, short),
  owned: sfx("customer", 0.09, owned),
  stamp: sfx("seal", 0.5, (run) => stamp(run, true)),
  stampLight: sfx("seal", 0.31, (run) => stamp(run, false)),
  equip: sfx("customer", 0.098, equip),
  takeOff: sfx("customer", 0.22, takeOff),
  glint: sfx("orb", 0.075, (run) => bellsOn(run, GLINT_BELLS)),
  hatTip: sfx("wizard", 0.034, (run) => bellsOn(run, HAT_TIP_BELLS)),
  snort: sfx("wizard", 0.44, snort),
  clink: sfx("tray", 1, coinClink),
  till: sfx("tray", 1, (run) => tillBell(run, 0)),
  orbHum: sfx("orb", 0.05, (run) => bellsOn(run, ORB_CHIME)),
  spellBurst: sfx("orb", 1, spellBurst),
  whoosh: sfx("wizard", 1, (run) => whoosh(run, { from: 0, to: 0.6 })),
  impact: sfx("customer", 1, (run) => impact(run, 0, sparkleBells(run.rng))),
};

/** Welches Rezept ein Geräusch mit seinen Optionen spielt. */
export function recipeOf(name: ShopCue, options: CueOptions = {}): CueName {
  if (name === "hover" && options.variant === "wax") return "hoverWax";
  if (name === "hover" && options.variant === "coin") return "hoverCoin";
  if (name === "tryOn" && (options.variant === "short" || options.variant === "owned")) {
    return options.variant;
  }
  return name;
}

/** Der Bus eines Rezepts. */
export function busOf(name: CueName): SoundBus {
  return RECIPES[name].bus;
}

/** Was weicht, wenn zu viel klingt: Zeiger und Rascheln. */
export function isDroppable(name: CueName) {
  return name === "hover" || name === "hoverWax" || name === "hoverCoin" || name === "rustle";
}

/**
 * Was der Zauberer auslöst, als Rezept an seinem Platz und in dessen Bus: Seine Seite klingt so
 * leise wie die der Oberfläche, nur weiter links.
 */
export const SFX_CUES: Readonly<Record<ShopSfx, { cue: CueName; place: SoundPlace }>> = {
  orbHum: { cue: "orbHum", place: "orb" },
  spellBurst: { cue: "spellBurst", place: "orb" },
  whoosh: { cue: "whoosh", place: "wizard" },
  impact: { cue: "impact", place: "customer" },
  fizzle: { cue: "fizzle", place: "orb" },
  // Er zählt Münzen in seiner Hand, nicht in der Schale.
  coinClink: { cue: "clink", place: "wizard" },
  pageTurn: { cue: "pageTurn", place: "wizard" },
  hatTip: { cue: "hatTip", place: "wizard" },
  glint: { cue: "glint", place: "orb" },
  snort: { cue: "snort", place: "wizard" },
};

/** Wie ein Rezept gespielt werden soll. */
export interface CueSpec {
  /** Beginn in Sekunden der Kontext-Uhr. */
  at: number;
  rng: ShopRng;
  options?: CueOptions;
  /** Platz des letzten Klicks im Stereobild, für Geräusche der Oberfläche. */
  pointer?: number;
  /** Eingang des Halls, für Rezepte mit größerem Anteil. */
  reverb?: AudioNode | null;
  /** Wie oft dieses Rezept schon klang, für die Reihe der Spielarten. */
  count?: number;
  /** Ruft, wenn alles verklungen und aufgeräumt ist. */
  done?: () => void;
}

/** Wo ein Rezept steht: am gewünschten Platz, am letzten Klick oder an seinem eigenen. */
function panOf(recipe: Recipe, spec: CueSpec) {
  if (spec.options?.place) return SOUND_PANS[spec.options.place];
  return recipe.place === "pointer" ? (spec.pointer ?? 0) : SOUND_PANS[recipe.place];
}

/**
 * Spielt ein Rezept in den Bus `bus`. Geht auch offline.
 *
 * @returns Die Quellen, die es gestartet hat.
 */
export function playCue(context: BaseAudioContext, bus: AudioNode, name: CueName, spec: CueSpec) {
  const recipe = RECIPES[name];
  const jitter = cueJitter(spec.rng, spec.count ?? 0);
  const stage = createStage(context, bus, recipe.level * jitter.gain);
  const run: CueRun = {
    context,
    stage,
    output: stage.at(panOf(recipe, spec)),
    at: spec.at + (recipe.loose ? jitter.delay : 0),
    rng: spec.rng,
    options: spec.options ?? {},
    jitter,
    reverb: spec.reverb ?? null,
  };
  const sources = recipe.play(run);
  stage.release(sources, spec.done);
  return sources;
}

/**
 * Das Licht im Zauberladen als reine Rechnung: zwei flackernde Kerzen, die atmende Kristallkugel,
 * der Runenkreis unter dem Kunden und der Mond als kühler Rand. Dazu, was Anprobe, Siegel, Kauf,
 * Fehlschlag und Dösen daran ändern.
 *
 * `scene/ShopLights.tsx` schreibt die Werte jedes Bild in das Licht der Szene (`@jelly/scene`), die
 * Flammen im DOM folgen `--flicker`. Lagen und Farben kommen aus `shopStage.ts`.
 *
 * @module
 */

import type { PurchaseTimeline } from "./shopTimeline";

import {
  CANDLE,
  flameOf,
  FLOOR_Y,
  ORB,
  OWN_AT,
  TAPER,
  type RuneState,
  type Vec3,
} from "./shopStage";
import { ADORN, purchaseTimeline } from "./shopTimeline";

/** Die Lichter der Szene: Lage, Farbe, Grundstärke und Reichweite. */
export const SHOP_LIGHT_RIG = {
  /** P0, die dicke Kerze am rechten Ende der Theke. */
  candle: { at: flameOf(CANDLE), color: "#ffb15c", intensity: 1.05, range: 3.4 },
  /** P1, die schlanke Kerze links. */
  taper: { at: flameOf(TAPER), color: "#ffb15c", intensity: 0.75, range: 2.2 },
  /** P2, die Kristallkugel: kühl, beim Zaubern violett. */
  orb: { at: ORB.at, color: "#8fd8ff", tint: "#c39bff", range: 2.3 },
  /**
   * P3, der Runenkreis knapp über dem Boden vor dem Kunden. Je heller er leuchtet, desto weißer
   * wird sein Gold ({@link circleWhite}): Reines Gold färbte ein türkises Jelly beim Zauber grün.
   */
  circle: {
    at: [OWN_AT[0], FLOOR_Y + 0.13, OWN_AT[2] + 0.35] as Vec3,
    color: "#ffcf6e",
    bright: "#fff1c2",
    range: 1.5,
  },
  /** Der Mond: Richtung zum Licht hin. */
  rim: { direction: [-0.35, 0.75, -0.56] as Vec3, color: "#7fa6ff" },
  /**
   * Belichtung der Stärken oben und aus {@link shopLighting}, im Browser abgestimmt. Das Licht hellt
   * die Grundfarbe nur auf (`sceneDiffuse` in `@jelly/scene`), so bleiben Hut und Robe des
   * Zauberers mitternachtsblau und weinrot, und die Kerzen wärmen Bart und Kunden sichtbar.
   */
  exposure: { points: 0.85, rim: 0.4 },
} as const;

/** Was im Laden gerade mit dem Licht geschieht. */
export type LightCueKind = "tryOn" | "charge" | "release" | "spell" | "fizzle";

/** Ein Moment fürs Licht, ab `at` (ms auf der Uhr von `performance.now`). */
export interface LightCue {
  kind: LightCueKind;
  at: number;
  /** Der Takt eines Kaufs, für `spell`. Ohne ihn gilt ein Kauf zu drei Münzen. */
  timeline?: PurchaseTimeline;
}

/** Was {@link shopLighting} wissen muss. */
export interface LightInput {
  /** Sekunden der Szenenuhr, für Flackern und Atmen. */
  time: number;
  /** Jetzt, in ms auf derselben Uhr wie `cue.at`. */
  now: number;
  /** Reduzierte Bewegung: Alles steht, nur Zustände wechseln. */
  calm: boolean;
  /** Optimierte Darstellung: Flackern und Atmen stehen, Momente spielen. */
  steady?: boolean;
  dozing: boolean;
  /** Seit wann er döst oder wieder wach ist. Ohne Angabe schon lange. */
  dozeSince?: number;
  cue?: LightCue | null;
  /** Der Moment davor: Lässt man das Siegel los, klingt die Ladung von ihrem Stand ab. */
  previous?: LightCue | null;
  circle?: RuneState;
  /** Seit wann der Runenkreis so leuchtet. */
  circleSince?: number;
}

/** Das Licht eines Bildes. */
export interface ShopLighting {
  /** Flackern der dicken Kerze um 1. Multipliziert ihre Stärke und ist `--flicker` im DOM. */
  candle: number;
  /** Flackern der schlanken Kerze um 1. */
  taper: number;
  /** Stärke der Kugel. */
  orb: number;
  /** Farbe der Kugel von 0 (kühl) bis 1 (violett). */
  orbTint: number;
  /** Stärke des Runenkreises. */
  circle: number;
  /** Wie viel vom eingebauten Studiolicht bleibt. */
  shade: number;
  /** Stärke des Mondrands. */
  rim: number;
}

/** Ruhige Werte, ohne Flackern, Atmen und Moment. */
export const IDLE_LIGHTING: ShopLighting = {
  candle: 1,
  taper: 1,
  orb: 0.45,
  orbTint: 0,
  circle: 0.12,
  shade: 0.82,
  rim: 0.55,
};

/** Grenzen des Flackerns. */
export const FLICKER = { min: 0.78, max: 1.12 } as const;

/** Stärken der Kugel: ruhig, dösend, geladen und beim Losbrechen des Zaubers. */
const ORB_LEVEL = { idle: 0.45, breath: 0.08, dozing: 0.2, charged: 1.4, burst: 2.6 } as const;

/** Wie tief der Raum bei Dösen und Zauberflug abdunkelt. */
const SHADE = { dozing: 0.74, spell: 0.62 } as const;

/** Der Runenkreis je Zustand, beim Zauber zuerst hell und dann abklingend. */
const CIRCLE_LEVEL: Readonly<Record<RuneState, number>> = {
  ruhe: 0.12,
  anprobe: 0.55,
  zauber: 0.55,
  anlegen: 0.55,
};
const CIRCLE_SPELL = { peak: 1.2, decayMs: 1500 } as const;
const CIRCLE_ADORN = 1.4;

/** Ab dieser Stärke wird das Gold des Runenkreises weißer, bei der zweiten ist es ganz weißgolden. */
const CIRCLE_WHITE = { from: 0.3, to: 1.1 } as const;

/** Weicher Übergang von 0 bei `from` zu 1 bei `to`. */
function smoothstep(from: number, to: number, value: number) {
  const x = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return x * x * (3 - 2 * x);
}

/**
 * Wie weit das Licht des Runenkreises bei Stärke `level` von Gold zu Weißgold geht, 0 bis 1. So
 * hellt der Zauber den Kunden auf, ohne seine Farbe zu verschieben.
 */
export function circleWhite(level: number) {
  return smoothstep(CIRCLE_WHITE.from, CIRCLE_WHITE.to, level);
}

/** Ein kurzer Stoß über `length` ms: schnell da, weich vorbei. Sonst 0. */
function gust(t: number, length: number) {
  if (t < 0 || t > length) return 0;
  const attack = length * 0.15;
  return smoothstep(0, attack, t) * (1 - smoothstep(attack, length, t));
}

/** Eine Zahl von 0 bis 1 aus `index` und `seed`, immer dieselbe. */
function hash01(index: number, seed: number) {
  let hash = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed + 1, 0xc2b2ae35);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x27d4eb2f);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

/**
 * Wie tief sich eine Flamme zur Zeit `time` (s) im Luftzug duckt: alle 5,5 bis 8,5 s ein Stoß, der
 * sie 350 ms lang um bis zu 0,12 drückt. Sonst 0.
 */
export function gustDip(time: number, seed: number) {
  const slot = Math.floor(time / 7);
  const start = slot * 7 + 1.5 * hash01(slot, seed);
  const t = time - start;
  return t >= 0 && t <= 0.35 ? 0.12 * Math.sin((Math.PI * t) / 0.35) : 0;
}

/** Das Flackern einer Flamme zur Zeit `time` (s), zwischen 0,78 und 1,12. */
export function flicker(time: number, seed: number) {
  const wave =
    0.055 * Math.sin(7.1 * time + seed) +
    0.035 * Math.sin(12.7 * time + 2.1 * seed) +
    0.025 * Math.sin(19.3 * time + 0.7 * seed);
  return Math.min(FLICKER.max, Math.max(FLICKER.min, 1 + wave - gustDip(time, seed)));
}

/** Was ein Moment am Licht ändert. */
interface CueLight {
  /** So weit ducken sich beide Flammen. */
  dip: number;
  /** Die Kugel statt ihres Grundwerts, `null` lässt ihn. */
  orb: number | null;
  /** Kommt zur Kugel hinzu. */
  orbAdd: number;
  tint: number;
  /** Wie weit der Raum zur Dunkelheit des Zauberflugs sinkt, 0 bis 1. `null` lässt ihn. */
  shade: number | null;
  /** So hell leuchtet der Runenkreis mindestens. */
  circle: number;
}

/** Kein Moment. */
const NO_CUE: CueLight = { dip: 0, orb: null, orbAdd: 0, tint: 0, shade: null, circle: 0 };

/** Die Kugel `t` ms nach Beginn der Ladung. */
function chargeLevel(t: number, idle: number) {
  return idle + (ORB_LEVEL.charged - idle) * smoothstep(0, 400, t);
}

/** Wo die Kugel zu Beginn von `cue` stand: geladen, wenn davor geladen wurde. */
function startLevel(cue: LightCue, previous: LightCue | null | undefined, idle: number) {
  return previous?.kind === "charge" ? chargeLevel(cue.at - previous.at, idle) : idle;
}

/** Der Kaufzauber: Die Kugel sammelt bis `burst`, der Raum dunkelt im Flug, der Kreis glüht. */
function spellLight(t: number, timeline: PurchaseTimeline, start: number, idle: number): CueLight {
  const { burst, impact, settled } = timeline;
  if (t > settled) return NO_CUE;
  const gather = start + (ORB_LEVEL.burst - start) * (Math.max(0, t) / burst) ** 2;
  const fade = idle + (ORB_LEVEL.burst - idle) * (1 - smoothstep(burst, impact, t));
  const flight = smoothstep(burst - 300, burst, t) * (1 - smoothstep(impact, settled, t));
  const afterImpact = t - impact;
  return {
    ...NO_CUE,
    dip: 0.12 * gust(t - burst, 300),
    orb: t < burst ? gather : fade,
    tint: smoothstep(burst - 400, burst, t) * (1 - smoothstep(impact, impact + 800, t)),
    shade: flight > 0 ? flight : null,
    circle:
      afterImpact >= 0
        ? CIRCLE_SPELL.peak * (1 - smoothstep(0, CIRCLE_SPELL.decayMs, afterImpact))
        : 0,
  };
}

/** Ein Zauber, der misslingt: Die Kugel stottert und sinkt, nach 700 ms ist sie wieder ruhig. */
function fizzleLight(t: number, start: number, idle: number): CueLight {
  if (t > 700) return NO_CUE;
  const base = start + (idle - start) * smoothstep(0, 250, t);
  const sputter = 0.5 * (1 - t / 700) * Math.max(0, Math.sin((2 * Math.PI * 9 * t) / 1000));
  return { ...NO_CUE, orb: base * (1 - 0.55 * Math.sin((Math.PI * t) / 700)) + sputter };
}

/** Was der laufende Moment `t` ms nach seinem Beginn am Licht ändert. */
function cueLight(input: LightInput, idle: number): CueLight {
  const { cue, previous, now } = input;
  if (!cue || input.calm) return NO_CUE;
  const t = now - cue.at;
  if (t < 0) return NO_CUE;
  const start = startLevel(cue, previous, idle);
  switch (cue.kind) {
    case "tryOn": {
      const strength = gust(t, 500);
      return { ...NO_CUE, dip: 0.18 * strength, orbAdd: 0.3 * strength };
    }
    case "charge":
      return { ...NO_CUE, orb: chargeLevel(t, idle), tint: 0.35 * smoothstep(0, 400, t) };
    case "release": {
      const left = 1 - smoothstep(0, 300, t);
      const tint =
        previous?.kind === "charge" ? 0.35 * smoothstep(0, 400, cue.at - previous.at) : 0;
      return { ...NO_CUE, orb: idle + (start - idle) * left, tint: tint * left };
    }
    case "spell":
      return spellLight(t, cue.timeline ?? purchaseTimeline(3), start, idle);
    case "fizzle":
      return fizzleLight(t, start, idle);
  }
}

/** Wie tief er döst, 0 wach bis 1 eingenickt, und wie hell die Kugel beim Aufwachen aufglimmt. */
function dozeState({ dozing, dozeSince, now, calm }: LightInput) {
  const since = now - (dozeSince ?? Number.NEGATIVE_INFINITY);
  if (calm) return { amount: dozing ? 1 : 0, wake: 0 };
  if (dozing) return { amount: smoothstep(0, 2000, since), wake: 0 };
  const wake = since >= 0 && since < 700 ? Math.sin((Math.PI * since) / 700) : 0;
  return { amount: 1 - smoothstep(0, 700, since), wake };
}

/** Der Runenkreis: Grundwert seines Zustands, beim Zauber und Anlegen mit Verlauf. */
function circleLevel({ circle = "ruhe", circleSince, now, calm }: LightInput) {
  const base = CIRCLE_LEVEL[circle];
  const t = now - (circleSince ?? Number.NEGATIVE_INFINITY);
  if (circle === "zauber") {
    const left = calm ? 1 : 1 - smoothstep(0, CIRCLE_SPELL.decayMs, t);
    return base + (CIRCLE_SPELL.peak - base) * left;
  }
  if (circle !== "anlegen") return base;
  const swell = calm
    ? 1
    : t < ADORN.peak
      ? smoothstep(0, ADORN.peak, t)
      : 1 - smoothstep(ADORN.peak, ADORN.end, t);
  return base + (CIRCLE_ADORN - base) * swell;
}

/** Das Licht dieses Bildes. Ruhig und optimiert flackert nichts, ruhig spielt auch kein Moment. */
export function shopLighting(input: LightInput): ShopLighting {
  const still = input.calm || Boolean(input.steady);
  const breath = still ? 0 : ORB_LEVEL.breath * Math.sin(2 * Math.PI * 0.35 * input.time);
  const doze = dozeState(input);
  const idle = ORB_LEVEL.idle + breath + (ORB_LEVEL.dozing - ORB_LEVEL.idle) * doze.amount;
  const cue = cueLight(input, idle);
  const restShade = IDLE_LIGHTING.shade + (SHADE.dozing - IDLE_LIGHTING.shade) * doze.amount;
  const orb = (cue.orb ?? idle) + cue.orbAdd + (ORB_LEVEL.charged - ORB_LEVEL.idle) * doze.wake;
  return {
    candle: (still ? 1 : flicker(input.time, 0)) - cue.dip,
    taper: (still ? 1 : flicker(input.time, 2)) - cue.dip,
    orb,
    orbTint: cue.tint,
    circle: Math.max(circleLevel(input), cue.circle),
    shade: cue.shade === null ? restShade : restShade + (SHADE.spell - restShade) * cue.shade,
    rim: IDLE_LIGHTING.rim,
  };
}

/** Größe (Einheiten) und Stärke der Schimmer um Kugel und Flammen. */
export interface ShopGlowLook {
  orbSize: number;
  orbStrength: number;
  /** Stärke des Scheins um die dicke und die schlanke Kerze. */
  candle: number;
  taper: number;
}

/** Die Schimmer zu einem Licht: Geladen wächst der Schein der Kugel von 0,8 auf 1,8 Einheiten. */
export function shopGlows(light: ShopLighting): ShopGlowLook {
  const charge = Math.min(
    1,
    Math.max(0, (light.orb - ORB_LEVEL.idle) / (ORB_LEVEL.charged - ORB_LEVEL.idle)),
  );
  const burst = Math.min(
    1,
    Math.max(0, (light.orb - ORB_LEVEL.charged) / (ORB_LEVEL.burst - ORB_LEVEL.charged)),
  );
  const breathe = light.orb / ORB_LEVEL.idle;
  return {
    orbSize: 0.8 + charge,
    orbStrength: charge > 0 ? 0.35 + 0.55 * charge + 0.3 * burst : 0.35 * Math.max(0, breathe),
    candle: 0.32 * light.candle,
    taper: 0.32 * light.taper,
  };
}

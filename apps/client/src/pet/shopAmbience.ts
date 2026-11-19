/**
 * Das Ambiente des Zauberladens als reine Rechnung: wann die Kerze knistert und knackt, wie die
 * Flamme atmet, wie Brummen und Raum langsam schwanken und wie leise alles wird, wenn der Zauberer
 * döst. Hörbar macht es `src/shop/sound/ambience.ts`.
 *
 * @module
 */

import { between, createShopRng, type ShopRng } from "./shopScore";

/** Ob der Zauberer wach ist oder döst. */
export type AmbienceMood = "awake" | "dozing";

/** Die Schichten des Ambientes: Raum, Brummen, Kugel, Knistern und der Atem der Flamme. */
export type AmbienceLayer = "room" | "drone" | "orb" | "crackle" | "breath";

/** Lautstärke jeder Schicht im Ambiente, wach und dösend. Dösend ist nichts lauter. */
export const AMBIENCE_GAINS: Readonly<
  Record<AmbienceMood, Readonly<Record<AmbienceLayer, number>>>
> = {
  awake: { room: 0.5, drone: 0.3, orb: 0.22, crackle: 0.6, breath: 0.25 },
  dozing: { room: 0.5, drone: 0.24, orb: 0.132, crackle: 0.51, breath: 0.2 },
};

/** Wie oft die Kerze im Mittel knistert, je Sekunde. */
export const CRACKLE_RATE: Readonly<Record<AmbienceMood, number>> = { awake: 2.2, dozing: 1.6 };

/** Zeitkonstante eines Stimmungswechsels in Sekunden: rund vier Sekunden bis zur neuen Stimmung. */
export const MOOD_TAU = 1.3;

/** Das Brummen unter den Dielen: D2, D3 und A3. */
export const DRONE_HZ = [73.42, 146.83, 220] as const;

/**
 * Die Kugel summt auf A3. Ein zweiter Ton `beat` Hertz daneben lässt sie langsam schweben, dazu
 * klingt leise E5.
 */
export const ORB_HZ = { base: 220, beat: 0.45, overtone: 659.25 } as const;

/** Ein Wechsel der Stimmung, Zeit in Sekunden der Kontext-Uhr. */
export interface MoodChange {
  at: number;
  from: AmbienceMood;
  to: AmbienceMood;
}

/**
 * Die Lautstärke einer Schicht zur Zeit `time`: Sie gleitet mit {@link MOOD_TAU} zur neuen
 * Stimmung.
 */
export function moodGain(layer: AmbienceLayer, change: MoodChange, time: number) {
  const from = AMBIENCE_GAINS[change.from][layer];
  const to = AMBIENCE_GAINS[change.to][layer];
  if (time <= change.at) return from;
  return to + (from - to) * Math.exp(-(time - change.at) / MOOD_TAU);
}

/** Das Brummen schwankt langsam um ±12 %, 0,045 Mal je Sekunde. */
export function droneSway(time: number) {
  return 1 + 0.12 * Math.sin(2 * Math.PI * 0.045 * time);
}

/** Der Raum atmet: Die Grenze seines Tiefpasses wandert um 260 Hz, ±60 Hz, 0,06 Mal je Sekunde. */
export function roomCutoff(time: number) {
  return 260 + 60 * Math.sin(2 * Math.PI * 0.06 * time);
}

/** Ein Knistern oder Knacken der Kerze: ein Rauschstoß durch einen Bandpass. Zeiten in Sekunden. */
export interface CrackleHit {
  at: number;
  hz: number;
  q: number;
  /** Spitze von 0 bis 1, meist leise. */
  gain: number;
  /** Zeitkonstante des Abklingens. */
  tau: number;
  /** Ein Nachschlag kurz nach einem Knistern. */
  extra?: true;
  /** Ein seltenes, tieferes Knacken. */
  pop?: true;
}

/** Ein Schritt im Atem der Flamme: Ab `at` gleitet sie zu `level`. */
export interface BreathStep {
  at: number;
  level: number;
}

/** Zwei Anschläge liegen mindestens so weit auseinander, in Sekunden. */
export const CRACKLE_MIN_GAP = 0.006;

/** So oft knackt die Kerze: alle 7 bis 15 s. */
export const POP_GAP = [7, 15] as const;

/** Der Atem der Flamme: alle 0,25 s ein neues Ziel zwischen 0,15 und 0,4, angesteuert mit τ 0,3 s. */
export const BREATH_WALK = { every: 0.25, low: 0.15, high: 0.4, stride: 0.08, tau: 0.3 } as const;

/** So oft folgen einem Knistern ein oder zwei Nachschläge. */
const EXTRA_CHANCE = 0.35;

/** Ein Knistern: hoch und kurz, meist leise. Nachschläge sind etwas leiser. */
function crackle(rng: ShopRng, at: number, extra: boolean): CrackleHit {
  const hit = {
    at,
    hz: between(rng, 1400, 4800),
    q: 1.6,
    gain: rng() ** 2 * (extra ? 0.7 : 1),
    tau: between(rng, 0.0025, 0.007),
  };
  return extra ? { ...hit, extra: true } : hit;
}

/** Ein Knacken: tiefer, voller und länger. */
function pop(rng: ShopRng, at: number): CrackleHit {
  return {
    at,
    hz: between(rng, 450, 900),
    q: 4,
    gain: between(rng, 0.6, 1),
    tau: 0.014,
    pop: true,
  };
}

/** Die exponentiell verteilte Wartezeit eines Poisson-Prozesses mit `rate` Ereignissen je Sekunde. */
function poissonGap(rng: ShopRng, rate: number) {
  return -Math.log(1 - rng()) / rate;
}

/** Die Kerze: liefert ihre Anschläge und den Atem der Flamme, Stück für Stück. */
export interface CandleScore {
  /** Alle Ereignisse vor `until`, aufsteigend und mindestens {@link CRACKLE_MIN_GAP} auseinander. */
  crackles(until: number, mood: AmbienceMood): CrackleHit[];
  /** Alle Schritte des Atems vor `until`. */
  breath(until: number): BreathStep[];
}

/**
 * Eine Kerze ab `start`. Derselbe Startwert gibt dieselben Ereignisse, solange gleich abgefragt
 * wird. Knistern, Knacken und Atem würfeln getrennt.
 */
export function createCandleScore(seed: number, start = 0): CandleScore {
  const rng = createShopRng(seed);
  const air = createShopRng(seed ^ 0x9e3779b9);
  const state = {
    event: start + poissonGap(rng, CRACKLE_RATE.awake),
    pop: start + between(rng, POP_GAP[0], POP_GAP[1]),
    last: -Infinity,
    breathAt: start,
    level: (BREATH_WALK.low + BREATH_WALK.high) / 2,
  };

  /** Rückt einen Anschlag hinter den letzten und merkt ihn sich. */
  function place(hit: CrackleHit, hits: CrackleHit[]) {
    const at = Math.max(hit.at, state.last + CRACKLE_MIN_GAP);
    hits.push({ ...hit, at });
    state.last = at;
  }

  /** Ein Knistern, manchmal mit Nachschlägen, und die Wartezeit bis zum nächsten. */
  function event(mood: AmbienceMood, hits: CrackleHit[]) {
    place(crackle(rng, state.event, false), hits);
    const extras = rng() < EXTRA_CHANCE ? 1 + Math.floor(rng() * 2) : 0;
    for (let index = 0; index < extras; index++) {
      place(crackle(rng, state.last + between(rng, 0.008, 0.025), true), hits);
    }
    state.event += poissonGap(rng, CRACKLE_RATE[mood]);
  }

  return {
    crackles(until, mood) {
      const hits: CrackleHit[] = [];
      while (Math.min(state.event, state.pop) < until) {
        if (state.pop <= state.event) {
          place(pop(rng, state.pop), hits);
          state.pop += between(rng, POP_GAP[0], POP_GAP[1]);
        } else event(mood, hits);
      }
      return hits;
    },
    breath(until) {
      const steps: BreathStep[] = [];
      const { every, low, high, stride } = BREATH_WALK;
      while (state.breathAt < until) {
        state.level = Math.max(low, Math.min(high, state.level + between(air, -stride, stride)));
        steps.push({ at: state.breathAt, level: state.level });
        state.breathAt += every;
      }
      return steps;
    },
  };
}

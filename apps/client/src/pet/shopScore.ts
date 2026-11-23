/**
 * Die Noten des Zauberladens als reine Rechnung. Alles klingt in D-Dur-Pentatonik (D E F♯ A H): die
 * Harfe unter dem Zeiger, das Glitzern der Anprobe, die Ladenglocke und der Zauber. Dazu der Zufall
 * mit Startwert, der kein Geräusch zweimal gleich klingen lässt, das Klangthema für die Geräusche
 * der Oberfläche und das Kaufritual als Plan. Hörbar macht es `src/shop/sound/`.
 *
 * @module
 */

import type { CosmeticSlot } from "./types";
import type { UiSound } from "./uiSounds";

import { dbToGain, SOUND_PANS } from "./shopMix";

/** D5 in Hertz, Stufe 0 der Skala. */
export const D5_HZ = 587.33;

/** D-Dur-Pentatonik in Halbtönen über D. */
const PENTATONIC = [0, 2, 4, 7, 9] as const;

/**
 * Die Tonhöhe der Stufe `step` ab D5: 0 ist D5, 1 E5, 2 F♯5, 3 A5, 4 H5, 5 D6. Negative Stufen
 * liegen tiefer, −5 ist D4.
 */
export function pentatonicHz(step: number) {
  const octave = Math.floor(step / PENTATONIC.length);
  const semitones = PENTATONIC[step - octave * PENTATONIC.length] ?? 0;
  return D5_HZ * 2 ** (octave + semitones / 12);
}

/** Wie weit `hz` vom nächsten Ton der Skala liegt, in Cent. */
export function pentatonicCents(hz: number) {
  const cents = (((1200 * Math.log2(hz / D5_HZ)) % 1200) + 1200) % 1200;
  return Math.min(...[...PENTATONIC, 12].map((semitones) => Math.abs(cents - semitones * 100)));
}

/** Ein Zufall mit Startwert: Werte in [0, 1), derselbe Startwert gibt dieselbe Folge. */
export type ShopRng = () => number;

/** Mulberry32: klein, schnell und für Klänge zufällig genug. */
export function createShopRng(seed: number): ShopRng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gleichverteilt zwischen `low` und `high`. */
export function between(rng: ShopRng, low: number, high: number) {
  return low + (high - low) * rng();
}

/** Kleine Abweichungen eines Geräuschs, damit nichts zweimal gleich klingt. */
export interface CueJitter {
  /** Pegel zwischen −3 und 0 dB, also ±1,5 dB um −1,5 dB. */
  gain: number;
  /** Verzögerung von 0 bis 16 ms, also ±8 ms um 8 ms. In Sekunden. */
  delay: number;
  /** Faktor für Filter, ±8 %. */
  filter: number;
  /** Welche von drei Spielarten, reihum. */
  round: number;
}

/** Würfelt die Abweichungen eines Geräuschs. `count` zählt die Geräusche dieser Art, für die Reihe. */
export function cueJitter(rng: ShopRng, count: number): CueJitter {
  return {
    gain: dbToGain(between(rng, -3, 0)),
    delay: between(rng, 0, 0.016),
    filter: between(rng, 0.92, 1.08),
    round: count % 3,
  };
}

/** Die Geräusche des Ladens. */
export const SHOP_CUES = [
  "tap",
  "pageOpen",
  "pageClose",
  "pageTurn",
  "blocked",
  "latchOn",
  "latchOff",
  "shimmer",
  "fizzle",
  "coinGain",
  "hover",
  "rustle",
  "tryOn",
  "short",
  "owned",
  "stamp",
  "stampLight",
  "equip",
  "takeOff",
  "glint",
  "hatTip",
  "snort",
] as const;

/** Ein Geräusch des Ladens. */
export type ShopCue = (typeof SHOP_CUES)[number];

/**
 * Das Klangthema des Ladens: Holz, Pergament, Messing und Wachs statt der MP3s. `null` lässt das
 * MP3 klingen, für seltene Momente, die der Laden nicht kennt.
 */
export const SHOP_THEME: Readonly<Record<UiSound, ShopCue | null>> = {
  tap: "tap",
  open: "pageOpen",
  close: "pageClose",
  select: "pageTurn",
  blocked: "blocked",
  toggleOn: "latchOn",
  toggleOff: "latchOff",
  window: null,
  windowClose: null,
  success: "shimmer",
  error: "fizzle",
  coin: "coinGain",
  achievement: null,
  invite: null,
  hatch: null,
};

/** Was der Zauberer an Geräuschen auslöst. Dieselben Namen wie `WizardSfx` seines Verstands. */
export const SHOP_SFX = [
  "orbHum",
  "spellBurst",
  "whoosh",
  "impact",
  "fizzle",
  "coinClink",
  "pageTurn",
  "hatTip",
  "glint",
  "snort",
  "tug",
  "snap",
] as const;

/** Ein Geräusch des Zauberers. */
export type ShopSfx = (typeof SHOP_SFX)[number];

/** Eine Glocke: Beginn in Sekunden, Ton, Lautstärke bis 1, Ausklang als Faktor und Platz. */
export interface BellNote {
  at: number;
  hz: number;
  gain: number;
  /** Faktor auf die natürliche Abklingzeit, 1 ohne Angabe. */
  decay?: number;
  /** Platz im Stereobild, sonst der Platz des Geräuschs. */
  pan?: number;
}

/** Glocken auf Stufen der Skala, `gap` Sekunden auseinander. */
function bellsOn(steps: readonly number[], gap: number, gains: readonly number[], decay = 1) {
  return steps.map((step, index) => ({
    at: index * gap,
    hz: pentatonicHz(step),
    gain: gains[index] ?? gains.at(-1) ?? 0.5,
    decay,
  }));
}

/** Grundton des Arpeggios je Platz, als Stufe: Kopf D5, Gesicht F♯5, Hände A5, Körper E5, Aura H5. */
export const TRY_ON_ROOTS: Readonly<Record<CosmeticSlot, number>> = {
  head: 0,
  face: 2,
  hands: 3,
  body: 1,
  aura: 4,
};

/** Der Puff der Anprobe ist hier am vollsten, die Glocken beginnen hier. In Sekunden. */
export const TRY_ON_PEAK = 0.08;

/** Abstand der Glocken einer Anprobe. */
const ARPEGGIO_GAP = 0.045;

/** Der Grundton eines Platzes. Unbekannte Plätze eines neueren Servers beginnen auf D5. */
function rootOf(slot: CosmeticSlot) {
  return TRY_ON_ROOTS[slot] ?? 0;
}

/** Das Glitzern der Anprobe: 3 bis 5 Glocken, je teurer, desto mehr, aufwärts ab dem Grundton. */
export function tryOnBells(slot: CosmeticSlot, price: number): BellNote[] {
  const extra = Number.isFinite(price) ? Math.min(2, Math.max(0, Math.round(price) - 1)) : 0;
  const count = 3 + extra;
  return Array.from({ length: count }, (_, index) => ({
    at: TRY_ON_PEAK + index * ARPEGGIO_GAP,
    hz: pentatonicHz(rootOf(slot) + index),
    gain: 0.55 + (0.35 * index) / (count - 1),
  }));
}

/** Zu teuer: nur zwei Glocken, dann sinkt der Ton wie ein Seufzer, dazu Klopfen und leerer Beutel. */
export function shortScore(slot: CosmeticSlot) {
  const root = rootOf(slot);
  const bells: BellNote[] = [
    { at: TRY_ON_PEAK, hz: pentatonicHz(root), gain: 0.6 },
    { at: TRY_ON_PEAK + ARPEGGIO_GAP, hz: pentatonicHz(root + 1), gain: 0.7 },
  ];
  const sigh = { at: TRY_ON_PEAK + 2 * ARPEGGIO_GAP, hz: pentatonicHz(root + 1), to: 0.94 };
  return { bells, sigh: { ...sigh, seconds: 0.25 }, knockAt: 0.34, clinks: [0.4, 0.47] };
}

/** Schon im Besitz: zwei Glocken, eine Oktave tiefer und kürzer. */
export function ownedBells(slot: CosmeticSlot): BellNote[] {
  const root = rootOf(slot) - PENTATONIC.length;
  return [0, 1].map((index) => ({
    at: TRY_ON_PEAK + index * ARPEGGIO_GAP,
    hz: pentatonicHz(root + index),
    gain: 0.65 + 0.2 * index,
    decay: 0.6,
  }));
}

/** Anlegen: Der Klang schwillt bis `peak` an und ist bei `end` vorbei. In Sekunden. */
export const EQUIP_BEATS = { swell: 0, peak: 0.45, end: 1.1 } as const;

/** Acht Glocken von D5 bis D7 in 0,28 s, die genau auf dem Höhepunkt ankommen. */
export function equipRun(): BellNote[] {
  return Array.from({ length: 8 }, (_, index) => ({
    at: EQUIP_BEATS.peak - 0.28 + index * 0.04,
    hz: pentatonicHz(Math.round((index * 10) / 7)),
    gain: 0.5 + 0.06 * index,
  }));
}

/** Der Akkord, der beim Anlegen aufblüht: D4, A4 und E5. */
export const EQUIP_CHORD = [pentatonicHz(-5), pentatonicHz(-2), pentatonicHz(1)] as const;

/** Der tiefe Nachklang von Zauber und Anlegen: D3, dazu D2 halb so laut. */
export const SUB_BLOOM = [
  { hz: pentatonicHz(-10), gain: 1 },
  { hz: pentatonicHz(-15), gain: 0.5 },
] as const;

/** Ablegen: Wusch nach rechts, am Ende ein Plopp von D5 hinab nach A3 und eine leise D5-Glocke. */
export const TAKE_OFF_SCORE = {
  seconds: 0.42,
  popAt: 0.36,
  popFrom: pentatonicHz(0),
  popTo: pentatonicHz(-7),
  bell: pentatonicHz(0),
  panTo: 0.95,
} as const;

/** Klopfen auf Holz: Tippen auf D5, das gesperrte Tok-Tok auf D4 und H3, Buch und Theke tiefer. */
export const KNOCK_HZ = {
  tap: pentatonicHz(0),
  tok: pentatonicHz(-5),
  tik: pentatonicHz(-6),
  thump: pentatonicHz(-10),
  tock: pentatonicHz(-3),
} as const;

/** Der Stempel fällt von F♯2 nach F♯1, der leichte von D3 nach D2. In Hertz. */
export const STAMP_THUDS = {
  heavy: [pentatonicHz(-13), pentatonicHz(-18)],
  light: [pentatonicHz(-10), pentatonicHz(-15)],
} as const;

/** Wachs unter dem Zeiger: D3 und A3. */
export const WAX_TONES = [pentatonicHz(-10), pentatonicHz(-7)] as const;

/** Der Fehler: zwei stumpfe Glocken auf D3 und E3, die sich reiben. */
export const FIZZLE_BELLS = [pentatonicHz(-10), pentatonicHz(-9)] as const;

/** Gelingen: vier Glocken hinauf, A5 bis A6. */
export const SHIMMER_BELLS = bellsOn([3, 5, 7, 8], 0.035, [0.45, 0.55, 0.65, 0.75], 0.6);

/** Ein Funkeln: A6, dann D7. */
export const GLINT_BELLS = bellsOn([8, 10], 0.04, [0.8, 0.6], 0.7);

/** Die Sterne am Hut klingeln: D7, F♯7 und A7, 14 ms auseinander. */
export const HAT_TIP_BELLS = bellsOn([10, 12, 13], 0.014, [0.7, 0.6, 0.5], 0.8);

/** Die Kugel antwortet: A5, D6 und F♯6. */
export const ORB_CHIME = bellsOn([3, 5, 7], 0.06, [0.5, 0.45, 0.4]);

/** Münzgewinn: eine Glocke auf A6 nach den Münzen. */
export const COIN_GAIN_BELL: BellNote = { at: 0.1, hz: pentatonicHz(8), gain: 0.5, decay: 0.8 };

/** Die Harfe unter dem Zeiger: Zeile 0 ist D5, dann E5, F♯5, A5, H5, D6 … höchstens drei Oktaven. */
export function harpHz(step: number) {
  return pentatonicHz(Math.max(0, Math.min(14, Math.round(step) || 0)));
}

/** Die Ladenglocke auf D6: Teiltöne, ihre Stärke und Abklingzeit in Sekunden. */
export const TILL_BELL = {
  hz: pentatonicHz(5),
  ratios: [1, 2, 2.76, 5.4],
  gains: [1, 0.5, 0.35, 0.18],
  decays: [1.1, 0.7, 0.45, 0.2],
} as const;

/** Eine Münze: unharmonische Teiltöne, ihre Stärke und Abklingzeit in Sekunden. */
export const COIN_PARTIALS = {
  ratios: [1, 1.58, 2.31, 3.47, 4.9],
  gains: [1, 0.55, 0.38, 0.22, 0.12],
  decays: [0.32, 0.2, 0.13, 0.08, 0.05],
} as const;

/** Eine Münze springt nach: nach 52 ms leiser und etwas höher, jede zweite noch einmal nach 88 ms. */
export const COIN_BOUNCES = [
  { delay: 0.052, gain: 0.45, pitch: 1.004, every: 1 },
  { delay: 0.088, gain: 0.18, pitch: 1.008, every: 2 },
] as const;

/** Die Grundhöhe einer Münze zwischen 2,1 und 2,9 kHz. Münzen klingen unharmonisch, ohne Skala. */
export function coinHz(rng: ShopRng) {
  return between(rng, 2100, 2900);
}

/** Zwei Töne gleiten beim Sammeln des Zaubers eine Oktave hinauf: D4 nach D5 und A4 nach A5. */
export const GATHER_TONES = [
  [pentatonicHz(-5), pentatonicHz(0)],
  [pentatonicHz(-2), pentatonicHz(3)],
] as const;

/** So lange sammelt der Zauber vor dem Wurf, in Sekunden. */
export const SPELL_GATHER = 0.42;

/** Wie lange der Einschlag nachklingt, bevor das Ambiente zurückkommt. */
const IMPACT_TAIL = 1.2;

/** Der Einschlag: Glocken aus den Oktaven 6 und 7 binnen 0,3 s, um den Kunden verteilt. */
export function sparkleBells(rng: ShopRng, count = 12): BellNote[] {
  return Array.from({ length: count }, (_, index) => ({
    at: (0.3 * (index + rng())) / count,
    hz: pentatonicHz(5 + Math.floor(rng() * 10)),
    gain: between(rng, 0.45, 0.85),
    pan: SOUND_PANS.customer + between(rng, -0.18, 0.18),
  }));
}

/** Sechs leise Glocken, die dem Wusch vom Zauberer zum Kunden folgen und dabei steigen. */
export function trailBells(rng: ShopRng, seconds: number): BellNote[] {
  const { wizard, customer } = SOUND_PANS;
  return Array.from({ length: 6 }, (_, index) => {
    const share = (index + 0.5) / 6;
    const pan = wizard + (customer - wizard) * share;
    return {
      at: share * seconds,
      hz: pentatonicHz(6 + index),
      gain: between(rng, 0.25, 0.45),
      pan,
    };
  });
}

/** Wann im Kaufritual was geschieht, in Millisekunden ab jetzt, wie `purchaseTimeline` es plant. */
export interface RitualTimes {
  coinLandsMs: readonly number[];
  tillMs: number;
  burstMs: number;
  impactMs: number;
}

/**
 * Was {@link ritualTimes} aus dem Kaufplan liest, wie `purchaseTimeline` in `shopTimeline.ts` ihn
 * liefert.
 */
export interface PurchasePlan {
  coins: readonly { land: number }[];
  till: number;
  burst: number;
  impact: number;
}

/**
 * Die Zeiten des Rituals aus dem Kaufplan, in Millisekunden ab jetzt.
 *
 * @param sinceMs - So lange liegt C schon zurück. Was davor fiele, beginnt sofort.
 */
export function ritualTimes(plan: PurchasePlan, sinceMs = 0): RitualTimes {
  const from = (ms: number) => Math.max(0, ms - sinceMs);
  return {
    coinLandsMs: plan.coins.map((coin) => from(coin.land)),
    tillMs: from(plan.till),
    burstMs: from(plan.burst),
    impactMs: from(plan.impact),
  };
}

/** Ein Anschlag einer Münze in der Schale. */
export interface CoinHit {
  at: number;
  hz: number;
  gain: number;
  pan: number;
  /** Ob die Theke dazu klopft: nur beim ersten Aufschlag. */
  tock: boolean;
}

/** Ein Zeitraum in Sekunden ab jetzt. */
export interface TimeSpan {
  from: number;
  to: number;
}

/** Das ganze Ritual in Sekunden ab jetzt. Sammeln und Wusch fehlen bei reduzierter Bewegung. */
export interface RitualScore {
  hits: CoinHit[];
  till: number;
  gather: TimeSpan | null;
  whoosh: TimeSpan | null;
  trail: BellNote[];
  impact: number;
  sparkle: BellNote[];
  /** Bis dahin duckt das Ambiente. */
  end: number;
}

/** Die Münzen fliegen vom Beutel zur Schale, also wandern ihre Anschläge im Stereobild dorthin. */
export function coinPan(index: number, count: number) {
  const share = (index + 1) / Math.max(1, count);
  return SOUND_PANS.purse + (SOUND_PANS.tray - SOUND_PANS.purse) * share;
}

/** Die Anschläge einer Münze: der erste mit Theken-Tock, dann die Nachsprünge. */
function coinHits(at: number, index: number, pan: number, hz: number): CoinHit[] {
  const bounces = COIN_BOUNCES.filter((bounce) => (index + 1) % bounce.every === 0).map(
    (bounce) => ({
      at: at + bounce.delay,
      hz: hz * bounce.pitch,
      gain: bounce.gain,
      pan,
      tock: false,
    }),
  );
  return [{ at, hz, gain: 1, pan, tock: true }, ...bounces];
}

/** Der Zauber nach dem Plan: Sammeln vor dem Wurf, Wusch bis zum Einschlag, Glocken entlang. */
function spellParts(burst: number, impact: number, rng: ShopRng, moving: boolean) {
  if (!moving) return { gather: null, whoosh: null, trail: [] };
  const from = Math.max(0, burst - SPELL_GATHER);
  const trail = trailBells(rng, impact - burst).map((note) => ({ ...note, at: note.at + burst }));
  return {
    gather: burst - from >= 0.1 ? { from, to: burst } : null,
    whoosh: impact > burst ? { from: burst, to: impact } : null,
    trail: impact > burst ? trail : [],
  };
}

/**
 * Plant das Kaufritual: jede Münze klirrt, wenn sie landet, dann die Ladenglocke, dann der Zauber.
 * Bei reduzierter Bewegung schrumpft der Zauber auf den Einschlag.
 */
export function ritualScore(times: RitualTimes, rng: ShopRng, reducedMotion = false): RitualScore {
  const seconds = (ms: number) => Math.max(0, ms) / 1000;
  const lands = times.coinLandsMs.map(seconds);
  const hits = lands.flatMap((at, index) =>
    coinHits(at, index, coinPan(index, lands.length), coinHz(rng)),
  );
  const burst = seconds(times.burstMs);
  const impact = Math.max(burst, seconds(times.impactMs));
  const spell = spellParts(burst, impact, rng, !reducedMotion);
  const sparkle = sparkleBells(rng).map((note) => ({ ...note, at: note.at + impact }));
  hits.sort((a, b) => a.at - b.at);
  return {
    hits,
    till: seconds(times.tillMs),
    ...spell,
    impact,
    sparkle,
    end: impact + IMPACT_TAIL,
  };
}

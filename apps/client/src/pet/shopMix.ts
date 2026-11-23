/**
 * Die Mischung des Zauberladens als reine Rechnung: Pegel der Busse, Plätze im Stereobild,
 * Zeitkonstanten des Lebenszyklus, Grenzen für Zeiger-Geräusche und die Zielpegel, an denen
 * `scripts/shop-sound-check.html` jedes Geräusch misst. Hörbar macht das alles `src/shop/sound/`.
 *
 * @module
 */

/** Die Busse des Ladens. Jede Quelle landet in genau einem. */
export type SoundBus = "voice" | "customer" | "sfx" | "ui" | "ambience";

/**
 * Pegel der Busse in dB. Die Stimme des Zauberers bleibt immer vorn, das Ambiente liegt ganz hinten
 * (bei voller Lautstärke etwa −46 dBFS RMS).
 */
export const MIX: Readonly<Record<SoundBus, number>> = {
  voice: 0,
  customer: -3,
  sfx: -4,
  ui: -9,
  ambience: -20,
};

/** Verstärkung zu einem Pegel in dB: −6 dB ist etwa die Hälfte. */
export function dbToGain(db: number) {
  return 10 ** (db / 20);
}

/** Pegel in dB zu einer Verstärkung. Stille ergibt `-Infinity`. */
export function gainToDb(gain: number) {
  return 20 * Math.log10(gain);
}

/**
 * Die Plätze im Stereobild, von −1 (links) bis 1 (rechts). Sie folgen der Bühne: der Zauberer
 * links, die Kugel und die Kerze nahe der Mitte, der Kunde rechts. Siegel, Beutel und Rolle liegen
 * dort, wo sie im Fenster stehen.
 */
export const SOUND_PANS = {
  wizard: -0.46,
  orb: -0.12,
  candle: -0.02,
  tray: -0.22,
  customer: 0.46,
  seal: 0.42,
  purse: 0.8,
  ledger: -0.35,
  room: 0,
} as const;

/** Ein Platz im Stereobild. */
export type SoundPlace = keyof typeof SOUND_PANS;

/** Wie viel jeder Bus in den Hall des Holzraums schickt. */
export const REVERB_SENDS: Readonly<Record<SoundBus, number>> = {
  voice: 0.12,
  customer: 0.1,
  sfx: 0.22,
  ui: 0.08,
  ambience: 0.3,
};

/** Rückweg des Halls in dB. */
export const REVERB_RETURN_DB = -9;

/** Der Begrenzer vor dem Lautstärke-Regler. Zeiten in Sekunden. */
export const LIMITER = { threshold: -2, knee: 0, ratio: 20, attack: 0.002, release: 0.09 } as const;

/** Zeiten des Lebenszyklus in Sekunden: Einblenden, Verstecken, Fokus, Ruhe, Schließen, Ducken. */
export const SOUND_LIFECYCLE = {
  /** Zeitkonstante des Lautstärke-Reglers. */
  volumeTau: 0.05,
  /** So lange nach der ersten Geste beginnt das Ambiente … */
  bedDelay: 0.25,
  /** … und wird in dieser Zeit linear lauter. */
  bedRamp: 3,
  /** Ein verstecktes Fenster blendet mit dieser Zeitkonstante aus … */
  hiddenTau: 0.25,
  /** … und hält das Audiogerät nach dieser Zeit an. */
  hiddenSuspend: 0.8,
  /** Zurück im Bild blendet das Ambiente in dieser Zeit wieder ein. */
  returnRamp: 1.5,
  /** Ohne Fokus spielt das Ambiente nur so laut, mit dieser Zeitkonstante. */
  blurLevel: 0.4,
  blurTau: 1.2,
  /** So lange ohne Eingabe, dann wird alles in `idleFade` still und hält an. */
  idleSeconds: 300,
  idleFade: 8,
  /** Ausblenden beim Abschalten der Geräusche und beim Schließen des Fensters. */
  offFade: 0.25,
  closeFade: 0.16,
  /** Ducken: schnell hinunter, langsam wieder hinauf. */
  duckAttack: 0.06,
  duckRelease: 0.35,
} as const;

/**
 * Höchstens so viele kurze Quellen laufen zugleich. Zeiger, Rascheln und Knistern weichen schon ab
 * `dropFirstAt`, Stimmen und das Kaufritual nie.
 */
export const SOURCE_LIMITS = { cap: 96, dropFirstAt: 72 } as const;

/**
 * Zielpegel der Spitzen in dBFS bei voller Lautstärke, gemessen hinter dem Begrenzer. Die Hörprobe
 * lässt ±{@link CUE_TOLERANCE_DB} zu. `hover` ist die Harfe unter dem Zeiger, `spell` der Zauber
 * allein, `purchase` das ganze Ritual.
 */
export const CUE_TARGETS = {
  hover: -34,
  hoverWax: -36,
  hoverCoin: -38,
  tap: -28,
  rustle: -28,
  pageOpen: -26,
  pageClose: -26,
  pageTurn: -26,
  blocked: -26,
  latchOn: -30,
  latchOff: -30,
  shimmer: -22,
  fizzle: -24,
  coinGain: -20,
  tryOn: -18,
  short: -22,
  owned: -22,
  stamp: -11,
  stampLight: -16,
  equip: -15,
  takeOff: -18,
  glint: -26,
  hatTip: -30,
  snort: -28,
  tug: -28,
  snap: -24,
  clink: -24,
  till: -16,
  spell: -14,
  purchase: -10,
} as const;

/** Ein Geräusch mit Zielpegel. */
export type CueTarget = keyof typeof CUE_TARGETS;

/** So weit darf eine gemessene Spitze vom Ziel abweichen. */
export const CUE_TOLERANCE_DB = 3;

/** Keine Spitze darf darüber liegen. */
export const PEAK_CEILING_DB = -1;

/** Das Ambiente bei voller Lautstärke: RMS mit Toleranz und die höchste erlaubte Spitze. */
export const BED_TARGET = { rms: -46, tolerance: 3, peak: -30 } as const;

/**
 * Wo ein Klick im Stereobild liegt: links im Fenster links, rechts rechts, aber nie ganz außen.
 *
 * @param x - Waagrechte Lage des Zeigers in CSS-Pixeln.
 * @param width - Breite des Fensters.
 */
export function pointerPan(x: number, width: number) {
  if (!(width > 0)) return 0;
  return Math.max(-0.5, Math.min(0.5, ((x / width) * 2 - 1) * 0.5));
}

/** Ein Zeitraum, in dem ein Pegel um `db` verschoben ist. Zeiten in Sekunden der Kontext-Uhr. */
export interface LevelSpan {
  from: number;
  /** `Infinity`, solange der Zeitraum offen ist, etwa während das Siegel gehalten wird. */
  to: number;
  db: number;
}

/** Ein Schritt im Pegelverlauf: Ab `at` gleitet der Pegel mit der Zeitkonstante `tau` zu `db`. */
export interface LevelStep {
  at: number;
  db: number;
  gain: number;
  tau: number;
}

/** Der stärkste Ausschlag zur Zeit `time`, 0 ohne aktiven Zeitraum. */
export function strongestAt(spans: readonly LevelSpan[], time: number) {
  let db = 0;
  for (const span of spans) {
    if (span.from <= time && time < span.to && Math.abs(span.db) > Math.abs(db)) db = span.db;
  }
  return db;
}

/**
 * Wie ein Pegel ab `now` verläuft, wenn sich Zeiträume überlagern: Es gilt der stärkste. Weg von 0
 * dB geht es schnell ({@link SOUND_LIFECYCLE}`.duckAttack`), zurück langsam (`duckRelease`).
 *
 * @param heading - Der Ausschlag, zu dem der Pegel gerade unterwegs ist, in dB.
 * @returns Mindestens einen Schritt bei `now`, danach nur echte Wechsel.
 */
export function levelPlan(spans: readonly LevelSpan[], now: number, heading = 0): LevelStep[] {
  const edges = spans.flatMap((span) => [span.from, span.to]);
  const times = [now, ...edges.filter((time) => time > now && Number.isFinite(time))];
  const steps: LevelStep[] = [];
  let previous = heading;
  for (const at of [...new Set(times)].sort((a, b) => a - b)) {
    const db = strongestAt(spans, at);
    if (steps.length > 0 && db === previous) continue;
    const louder = Math.abs(db) > Math.abs(previous);
    const tau = louder ? SOUND_LIFECYCLE.duckAttack : SOUND_LIFECYCLE.duckRelease;
    steps.push({ at, db, gain: dbToGain(db), tau });
    previous = db;
  }
  return steps;
}

/** Grenzen für Geräusche unter dem Zeiger, in Millisekunden. */
export const HOVER_LIMITS = { gapMs: 55, sameKeyMs: 150, afterClickMs: 250 } as const;

/** Was die Zeiger-Geräusche zuletzt gespielt haben, Zeiten in Millisekunden. */
export interface HoverGate {
  lastAt: number;
  lastKey: string;
  clickAt: number;
}

/** Ein frischer Stand: Noch klang nichts. */
export const HOVER_GATE: HoverGate = { lastAt: -Infinity, lastKey: "", clickAt: -Infinity };

/**
 * Ob ein Zeiger-Geräusch jetzt klingen darf: nicht kurz nach einem Klick, höchstens eins je
 * {@link HOVER_LIMITS}`.gapMs` und derselbe Ton nicht zweimal binnen `sameKeyMs`.
 *
 * @param key - Was klingen soll, etwa `harp:2` oder `wax`.
 * @returns Der neue Stand, oder `null` für Stille.
 */
export function nextHover(gate: HoverGate, key: string, now: number): HoverGate | null {
  if (now - gate.clickAt < HOVER_LIMITS.afterClickMs) return null;
  if (now - gate.lastAt < HOVER_LIMITS.gapMs) return null;
  if (key === gate.lastKey && now - gate.lastAt < HOVER_LIMITS.sameKeyMs) return null;
  return { ...gate, lastAt: now, lastKey: key };
}

/**
 * Grenzen fürs Rascheln beim Scrollen: ab `minPx` Weg, volle Stärke ab `fullPx`, höchstens alle
 * `gapMs`. Nach `resetMs` ohne Scrollen beginnt die Summe von vorn.
 */
export const RUSTLE_LIMITS = { minPx: 24, fullPx: 240, gapMs: 280, resetMs: 1000 } as const;

/** Wie weit seit dem letzten Rascheln gescrollt wurde, Zeiten in Millisekunden. */
export interface RustleGate {
  sum: number;
  playedAt: number;
  scrolledAt: number;
}

/** Ein frischer Stand: Noch wurde nicht gescrollt. */
export const RUSTLE_GATE: RustleGate = { sum: 0, playedAt: -Infinity, scrolledAt: -Infinity };

/**
 * Zählt gescrollte Pixel und entscheidet, ob es raschelt.
 *
 * @returns Der neue Stand und die Stärke von 0 bis 1, oder `null` für Stille.
 */
export function nextRustle(gate: RustleGate, deltaPx: number, now: number) {
  const fresh = now - gate.scrolledAt > RUSTLE_LIMITS.resetMs;
  const sum = (fresh ? 0 : gate.sum) + Math.abs(deltaPx);
  const ready = sum >= RUSTLE_LIMITS.minPx && now - gate.playedAt >= RUSTLE_LIMITS.gapMs;
  if (!ready) return { gate: { ...gate, sum, scrolledAt: now }, intensity: null };
  const intensity = Math.min(1, sum / RUSTLE_LIMITS.fullPx);
  return { gate: { sum: 0, playedAt: now, scrolledAt: now }, intensity };
}

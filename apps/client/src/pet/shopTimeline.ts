/**
 * Der Takt des Zauberladens als reine Rechnung: wann beim Kauf die Münzen fliegen, die Glocke
 * klingt, der Zauber losbricht und landet, und welcher Moment auf der Bühne gerade beginnt.
 *
 * Alle Zeiten zählen in Millisekunden. Der Kauf zählt ab C: Der Server hat bestätigt und das Siegel
 * ist gestempelt. Licht, Funken, Klang, Börse, Zauberer und Kundschaft lesen dieselben Zahlen, so
 * bleibt alles im Takt.
 *
 * @module
 */

/** So viele Münzen fliegen höchstens, auch bei einem teureren Teil. */
const MAX_COINS = 6;

/** Abstand der Münzen beim Abflug. */
const COIN_STEP_MS = 70;

/** So lange fliegt eine Münze von der Börse in die Schale. */
const COIN_FLIGHT_MS = 480;

/** Nach der letzten Münze die Glocke, danach bricht der Zauber los. */
const TILL_AFTER_MS = 120;
const BURST_AFTER_MS = 100;

/** So lange fliegt der Zauber von der Kugel zur Kundschaft. */
const FLIGHT_MS = 600;

/** Nach dem Einschlag die Glückwünsche, und wann alles wieder ruht. */
const CONGRATS_AFTER_MS = 200;
const SETTLED_AFTER_MS = 1700;

/** Eine Münze: Abflug an der Börse und Landung in der Schale. */
export interface CoinFlight {
  launch: number;
  land: number;
}

/** Der ganze Kauf ab C. */
export interface PurchaseTimeline {
  /** Je Münze ein Flug, höchstens {@link MAX_COINS}. */
  coins: CoinFlight[];
  /** Die Glocke der Kasse. */
  till: number;
  /** Die Kugel blitzt, der Zauber fliegt los. */
  burst: number;
  /** Der Zauber landet, das Jelly hüpft. */
  impact: number;
  /** Der Zauberer gratuliert. */
  congrats: number;
  /** Alles ruht wieder. */
  settled: number;
}

/** Wie viele Münzen für `price` fliegen: eine je Münze, mindestens eine. */
function coinCount(price: number) {
  return Math.min(MAX_COINS, Math.max(1, Math.round(price)));
}

/**
 * Der Takt eines Kaufs zu `price` Münzen, in Millisekunden ab C. Bei drei Münzen landen sie bei
 * 480, 550 und 620, die Glocke klingt bei 740, der Zauber bricht bei 840 los und landet bei 1440.
 */
export function purchaseTimeline(price: number): PurchaseTimeline {
  const coins = Array.from({ length: coinCount(price) }, (_, index) => ({
    launch: index * COIN_STEP_MS,
    land: COIN_FLIGHT_MS + index * COIN_STEP_MS,
  }));
  const till = (coins.at(-1)?.land ?? COIN_FLIGHT_MS) + TILL_AFTER_MS;
  const burst = till + BURST_AFTER_MS;
  const impact = burst + FLIGHT_MS;
  return {
    coins,
    till,
    burst,
    impact,
    congrats: impact + CONGRATS_AFTER_MS,
    settled: impact + SETTLED_AFTER_MS,
  };
}

/**
 * Die Anprobe: Funken wirbeln bis `pop`, dann springt das Teil auf (0 → 1,12 → 1 in 360 ms), bei
 * `settled` ruht alles.
 */
export const TRY_ON = { pop: 260, settled: 620 } as const;

/** Das Anlegen: Wölkchen sofort, der Runenkreis leuchtet bei `peak` auf, Ende bei `end`. */
export const ADORN = { peak: 450, end: 1100 } as const;

/** Das Ablegen: ein Hauch, der bei `end` verweht ist. */
export const TAKE_OFF = { end: 420 } as const;

/** Wie lange das Siegel gehalten sein muss, bis der Zauber sich auflädt. */
export const CHARGE = { lateHold: 250 } as const;

/** Ein Moment auf der Bühne: anprobieren, kaufen, anlegen oder ablegen. */
export type StageMoment = "anprobe" | "kauf" | "anlegen" | "ablegen";

/** Was die Bühne über die Wahl weiß, um Momente zu erkennen. */
export interface StageChoice {
  /** Das gewählte Teil, `null` ohne Wahl. */
  chosenId: string | null;
  /** Sein Platz, etwa `head`. `null` ohne Wahl. */
  slot: string | null;
  /** Was das Jelly auf diesem Platz wirklich trägt, ohne die Anprobe. */
  equippedKey: string | null;
  /** Zählt die Käufe in diesem Fenster. */
  purchases: number;
}

/**
 * Welcher Moment beim Wechsel von `prev` zu `next` beginnt, `null` für keinen. Ein Kauf legt das
 * Teil gleich mit an und zählt als Kauf. Wer die Wahl aufhebt, probiert nichts an.
 */
export function nextMoment(prev: StageChoice, next: StageChoice): StageMoment | null {
  if (next.purchases > prev.purchases) return "kauf";
  if (next.chosenId !== prev.chosenId) return next.chosenId === null ? null : "anprobe";
  if (next.chosenId === null || next.equippedKey === prev.equippedKey) return null;
  if (next.equippedKey === next.chosenId) return "anlegen";
  return prev.equippedKey === next.chosenId ? "ablegen" : null;
}

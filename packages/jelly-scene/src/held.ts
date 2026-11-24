/**
 * Was das Jelly mit beiden Händen hält oder an den Händen trägt: reine Rechnung für App und Bühne.
 *
 * @module
 */

import { GRIP } from "./jellyGeometry.ts";

/** Wo eine Hand in Ruhe hält, in Einheiten des Jellys. */
export interface HoldSpot {
  x: number;
  y: number;
  z: number;
  /** Ihre Drehung als Euler-Winkel (XYZ), ohne Angabe wie an der Kante einer Tafel. */
  turn?: readonly [number, number, number];
}

/**
 * Wie das Jelly etwas mit beiden Händen hält: wo die Hände in Ruhe liegen (0 links, 1 rechts) und
 * in welchen Bereichen Mitte und Neigung des Gehaltenen den Händen folgen.
 */
export interface Hold {
  hands: readonly [HoldSpot, HoldSpot];
  range: {
    x: readonly [number, number];
    y: readonly [number, number];
    tilt: readonly [number, number];
  };
}

/**
 * An den Kanten einer Tafel vor dem Bauch: so halten die Hände Tafel, Plüschtiere und Pokal. Das
 * Gehaltene folgt ihnen so weit, dass es unter dem Gesicht bleibt.
 */
export const BOARD_HOLD: Hold = {
  hands: [
    { x: -GRIP.x, y: GRIP.y, z: GRIP.z },
    { x: GRIP.x, y: GRIP.y, z: GRIP.z },
  ],
  range: { x: [-0.2, 0.2], y: [-0.62, -0.15], tilt: [-0.22, 0.22] },
};

/** Mitte und Neigung zwischen den Händen, wenn sie in Ruhe halten. */
export function holdRest({ hands: [left, right] }: Pick<Hold, "hands">) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    tilt: Math.atan2(right.y - left.y, right.x - left.x),
  };
}

/**
 * Eine Haltung für Schweres: Das Gehaltene folgt den Händen nur um `reach` zur Seite und nach
 * unten, nie nach oben, und neigt sich höchstens um `lean`.
 */
function steady(hands: Hold["hands"], reach: number, lean: number): Hold {
  const rest = holdRest({ hands });
  return {
    hands,
    range: {
      x: [rest.x - reach, rest.x + reach],
      y: [rest.y - reach, rest.y],
      tilt: [rest.tilt - lean, rest.tilt + lean],
    },
  };
}

/**
 * Was anders gehalten wird als eine Tafel. Die BFG ist zu schwer zum Mitschwingen: Die linke Hand
 * liegt an ihrem Griff, die rechte packt ihre Unterkante an der Seite, die Finger darunter gekrümmt
 * (Lage und Drehung gibt `apps/client/blender/build_bfg.py` aus). Bei Gesten und Stupsern bleibt
 * sie fast stehen, unter dem Gesicht.
 */
const HOLDS: Readonly<Record<string, Hold>> = {
  bfg: steady(
    [
      { x: -GRIP.x, y: GRIP.y, z: GRIP.z },
      { x: -0.238, y: -0.709, z: 1.455, turn: [-2.7291, 0.6475, -0.18] },
    ],
    0.03,
    0.03,
  ),
};

/**
 * Cosmetics, die an den Händen sitzen statt zwischen beiden, mit den Händen (0 links, 1 rechts):
 * Pfoten an jeder, Schild und Ritternagel an der linken. Die rechte bleibt so frei für Winken,
 * Zeigen und Grübeln. Ihr Modell ist eine Hand um den Ursprung.
 */
const ON_HANDS: Readonly<Record<string, readonly number[]>> = {
  "cat-paws": [0, 1],
  "kite-shield": [0],
  "nail-sword": [0],
};

/** `value` auf den Bereich von `min` bis `max` begrenzt. */
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Wie die Hände das Cosmetic `key` halten, ohne eigene Haltung wie eine Tafel. */
export function holdOf(key?: string): Hold {
  return key !== undefined && Object.hasOwn(HOLDS, key) ? (HOLDS[key] ?? BOARD_HOLD) : BOARD_HOLD;
}

/** Lage von Tafel oder Gehaltenem zwischen beiden Händen, so gehalten wie `hold`. */
export function boardPose(
  left: { x: number; y: number },
  right: { x: number; y: number },
  { range }: Hold = BOARD_HOLD,
) {
  return {
    x: clamp((left.x + right.x) / 2, ...range.x),
    y: clamp((left.y + right.y) / 2, ...range.y),
    tilt: clamp(Math.atan2(right.y - left.y, right.x - left.x), ...range.tilt),
  };
}

/** An welchen Händen das Cosmetic `key` sitzt, 0 links, 1 rechts. Leer heißt zwischen beiden. */
export function handsOf(key: string): readonly number[] {
  return Object.hasOwn(ON_HANDS, key) ? (ON_HANDS[key] ?? []) : [];
}

/** Ob das Cosmetic `key` an den Händen sitzt, wie Pfoten oder der Schild, statt zwischen beiden. */
export function isWornOnHands(key: string) {
  return handsOf(key).length > 0;
}

/**
 * Was das Jelly mit beiden Händen hält oder an jeder Hand trägt: reine Rechnung für App und Bühne.
 *
 * @module
 */

/** Wie weit Gehaltenes den Händen folgt, in Einheiten des Jellys. So bleibt es unter dem Gesicht. */
const BOARD_RANGE = { x: 0.2, minY: -0.62, maxY: -0.15, tilt: 0.22 };

/**
 * Cosmetics, die an jeder Hand sitzen statt zwischen beiden. Ihr Modell ist eine Hand um den
 * Ursprung.
 */
const ON_HANDS = new Set(["cat-paws"]);

/** `value` auf den Bereich von `min` bis `max` begrenzt. */
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Lage von Tafel oder Gehaltenem zwischen beiden Händen. */
export function boardPose(left: { x: number; y: number }, right: { x: number; y: number }) {
  return {
    x: clamp((left.x + right.x) / 2, -BOARD_RANGE.x, BOARD_RANGE.x),
    y: clamp((left.y + right.y) / 2, BOARD_RANGE.minY, BOARD_RANGE.maxY),
    tilt: clamp(
      Math.atan2(right.y - left.y, right.x - left.x),
      -BOARD_RANGE.tilt,
      BOARD_RANGE.tilt,
    ),
  };
}

/** Ob das Cosmetic `key` an jeder Hand sitzt, wie Pfoten, statt zwischen beiden. */
export function isWornOnHands(key: string) {
  return ON_HANDS.has(key);
}

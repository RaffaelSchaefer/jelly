/**
 * Wohin das Jelly oben auf der Seite schaut: aus der Lage des Zeigers ein Ziel, daraus Neigung des
 * Körpers und Blick der Augen. Reine Rechnung ohne Three.js.
 *
 * @module
 */

/** Ein Ziel in Bildschirmrichtung, beide Achsen von -1 bis 1. `y` wächst nach unten. */
export interface Aim {
  x: number;
  y: number;
}

/** Wie weit sich das Jelly dreht und neigt, in Radiant. */
export interface Lean {
  /** Um die Hochachse, positiv nach rechts. */
  yaw: number;
  /** Um die Querachse, positiv mit dem Kopf nach vorn unten. */
  pitch: number;
}

/** Ein Kasten auf dem Bildschirm, wie `getBoundingClientRect` ihn liefert. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Größte Drehung zur Seite und Neigung nach oben und unten. */
const MAX_LEAN: Lean = { yaw: 0.42, pitch: 0.16 };

/** Begrenzt `value` auf -1 bis 1. */
function unit(value: number) {
  return Math.min(1, Math.max(-1, value));
}

/**
 * Ziel für einen Zeiger bei (`x`, `y`). Gemessen ab der Mitte des Jellys, ein halber Bildschirm
 * Abstand ist voller Ausschlag.
 *
 * @param jelly - Wo das Jelly steht.
 * @param screen - Größe des Fensters.
 */
export function aimAt(x: number, y: number, jelly: Box, screen: { width: number; height: number }) {
  const centerX = jelly.left + jelly.width / 2;
  const centerY = jelly.top + jelly.height / 2;
  return {
    x: unit((x - centerX) / Math.max(1, screen.width / 2)),
    y: unit((y - centerY) / Math.max(1, screen.height / 2)),
  } satisfies Aim;
}

/** Neigung des Körpers für ein Ziel. */
export function leanFor(aim: Aim): Lean {
  return { yaw: aim.x * MAX_LEAN.yaw, pitch: aim.y * MAX_LEAN.pitch };
}

/**
 * Versatz der Augen für ein Ziel, innerhalb von `limit`.
 *
 * @param limit - Wie weit die Augen höchstens wandern, siehe `EYE_GAZE` in `@jelly/scene/wizard`.
 */
export function eyesFor(aim: Aim, limit: { x: number; y: number }) {
  // Die Bildschirmachse zeigt nach unten, die der Szene nach oben.
  return { dx: aim.x * limit.x, dy: -aim.y * limit.y };
}

/**
 * Führt `current` weich an `target` heran, unabhängig von der Bildrate.
 *
 * @param rate - Je größer, desto schneller. Nach `1 / rate` Sekunden sind rund zwei Drittel
 *   geschafft.
 */
export function approach(current: Aim, target: Aim, seconds: number, rate = 5): Aim {
  const step = 1 - Math.exp(-rate * Math.max(0, seconds));
  return {
    x: current.x + (target.x - current.x) * step,
    y: current.y + (target.y - current.y) * step,
  };
}

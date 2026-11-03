/**
 * The mild fisheye lens of the stage camera, which makes the room look like part of a small globe.
 * The middle of the picture grows a little, the edges bend inward and the corners stay where they
 * are. `shaders/lens.frag.glsl` does the same for the picture, this module for the texts on it.
 *
 * @module
 */

/** Strength of the lens in radians, set with `?lens=`. 0 is flat, 1 already looks like a fishbowl. */
export const LENS_RANGE = { lowest: 0, highest: 1, usual: 0.55 };

/** A position on the screen in CSS pixels. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** Size of the screen in CSS pixels. */
export interface ScreenSize {
  width: number;
  height: number;
}

/**
 * Moves a point of the flat picture to where the lens shows it. Distances from the middle follow an
 * equidistant fisheye, measured in half screen diagonals so the corners stay in place.
 */
export function bendToLens(
  point: ScreenPoint,
  size: ScreenSize,
  strength: number,
): ScreenPoint {
  const halfDiagonal = Math.hypot(size.width, size.height) / 2;
  const offsetX = point.x - size.width / 2;
  const offsetY = point.y - size.height / 2;
  const radius = Math.hypot(offsetX, offsetY) / halfDiagonal;
  if (strength <= 0 || radius === 0) {
    return point;
  }
  const bentRadius = Math.atan(radius * Math.tan(strength)) / strength;
  const scale = bentRadius / radius;
  return { x: size.width / 2 + offsetX * scale, y: size.height / 2 + offsetY * scale };
}

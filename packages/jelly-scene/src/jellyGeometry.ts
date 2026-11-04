/**
 * Maße und Grundformen des Pets in Szenen-Einheiten (y nach oben, vorn ist +z).
 *
 * Der Jelly-Shader (`shaders/jelly.frag.glsl`) bildet dieselbe Form per Raymarching nach. Die
 * Meshes hier dienen als Referenz: `apps/client/scripts/export-pet-reference.mjs` schreibt sie als
 * `apps/client/blender/pet_reference.obj`, damit Cosmetics in Blender passgenau modelliert werden
 * können.
 *
 * @module
 */

import { CatmullRomCurve3, LatheGeometry, SphereGeometry, Vector2, Vector3 } from "three";

/** Kopf: eine leicht gestauchte, glänzende Kugel auf dem Körper. `depth` staucht in z-Richtung. */
export const HEAD = { x: 0, y: 0.66, z: 0.2, radius: 0.62, depth: 0.9 } as const;

/** Unterkante des Körpers. Der Bodenschatten sitzt direkt darunter. */
export const BODY_BOTTOM = -1.05;

/** Tiefe des Körpers relativ zu seiner Breite. */
const BODY_DEPTH = 0.8;

/**
 * Seitenprofil des Körpers als `[Radius, Höhe]`, vom Boden bis zum Hals: eine breite Glocke mit
 * runden Schultern und weicher, fast flacher Unterseite.
 */
const BODY_PROFILE: [number, number][] = [
  [0.0, BODY_BOTTOM],
  [0.5, BODY_BOTTOM],
  [0.7, BODY_BOTTOM + 0.025],
  [0.81, BODY_BOTTOM + 0.1],
  [0.86, BODY_BOTTOM + 0.26],
  [0.86, -0.55],
  [0.83, -0.33],
  [0.75, -0.14],
  [0.6, 0.02],
  [0.4, 0.11],
  [0.18, 0.15],
  [0.0, 0.16],
];

/** Hand: eine kleine schwebende Kugel neben dem Körper, ohne Arm. */
export const HAND = { x: 1.1, y: -0.4, z: 0.18, radius: 0.16 } as const;

/** Kopf-Mesh an seiner Position in der Szene. */
export function createHeadGeometry() {
  const geometry = new SphereGeometry(HEAD.radius, 64, 48);
  geometry.scale(1, 1, HEAD.depth);
  geometry.translate(HEAD.x, HEAD.y, HEAD.z);
  return geometry;
}

/** Körper-Mesh: {@link BODY_PROFILE} um die y-Achse gedreht und in z gestaucht. */
export function createBodyGeometry() {
  const curve = new CatmullRomCurve3(
    BODY_PROFILE.map(([r, y]) => new Vector3(r, y, 0)),
    false,
    "centripetal",
  );
  // Anfang und Ende exakt auf die Achse legen, damit sich die Drehfläche oben und unten schließt.
  const points = curve
    .getPoints(96)
    .map(
      (p, index, all) =>
        new Vector2(index === 0 || index === all.length - 1 ? 0 : Math.max(p.x, 0), p.y),
    );
  const geometry = new LatheGeometry(points, 72);
  geometry.scale(1, 1, BODY_DEPTH);
  return geometry;
}

/** Hand-Mesh im Ursprung. Positioniert wird es von der Animation. */
export function createHandGeometry() {
  return new SphereGeometry(HAND.radius, 40, 28);
}

/**
 * Punkt auf der Vorderseite des Kopfes für ein Gesichtsteil bei (`x`, `y`) relativ zur Kopfmitte.
 * `inset` schiebt den Punkt so weit in den Kopf hinein.
 */
export function headSurface(x: number, y: number, inset = 0) {
  const r = HEAD.radius;
  const z = Math.sqrt(Math.max(0, 1 - (x / r) ** 2 - (y / r) ** 2)) * r * HEAD.depth;
  return [HEAD.x + x, HEAD.y + y, HEAD.z + z - inset] as [number, number, number];
}

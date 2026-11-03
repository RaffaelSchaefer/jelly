/**
 * Das Gesicht des Jellys: zwei Augen mit Glanzpunkten, Wangen und ein Mund.
 *
 * Die Teile sitzen auf der Kopfoberfläche und schauen entlang ihrer Normale nach außen. Die
 * Animation (`animation.ts`) bewegt sie über {@link Face}.
 *
 * @module
 */

import {
  CircleGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from "three";

import type { FaceParts } from "./animation.ts";

import { HEAD, headSurface } from "./jellyGeometry.ts";

/** Linke und rechte Seite als Vorzeichen. Index 0 ist links. */
const SIDES = [-1, 1] as const;

/** Augenposition relativ zur Kopfmitte. `x` gilt gespiegelt für beide Seiten. */
const EYE = { x: 0.19, y: 0.0 } as const;

/** Render-Order des Gesichts: nach dem Jelly, vor den Cosmetics. */
const FACE_ORDER = 6;

/** Farben der Glanzpunkte im Auge und der Wangen. */
const HIGHLIGHT = "#f3ffff";
const REFLECTION = "#8fdcff";
const BLUSH = "#ff5c9a";

/** Geometrien des Gesichts. Alle Jellies teilen sie, Materialien gehören einem Jelly. */
const SHAPES = {
  pupil: new SphereGeometry(1, 24, 16),
  sparkle: new SphereGeometry(1, 12, 8),
  cheek: new CircleGeometry(1, 24),
  // Ein halber Torus, um 180° gedreht: ein Lächeln.
  smile: new TorusGeometry(0.072, 0.015, 12, 28, Math.PI),
};

/** Das Gesicht: `root` hängt im Kopf, die übrigen Teile bewegt die Animation. */
export interface Face extends FaceParts {
  root: Object3D;
}

/** Stelle auf dem Kopf relativ zur Kopfmitte. */
interface HeadSpot {
  x: number;
  y: number;
  /** Wie weit das Teil in den Kopf eingelassen ist. Negativ hebt es an. */
  inset: number;
  /** Drehung um die eigene Blickachse im Bogenmaß. */
  roll?: number;
}

/** Setzt `object` auf die Kopfoberfläche und richtet es entlang der Flächennormale aus. */
function placeOnHead(object: Object3D, { x, y, inset, roll = 0 }: HeadSpot) {
  const [px, py, pz] = headSurface(x, y, inset);
  object.position.set(px, py, pz);
  // Normale des Ellipsoids: Gradient von (x/r)² + (y/r)² + (z/(r·depth))².
  const r2 = HEAD.radius * HEAD.radius;
  const nx = x / r2;
  const ny = y / r2;
  const nz = (pz + inset - HEAD.z) / (r2 * HEAD.depth * HEAD.depth);
  object.rotation.set(-Math.atan2(ny, Math.hypot(nx, nz)), Math.atan2(nx, nz), roll, "YXZ");
}

/** Ein Mesh des Gesichts mit Position und Größe. */
function createPart(
  geometry: SphereGeometry | CircleGeometry | TorusGeometry,
  material: MeshBasicMaterial,
  scale: [number, number, number],
  position: [number, number, number] = [0, 0, 0],
) {
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = FACE_ORDER;
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  return mesh;
}

/** Ein Auge: dunkle Pupille mit großem und kleinem Glanzpunkt. */
function createEye(ink: string, side: number) {
  const eye = new Object3D();
  eye.add(
    createPart(SHAPES.pupil, new MeshBasicMaterial({ color: ink }), [0.058, 0.084, 0.022]),
    createPart(
      SHAPES.sparkle,
      new MeshBasicMaterial({ color: HIGHLIGHT }),
      [0.018, 0.023, 0.008],
      [-0.016, 0.028, 0.021],
    ),
    createPart(
      SHAPES.sparkle,
      new MeshBasicMaterial({ color: REFLECTION }),
      [0.008, 0.01, 0.005],
      [0.015, -0.026, 0.022],
    ),
  );
  placeOnHead(eye, { x: side * EYE.x, y: EYE.y, inset: 0.006 });
  return eye;
}

/** Eine Wange. Startet unsichtbar, die Animation blendet sie beim Stupsen ein. */
function createCheek(side: number) {
  const material = new MeshBasicMaterial({
    color: BLUSH,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const cheek = createPart(SHAPES.cheek, material, [0.075, 0.045, 1]);
  cheek.renderOrder = FACE_ORDER + 1;
  placeOnHead(cheek, { x: side * 0.33, y: -0.12, inset: -0.004 });
  return cheek;
}

/** Der lächelnde Mund. */
function createMouth(ink: string) {
  const mouth = createPart(SHAPES.smile, new MeshBasicMaterial({ color: ink }), [1, 0.65, 1]);
  placeOnHead(mouth, { x: 0, y: -0.165, inset: 0.004, roll: Math.PI });
  return mouth;
}

/** Das ganze Gesicht in der Tintenfarbe `ink`, in Koordinaten des Jellys. */
export function createFace(ink: string): Face {
  const eyes = SIDES.map((side) => createEye(ink, side));
  const cheeks = SIDES.map((side) => createCheek(side));
  const mouth = createMouth(ink);
  const root = new Object3D();
  root.add(...eyes, ...cheeks, mouth);
  return { root, eyes, cheeks, mouth };
}

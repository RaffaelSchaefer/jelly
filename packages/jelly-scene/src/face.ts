/**
 * Das Gesicht des Jellys: zwei Augen mit Glanzpunkten, Wangen und ein Mund.
 *
 * Die Teile sitzen auf der Kopfoberfläche und schauen entlang ihrer Normale nach außen. Die
 * Animation (`animation.ts`) bewegt sie über {@link Face}. Beim Sprechen tauscht `mouthShapes.ts`
 * die Form des Munds aus.
 *
 * @module
 */

import {
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  CircleGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { FaceParts } from "./animation.ts";

import { HEAD, headSurface, tintGeometry } from "./jellyGeometry.ts";
import { findMouthShapes, type MouthShape } from "./mouthShapes.ts";

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
  /** Die Form des Munds, solange das Jelly nicht spricht. */
  smile: BufferGeometry;
  /** Die Formen des Munds beim Sprechen. */
  mouthShapes: Record<MouthShape, BufferGeometry>;
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

/** Ein Teil eines Auges: Form, Größe und Lage relativ zur Augenmitte. Ohne Farbe ist es Tinte. */
interface EyePart {
  shape: BufferGeometry;
  scale: [number, number, number];
  at: [number, number, number];
  color?: string;
}

/** Pupille, großer und kleiner Glanzpunkt. */
const EYE_PARTS: EyePart[] = [
  { shape: SHAPES.pupil, scale: [0.058, 0.084, 0.022], at: [0, 0, 0] },
  {
    shape: SHAPES.sparkle,
    scale: [0.018, 0.023, 0.008],
    at: [-0.016, 0.028, 0.021],
    color: HIGHLIGHT,
  },
  {
    shape: SHAPES.sparkle,
    scale: [0.008, 0.01, 0.005],
    at: [0.015, -0.026, 0.022],
    color: REFLECTION,
  },
];

/** Ein Auge je Tintenfarbe: Pupille und Glanzpunkte als eine Geometrie mit Vertexfarben. */
const EYE_SHAPES = new Map<string, BufferGeometry>();
/** Der Mund je Tintenfarbe, mit Vertexfarben wie die Augen: beide teilen sich Material und Shader. */
const MOUTH_SHAPES = new Map<string, BufferGeometry>();

/**
 * Baut das Auge in der Tintenfarbe oder holt es aus dem Cache. Ein Mesh statt drei spart der Bühne
 * mit vielen Jellies Draw-Calls.
 */
function findEyeShape(ink: string): BufferGeometry {
  const cached = EYE_SHAPES.get(ink);
  if (cached) return cached;
  const parts = EYE_PARTS.map(({ shape, scale, at, color }) =>
    tintGeometry(
      shape
        .clone()
        .scale(...scale)
        .translate(...at),
      color ?? ink,
    ),
  );
  const eye = mergeGeometries(parts) ?? parts[0] ?? new BufferGeometry();
  for (const part of parts) part.dispose();
  EYE_SHAPES.set(ink, eye);
  return eye;
}

/** Ein Mesh des Gesichts mit Position und Größe. */
function createPart(
  geometry: BufferGeometry,
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
function createEye(ink: string, side: number, material: MeshBasicMaterial) {
  const eye = createPart(findEyeShape(ink), material, [1, 1, 1]);
  placeOnHead(eye, { x: side * EYE.x, y: EYE.y, inset: 0.006 });
  return eye;
}

/** Holt den Mund in der Tintenfarbe aus dem Cache oder baut ihn. */
function findMouthShape(ink: string): BufferGeometry {
  const cached = MOUTH_SHAPES.get(ink);
  if (cached) return cached;
  const mouth = tintGeometry(SHAPES.smile.clone(), ink);
  MOUTH_SHAPES.set(ink, mouth);
  return mouth;
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
function createMouth(ink: string, material: MeshBasicMaterial) {
  const mouth = createPart(findMouthShape(ink), material, [1, 0.65, 1]);
  placeOnHead(mouth, { x: 0, y: -0.165, inset: 0.004, roll: Math.PI });
  return mouth;
}

/** Das ganze Gesicht in der Tintenfarbe `ink`, in Koordinaten des Jellys. */
export function createFace(ink: string): Face {
  // Augen und Mund tragen ihre Farbe in den Vertices, also reicht ein Material für alle drei.
  const inked = new MeshBasicMaterial({ vertexColors: true });
  const eyes = SIDES.map((side) => createEye(ink, side, inked));
  const cheeks = SIDES.map((side) => createCheek(side));
  const mouth = createMouth(ink, inked);
  const root = new Object3D();
  root.add(...eyes, ...cheeks, mouth);
  const smile = findMouthShape(ink);
  return { root, eyes, cheeks, mouth, smile, mouthShapes: findMouthShapes(ink) };
}

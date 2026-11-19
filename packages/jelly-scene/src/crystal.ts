/**
 * Die Kristallkugel des Zauberers: Nebel kreist um einen warmen Kern, der Rand leuchtet, das
 * Fenster spiegelt sich. Nach einem Kauf flammt der Kern auf.
 *
 * Sie entsteht im Shader (`shaders/crystal.frag.glsl`) statt als Modell und liegt wie ein Sticker
 * in einer Malschicht, mit Outline (`stickerOrder` in `cosmetic.ts`). Geometrie und Materialien
 * gehören ihr, {@link disposeCrystalBall} gibt sie frei.
 *
 * @module
 */

import { Color, Mesh, Object3D, ShaderMaterial, SphereGeometry } from "three";

import { createStickerOutline, stickerOrder } from "./cosmetic.ts";
import fragmentShader from "./shaders/crystal.frag.glsl?raw";
import vertexShader from "./shaders/crystal.vert.glsl?raw";

/** Wie eine Kristallkugel aussieht. Farben als CSS-Hex. */
export interface CrystalLook {
  /** Radius in Szenen-Einheiten. */
  radius: number;
  /** Farbe der Outline. */
  ink: string;
  /** Malschicht wie bei Cosmetics (`CosmeticLook`). */
  layer: number;
  /** Breite der Outline. */
  outline: number;
  /** Das tiefe Glas, wo kein Nebel ist. */
  deep: string;
  /** Nebel und Lichtsaum am Rand. */
  mist: string;
  /** Der warme Kern. */
  core: string;
}

/** Uniforms der Füllung. Als eigener Typ, damit jeder Zugriff ohne Index-Signatur typsicher ist. */
function createUniforms({ deep, mist, core }: CrystalLook) {
  return {
    uTime: { value: 0 },
    uPulse: { value: 0 },
    // Als `Color`: Sie rechnet Hex in den linearen Farbraum um, `colorspace_fragment` zurück.
    uDeep: { value: new Color(deep) },
    uMist: { value: new Color(mist) },
    uCore: { value: new Color(core) },
  };
}

/** Die Uniforms jeder Kugel, damit `animateCrystalBall` sie ohne Suche findet. */
const UNIFORMS = new WeakMap<Object3D, ReturnType<typeof createUniforms>>();

/**
 * Eine Kristallkugel um ihren Mittelpunkt: Outline und Füllung, die Outline zuerst. `Object3D`
 * statt `Group`, wie bei Cosmetics.
 */
export function createCrystalBall(look: CrystalLook): Object3D {
  const geometry = new SphereGeometry(look.radius, 32, 24);
  const uniforms = createUniforms(look);
  const fill = new Mesh(geometry, new ShaderMaterial({ uniforms, vertexShader, fragmentShader }));
  fill.renderOrder = stickerOrder(look.layer).fill;
  const ball = new Object3D();
  ball.add(createStickerOutline(geometry, look.ink, look.outline, look.layer), fill);
  UNIFORMS.set(ball, uniforms);
  return ball;
}

/**
 * Bewegt den Nebel einer Kugel aus {@link createCrystalBall} für ein Bild.
 *
 * @param seconds - Zeit der Szenenuhr. Steht sie, steht auch der Nebel.
 * @param pulse - Wie hell der Kern aufflammt, 0 bis 1.
 */
export function animateCrystalBall(ball: Object3D, seconds: number, pulse: number) {
  const uniforms = UNIFORMS.get(ball);
  if (!uniforms) return;
  uniforms.uTime.value = seconds;
  uniforms.uPulse.value = pulse;
}

/**
 * Gibt Geometrie und beide Materialien einer Kugel frei. Zeichnet man sie danach doch wieder, lädt
 * Three.js beides neu hoch, wie nach einem Remount im StrictMode von React.
 */
export function disposeCrystalBall(ball: Object3D) {
  const meshes = ball.children.filter((child) => child instanceof Mesh);
  meshes[0]?.geometry.dispose();
  for (const mesh of meshes) (mesh.material as ShaderMaterial).dispose();
}

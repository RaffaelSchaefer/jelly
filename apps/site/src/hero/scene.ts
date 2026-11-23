/**
 * Die Three.js-Szene der Seite, oben und im Fuß: ein Jelly aus `@jelly/scene` auf durchsichtigem
 * Grund, so eingestellt wie das Pet in der App (`PetScene.tsx`) und die Bühne des Servers.
 *
 * @module
 */

import {
  animateJelly,
  createJelly,
  createMotion,
  disposeJelly,
  JELLY_COLORS,
  type EmoteFrame,
  type Jelly,
  type JellyColor,
  type JellyQuality,
  type Motion,
} from "@jelly/scene";
import { EYE_GAZE, placeEyes } from "@jelly/scene/wizard";
import {
  ACESFilmicToneMapping,
  Group,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";

import { eyesFor, leanFor, type Aim } from "./gaze.ts";
import { pixelRatioFor } from "./quality.ts";
import { HERO_VIEW, type CameraView } from "./views.ts";

/** Was ein Bild braucht. */
export interface HeroFrame {
  /** Zeit in Sekunden. */
  time: number;
  /** Zeit seit dem letzten Bild in Sekunden. */
  delta: number;
  /** Zähler der Stupser. */
  pulse: number;
  reducedMotion: boolean;
  /** Wohin das Jelly schaut. */
  aim: Aim;
  /** Laufende Geste. */
  emote?: EmoteFrame;
}

/** Die Szene mit ihrem Jelly. */
export interface HeroScene {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Hülle um das Jelly: Die Animation setzt seine Wurzel, die Neigung zum Zeiger sitzt hier. */
  stand: Group;
  jelly: Jelly;
  motion: Motion;
  color: JellyColor;
  quality: JellyQuality;
}

/**
 * Baut Renderer, Kamera und Jelly auf `canvas`. Wirft, wenn es kein WebGL gibt.
 *
 * @param view - Blick der Kamera, ohne Angabe das ganze Jelly.
 */
export function createHeroScene(
  canvas: HTMLCanvasElement,
  color: JellyColor,
  quality: JellyQuality,
  view: CameraView = HERO_VIEW,
): HeroScene {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  // Fiber stellt das in der App ein, der Shader des Körpers erwartet beides.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(view.fov, 1, 0.1, 50);
  camera.position.set(...view.position);
  camera.lookAt(...view.target);
  const stand = new Group();
  scene.add(stand);
  const jelly = createJelly(JELLY_COLORS[color], quality);
  stand.add(jelly.root);
  return { renderer, scene, camera, stand, jelly, motion: createMotion(0), color, quality };
}

/** Baut das Jelly in neuer Farbe oder Fassung neu. Die Bewegung läuft weiter. */
export function rebuildJelly(hero: HeroScene, color: JellyColor, quality: JellyQuality): void {
  if (hero.color === color && hero.quality === quality) return;
  hero.stand.remove(hero.jelly.root);
  disposeJelly(hero.jelly);
  hero.jelly = createJelly(JELLY_COLORS[color], quality);
  hero.stand.add(hero.jelly.root);
  hero.color = color;
  hero.quality = quality;
  hero.renderer.setPixelRatio(pixelRatioFor(quality, window.devicePixelRatio));
}

/** Passt Zeichenfläche und Kamera an die Größe der Canvas an. */
export function resizeHero(hero: HeroScene, width: number, height: number): void {
  hero.renderer.setPixelRatio(pixelRatioFor(hero.quality, window.devicePixelRatio));
  hero.renderer.setSize(width, height, false);
  hero.camera.aspect = width / Math.max(1, height);
  hero.camera.updateProjectionMatrix();
}

/** Bewegt und zeichnet ein Bild. */
export function drawHero(hero: HeroScene, frame: HeroFrame): void {
  const lean = leanFor(frame.aim);
  hero.stand.rotation.set(lean.pitch, lean.yaw, 0);
  animateJelly(hero.jelly, hero.motion, {
    time: frame.time,
    rawDelta: frame.delta,
    pulse: frame.pulse,
    reducedMotion: frame.reducedMotion,
    holding: false,
    emote: frame.emote,
  });
  // Eine Geste setzt ihre eigenen Augen, sonst folgen sie dem Zeiger.
  if (!frame.emote) {
    const { dx, dy } = eyesFor(frame.aim, EYE_GAZE);
    placeEyes(hero.jelly.face, dx, dy);
  }
  hero.renderer.render(hero.scene, hero.camera);
}

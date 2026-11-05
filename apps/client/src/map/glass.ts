/**
 * Das flüssige Glas der Karte: „Weggehen“ und die Kapseln der Fenster am Jelly, dieselben Tropfen
 * wie am Jelly, auf einer eigenen Canvas.
 *
 * Eine eigene, weil die Canvas der Bühne zum Rand hin ausläuft und Tropfen in den Ecken mit ihr
 * verschwänden. Hinter dem Glas liegt hier nichts zum Brechen: Der helle Boden würde die Seifenhaut
 * überstrahlen, durchsichtig bleibt sie satt. Die Bühne scheint trotzdem durch, nur ungebrochen.
 *
 * @module
 */

import {
  ACESFilmicToneMapping,
  Camera,
  DataTexture,
  Mesh,
  Scene,
  Vector2,
  Vector4,
  WebGLRenderer,
} from "three";

import { PET_COLORS, shapeGrowth, stepPresence, type PetColor } from "../pet";
import { createGlass, FULLSCREEN, readShapes } from "../scene/glassMaterial";

/**
 * Die drei festen Knöpfe stehen im DOM zuerst und bleiben für sich, die Kapseln fließen ineinander.
 * Auf dem hellen Boden fällt ein Schatten stärker auf als am Jelly, und mehr Farbe hält die Schrift
 * lesbar, wenn Namen und Jellies dahinter durchscheinen.
 *
 * Ponytail: Platz für Hinweis, Abbrechen, die zwei Knöpfe am fremden Jelly, drei Gesten und die
 * Fläche der Suche. Mehr Plätze kosten jedes Pixel einen Blick mehr. Kennt der Server mehr als drei
 * Gesten, fehlt zuerst der Suche das Glas.
 */
const LAYOUT = { maxShapes: 11, soloShapes: 3, shadow: 0.1, body: 0.62 };
/** Dieselbe Bildrate wie am Jelly, bei reduzierter Bewegung nur noch für Hover. */
const FRAME_MS = 1000 / 30;
const STILL_FRAME_MS = 100;
const MAX_PIXEL_RATIO = 2;
const INITIAL_COLOR: PetColor = "mint";

/** Was die Seite am laufenden Glas ändern kann. */
export interface GlassLayer {
  /** Das Glas trägt die Farbe des eigenen Jellys. */
  setLook: (color: PetColor, reducedMotion: boolean) => void;
}

/** Ein Zeichner mit durchsichtigem Hintergrund und dem Licht der Pet-Szene. */
function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.toneMapping = ACESFilmicToneMapping;
  return renderer;
}

/** Ein durchsichtiges Pixel: Der Shader bricht es, ohne dass etwas zu sehen wäre. */
function createEmptyBackdrop() {
  const backdrop = new DataTexture(new Uint8Array(4), 1, 1);
  backdrop.needsUpdate = true;
  return backdrop;
}

/**
 * Startet das Glas und zeichnet es für die Lebensdauer der Seite.
 *
 * @param root - Das Element mit den `data-liquid`-Knöpfen.
 * @throws Wenn das Gerät kein WebGL kann.
 */
export function startGlass(canvas: HTMLCanvasElement, root: HTMLElement): GlassLayer {
  const renderer = createRenderer(canvas);
  const { material, uniforms } = createGlass(INITIAL_COLOR, LAYOUT);
  uniforms.uBackdrop.value = createEmptyBackdrop();
  const mesh = new Mesh(FULLSCREEN, material);
  mesh.frustumCulled = false;
  const scene = new Scene().add(mesh);
  const camera = new Camera();
  const found = uniforms.uShapes.value.map(() => new Vector4());
  // Beim Verschwinden liegt der Knopf nicht mehr im DOM, also zählt seine letzte Lage.
  const lastShapes = found.map(() => new Vector4());
  const presence = found.map(() => 0);
  const size = new Vector2();
  let reducedMotion = false;
  let lastFrame = performance.now();
  let wasEmpty = false;

  /** Liest die Knöpfe und lässt ihre Tropfen wachsen oder schrumpfen. */
  function placeShapes(seconds: number) {
    readShapes(root, canvas, size.x, { shapes: found, calm: uniforms.uCalm.value });
    found.forEach((shape, index) => {
      const isVisible = shape.z > 0;
      if (isVisible) lastShapes[index]?.copy(shape);
      const next = stepPresence(presence[index] ?? 0, isVisible, seconds, reducedMotion);
      presence[index] = next;
      const growth = shapeGrowth(next, 0);
      const { x, y, z, w } = lastShapes[index] ?? shape;
      uniforms.uShapes.value[index]?.set(x, y, z * growth, w * growth);
    });
  }

  /** Zeichnet ein Bild, wenn es so weit ist. Ein verborgenes Fenster bekommt keine. */
  function tick(now: number) {
    requestAnimationFrame(tick);
    if (now - lastFrame < (reducedMotion ? STILL_FRAME_MS : FRAME_MS)) return;
    const seconds = (now - lastFrame) / 1000;
    lastFrame = now;
    renderer.getSize(size);
    if (size.x !== canvas.clientWidth || size.y !== canvas.clientHeight) {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      renderer.getSize(size);
    }
    uniforms.uCanvas.value.copy(size);
    renderer.getDrawingBufferSize(uniforms.uBuffer.value);
    uniforms.uTime.value = reducedMotion ? 0 : now / 1000;
    placeShapes(seconds);
    // Die Canvas deckt das ganze Fenster: Ohne Tropfen genügt ein leeres Bild.
    const isEmpty = presence.every((value) => value === 0);
    if (!isEmpty || !wasEmpty) renderer.render(scene, camera);
    wasEmpty = isEmpty;
  }
  requestAnimationFrame(tick);

  return {
    setLook: (color, reduced) => {
      const palette = PET_COLORS[color];
      uniforms.uColor.value.set(palette.hex);
      uniforms.uGlow.value.set(palette.glow);
      uniforms.uInk.value.set(palette.outline);
      reducedMotion = reduced;
    },
  };
}

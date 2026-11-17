/**
 * Licht einer Szene auf Jellies und Cosmetics: bis zu vier Punktlichter mit Reichweite, dazu ein
 * Randlicht aus einer Richtung und ein Dämpfer für das eingebaute Studiolicht. So fällt im Shop
 * Kerzenlicht auf Zauberer und Kunden.
 *
 * Die Shader (`jelly.frag.glsl`, `toon.frag.glsl`) rechnen das Licht nur mit dem Define
 * `SCENE_LIGHT`. Das setzt {@link lightMaterial} und nur für Materialien, die eine Szene
 * ausdrücklich beleuchtet. Pet, Karte und Bühne des Servers bleiben ohne es genau wie bisher.
 *
 * Alle beleuchteten Materialien teilen sich die Uniform-Objekte eines Lichts: Ein Schreiben je Bild
 * erreicht sie alle.
 *
 * @module
 */

import { Color, Vector3, Vector4, type ColorRepresentation, type ShaderMaterial } from "three";

/** So viele Punktlichter fasst ein Licht. Der Shader bekommt die Zahl als Define. */
export const SCENE_LIGHTS = 4;

/** Ein Punkt der Szene in Weltkoordinaten. */
type Point = readonly [number, number, number];

/** Die Uniforms eines Lichts, als eigener Typ ohne Index-Signatur. */
function createUniforms() {
  return {
    /** Wie stark das eingebaute Studiolicht bleibt, 1 unverändert. */
    uSceneShade: { value: 1 },
    /** Je Licht die Lage in Weltkoordinaten (xyz) und die Reichweite (w). Reichweite 0 ist aus. */
    uSceneLights: { value: Array.from({ length: SCENE_LIGHTS }, () => new Vector4(0, 0, 0, 0)) },
    /** Je Licht die lineare Farbe mal Stärke. */
    uSceneColors: { value: Array.from({ length: SCENE_LIGHTS }, () => new Color(0, 0, 0)) },
    /** Woher das Randlicht kommt: die Richtung zum Licht hin, normiert. */
    uSceneRimDir: { value: new Vector3(0, 1, 0) },
    /** Farbe mal Stärke des Randlichts. */
    uSceneRimColor: { value: new Color(0, 0, 0) },
  };
}

/** Die Uniforms eines Lichts. */
export type SceneLightUniforms = ReturnType<typeof createUniforms>;

/** Ein Licht für eine Szene. Seine Uniforms teilen alle Materialien, die es beleuchtet. */
export interface SceneLight {
  uniforms: SceneLightUniforms;
}

/** Ein neues, dunkles Licht: alle Lichter aus, Studiolicht unverändert, kein Rand. */
export function createSceneLight(): SceneLight {
  return { uniforms: createUniforms() };
}

/** Ein Punktlicht: wo es steht, seine Farbe, wie stark es ist und wie weit es reicht. */
export interface SceneLightSpot {
  /** Lage in Weltkoordinaten. */
  position: Point;
  color: ColorRepresentation;
  /** Multipliziert die lineare Farbe. */
  intensity: number;
  /** Bei dieser Entfernung wirkt es noch halb so stark, danach klingt es weich ab. 0 ist aus. */
  range: number;
}

/**
 * Setzt das Punktlicht `index`. Die Farbe wird linear umgerechnet und mit der Stärke multipliziert.
 *
 * @throws RangeError, wenn es kein Licht `index` gibt.
 */
export function setSceneLight(light: SceneLight, index: number, spot: SceneLightSpot) {
  const slot = light.uniforms.uSceneLights.value[index];
  const tint = light.uniforms.uSceneColors.value[index];
  if (!slot || !tint) throw new RangeError(`Kein Szenenlicht ${index}`);
  const [x, y, z] = spot.position;
  slot.set(x, y, z, spot.range);
  tint.set(spot.color).multiplyScalar(spot.intensity);
}

/** Das Randlicht: woher es kommt, seine Farbe und wie stark es ist. */
export interface SceneRim {
  /** Richtung zum Licht hin, muss nicht normiert sein. */
  direction: Point;
  color: ColorRepresentation;
  strength: number;
}

/** Setzt das Randlicht. */
export function setSceneRim(light: SceneLight, { direction, color, strength }: SceneRim) {
  light.uniforms.uSceneRimDir.value.set(direction[0], direction[1], direction[2]).normalize();
  light.uniforms.uSceneRimColor.value.set(color).multiplyScalar(strength);
}

/**
 * Beleuchtet `material` mit `light`: setzt das Define `SCENE_LIGHT` und hängt die Uniforms des
 * Lichts an, als dieselben Objekte. Ein zweiter Aufruf mit demselben Licht ändert nichts, so darf
 * eine Szene jedes Bild alle Materialien durchgehen. Nur ein neues Define kompiliert den Shader
 * neu.
 *
 * @returns Ob sich etwas geändert hat.
 */
export function lightMaterial(material: ShaderMaterial, light: SceneLight) {
  const lit = material.defines?.SCENE_LIGHT === SCENE_LIGHTS;
  if (lit && material.uniforms.uSceneShade === light.uniforms.uSceneShade) return false;
  Object.assign(material.uniforms, light.uniforms);
  if (!lit) {
    material.defines = { ...material.defines, SCENE_LIGHT: SCENE_LIGHTS };
    material.needsUpdate = true;
  }
  return true;
}

/**
 * Cosmetics, die sich bewegen wie der Oktopus: Sie schwellen im Takt um einen Punkt an und wieder
 * ab, und ihre Arme wedeln. Das Anschwellen ist reine Rechnung auf ihrem `Object3D`, das Wedeln
 * macht der Shader aus zwei Uniforms. App und Bühne rufen {@link pulseCosmetics} nach dem Jelly je
 * Bild auf.
 *
 * @module
 */

import { Vector3, Vector4, type Object3D } from "three";

/** Wie ein Cosmetic pulsiert. */
export interface CosmeticPulse {
  /** Der Punkt, um den es anschwillt, in Koordinaten des Jellys. */
  at: readonly [number, number, number];
  /** Wie weit es anschwillt, als Anteil seiner Größe. */
  amount: number;
  /** Schläge je Sekunde. */
  rate: number;
}

/** Wie die Arme eines Cosmetics wedeln. */
export interface CosmeticWave {
  /** Der Punkt, von dem die Arme ausgehen, in Koordinaten des Jellys. */
  at: readonly [number, number, number];
  /** Der Abstand von dort, ab dem sie schwingen. Was näher liegt, wie das Gesicht, bleibt ruhig. */
  from: number;
  /** Die Länge der Arme ab dort. Bis zur Spitze wächst der Ausschlag. */
  span: number;
  /** Der Ausschlag an der Spitze. */
  amount: number;
  /** Schwingungen je Sekunde. */
  rate: number;
}

/** Die Uniforms des Wedelns für Füllung und Outline. Ohne `wave` steht alles still. */
export function waveUniforms(wave?: CosmeticWave) {
  const [x, y, z] = wave?.at ?? [0, 0, 0];
  return {
    uWave: { value: new Vector4(x, y, z, wave?.from ?? 0) },
    uWaveMove: { value: new Vector3(0, wave?.span ?? 1, 0) },
  };
}

/** Ein wedelndes Cosmetic merkt sich, wie es wedelt, und das Uniform, das sich dabei ändert. */
type Waving = CosmeticWave & { move: Vector3 };

/**
 * Wie groß ein pulsierendes Cosmetic zur Zeit `time` (Sekunden) ist: von 1 bis `1 + amount`, nie
 * kleiner als modelliert. So hält das Modell selbst die Grenzen ein, angeschwollen nur um
 * `amount`.
 */
export function pulseScale({ amount, rate }: CosmeticPulse, time: number) {
  return 1 + amount * (0.5 - 0.5 * Math.cos(2 * Math.PI * rate * time));
}

/** Stellt ein pulsierendes Cosmetic auf seine Größe zur Zeit `time`. */
function swell(object: Object3D, pulse: CosmeticPulse, time: number, still: boolean) {
  const scale = still ? 1 : pulseScale(pulse, time);
  const [x, y, z] = pulse.at;
  object.scale.setScalar(scale);
  object.position.set(x * (1 - scale), y * (1 - scale), z * (1 - scale));
}

/**
 * Lässt jedes Cosmetic unter `root`, das sich bewegt, anschwellen und wedeln, wie es zur Zeit
 * `time` (Sekunden) steht. Mit `still`, bei reduzierter Bewegung, bleibt es, wie es modelliert
 * ist.
 */
export function pulseCosmetics(root: Object3D, time: number, still: boolean) {
  root.traverse((object) => {
    const pulse = object.userData.pulse as CosmeticPulse | undefined;
    if (pulse) swell(object, pulse, time, still);
    const wave = object.userData.wave as Waving | undefined;
    if (wave) wave.move.set(still ? 0 : wave.amount, wave.span, 2 * Math.PI * wave.rate * time);
  });
}

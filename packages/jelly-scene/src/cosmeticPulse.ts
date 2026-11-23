/**
 * Cosmetics, die sich bewegen wie der Oktopus: Sie stauchen und strecken sich im Takt um einen
 * Punkt und schaukeln, und ihre Arme wedeln. Das Pulsieren ist reine Rechnung auf ihrem `Object3D`,
 * das Wedeln macht der Shader aus zwei Uniforms. App und Bühne rufen {@link pulseCosmetics} nach dem
 * Jelly je Bild auf.
 *
 * @module
 */

import { Matrix4, Vector3, Vector4, type Object3D } from "three";

/** Wie ein Cosmetic pulsiert. */
export interface CosmeticPulse {
  /** Der Punkt, der dabei stehen bleibt, etwa wo es aufsitzt, in Koordinaten des Jellys. */
  at: readonly [number, number, number];
  /** Wie weit es sich staucht und streckt, als Anteil seiner Höhe. */
  amount: number;
  /** Schläge je Sekunde. */
  rate: number;
  /** Wie weit es dabei um den Punkt schaukelt, im Bogenmaß. Ohne Angabe gar nicht. */
  rock?: number;
  /** Wie seine Höhe zur Senkrechten geneigt ist, im Bogenmaß um die Blickachse. Ohne Angabe 0. */
  lean?: number;
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

/** Zwei Schwingungen übereinander, die zweite schneller und kleiner: Wackelpudding, der nachzittert. */
function jiggle(phase: number) {
  return 0.7 * Math.sin(phase) + 0.3 * Math.sin(2.7 * phase);
}

/**
 * Wie hoch ein pulsierendes Cosmetic zur Zeit `time` (Sekunden) ist, als Anteil seiner Höhe. Es
 * staucht sich vor allem: bis `amount` × 0,85 flacher, aber nur bis `amount` × 0,15 höher als
 * modelliert, so bleibt über ihm Platz. In der Breite gleicht es aus wie Wackelpudding.
 */
export function pulseScale({ amount, rate }: CosmeticPulse, time: number) {
  return 1 + amount * (0.5 * jiggle(2 * Math.PI * rate * time) - 0.35);
}

/**
 * Wie weit ein pulsierendes Cosmetic zur Zeit `time` schaukelt, im Bogenmaß, langsamer als es
 * pulsiert.
 */
export function pulseRock({ rock = 0, rate }: CosmeticPulse, time: number) {
  return rock * jiggle(Math.PI * rate * time + 1);
}

/** Wiederverwendet, damit das Pulsieren je Bild nichts anlegt. */
const step = new Matrix4();

/**
 * Stellt ein pulsierendes Cosmetic auf Höhe, Breite und Neigung zur Zeit `time`: um seinen Punkt
 * gestaucht entlang seiner eigenen Höhe und geschaukelt. Seine Matrix steht dafür fest, Lage und
 * Größe des `Object3D` gelten nicht mehr.
 */
function swell(object: Object3D, pulse: CosmeticPulse, time: number, still: boolean) {
  object.matrixAutoUpdate = false;
  object.matrixWorldNeedsUpdate = true;
  if (still) {
    object.matrix.identity();
    return;
  }
  const [x, y, z] = pulse.at;
  const lean = pulse.lean ?? 0;
  const tall = pulseScale(pulse, time);
  const wide = 1 / Math.sqrt(tall);
  object.matrix
    .makeTranslation(x, y, z)
    .multiply(step.makeRotationZ(lean + pulseRock(pulse, time)))
    .multiply(step.makeScale(wide, tall, wide))
    .multiply(step.makeRotationZ(-lean))
    .multiply(step.makeTranslation(-x, -y, -z));
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

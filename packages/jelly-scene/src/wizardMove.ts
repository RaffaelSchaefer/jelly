/**
 * Was eine Geste des Zauberers in einem Bild bekommt und bewirkt. Hier stehen nur die Typen und der
 * weiche Buckel, damit `wizardGestures.ts` und `wizardTease.ts` sie teilen, ohne sich gegenseitig
 * zu laden.
 *
 * @module
 */

import { MathUtils } from "three";

import type { Jelly } from "./jelly.ts";
import type { FaceContext } from "./wizardFace.ts";

/** Was der Shop außerhalb des Jellys bewegt. */
export interface WizardExtras {
  /** Wie weit der Hut über dem Kopf schwebt. */
  hatLift: number;
  /** Wie weit der Hut kippt, in rad. Positiv hebt er sich rechts. */
  hatTilt: number;
  /** Wie weit der Hut fort ist: 0 auf dem Kopf, 1 geklaut und nicht mehr zu sehen. */
  hatAway: number;
  /** Wie weit der Bart gedehnt ist: 0 in Ruhe, 1 ganz, beim Zurückschnalzen kurz darunter. */
  beardPull: number;
  /** Wie hoch die Glaskugel aus ihren Krallen steigt. */
  orbLift: number;
  /** Wie hell der Kern der Kugel glüht, 0 bis 1. */
  orbGlow: number;
  /** Wie weit er sich vorbeugt, in rad. Schon angewandt. */
  lean: number;
}

/** Was eine Geste in diesem Bild bewirkt, über das Jelly hinaus. Den Hut holt nur sein Stand fort. */
export interface GestureOut extends Omit<WizardExtras, "hatAway"> {
  /** Wie tief er in den Schlaf sinkt, 0 bis 1. */
  sink: number;
  /** Wie weit ein Auge im Schlaf aufgeht. */
  peek: number;
  /** Beide Augen zu. */
  closed: boolean;
}

/** Alles, was eine Geste in diesem Bild braucht. */
export interface Move {
  jelly: Jelly;
  strength: number;
  /** Laufzeit in Sekunden. */
  elapsed: number;
  seconds: number;
  releaseAt?: number;
  /** Zeit für Schwingungen: bei reduzierter Bewegung der Moment, der die Geste zeigt. */
  t: number;
  /** 0 bei reduzierter Bewegung, sonst 1. */
  moving: number;
  /** Takt des Atems im Schlaf, in Sekunden. */
  breath: number;
  face: FaceContext;
  out: GestureOut;
}

/** Ein weicher Buckel über `[von, voll, sinkt, bis]`: 0 vor `von`, 1 von `voll` bis `sinkt`. */
export function bump(t: number, [from, peak, fall, to]: readonly [number, number, number, number]) {
  return MathUtils.smoothstep(t, from, peak) * (1 - MathUtils.smoothstep(t, fall, to));
}

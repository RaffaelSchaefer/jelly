/**
 * Der Tanzschritt der Polonaise am Pet: drei kleine Schritte, dann ein Kick, im selben Takt wie auf
 * der Bühne (`calculateCongaPose` aus `@jelly/stage`). Er liegt auf der Hülle um das Jelly, wie die
 * Bühne ihn auf ihre Gruppe legt. Das Jelly darin stupst, winkt und spricht weiter wie sonst.
 *
 * @module
 */

import type { Object3D } from "three";

import { BODY_BOTTOM, HEAD } from "@jelly/scene";
import { calculateCongaPose } from "@jelly/stage/conga";

/** Höhe eines Jellys vom Boden bis zum Scheitel. Der Schritt hebt es um Anteile davon. */
const JELLY_HEIGHT = HEAD.y + HEAD.radius - BODY_BOTTOM;

/**
 * Im Fenster hebt der Schritt nur halb so hoch wie auf der Bühne: Über dem Kopf sitzt die
 * Sprechblase, ein voller Kick schöbe das Gesicht dahinter.
 */
const LIFT_SHARE = 0.5;

/**
 * So lange blendet der Tanz ein und aus, in Sekunden. Sonst spränge das Jelly mitten in den
 * Schritt.
 */
const EASE_SECONDS = 0.6;

/** Wie das Jelly in seiner Polonaise tanzt. */
export interface CongaDance {
  /** Platz in der Polonaise, 0 ganz vorn. Jeder Platz tanzt eine Spur nach dem davor. */
  rank: number;
  /** Abstand zur Uhr des Servers in Millisekunden. Mit ihr tanzen alle Bildschirme im selben Takt. */
  serverOffset: number;
}

/** Der Tanz eines Jellys über die Bilder hinweg. */
export interface CongaStep extends CongaDance {
  /** Wie sehr es gerade tanzt, von 0 bis 1. */
  presence: number;
}

/** Ein Jelly, das noch nicht tanzt. */
export function createCongaStep(): CongaStep {
  return { rank: 0, serverOffset: 0, presence: 0 };
}

/**
 * Legt den Schritt dieses Bildes auf `stand`, zusätzlich zu dessen Haltung. Mit `dance` blendet der
 * Tanz ein, ohne wieder aus, der letzte Platz gilt dabei weiter.
 *
 * @param seconds - Zeit seit dem letzten Bild.
 */
export function danceConga(
  stand: Object3D,
  step: CongaStep,
  dance: CongaDance | null,
  seconds: number,
) {
  if (dance) Object.assign(step, dance);
  const change = (dance ? seconds : -seconds) / EASE_SECONDS;
  step.presence = Math.min(1, Math.max(0, step.presence + change));
  if (step.presence === 0) return;
  const { rank, presence } = step;
  const pose = calculateCongaPose({ headId: 0, rank, presence }, Date.now() + step.serverOffset);
  stand.position.y += pose.lift * JELLY_HEIGHT * LIFT_SHARE;
  stand.rotation.y += pose.turn;
  stand.rotation.z += pose.tilt;
}

/**
 * Die zwei Blicke auf das Jelly: ganz oben auf der Seite und als großer Kopf im Fuß. Reine Zahlen
 * ohne Three.js, damit `index.ts` sie kennt, bevor die Szene geladen ist.
 *
 * @module
 */

/** Wo die Kamera steht und wohin sie schaut, in Einheiten der Szene. */
export interface CameraView {
  /** Öffnungswinkel in Grad, senkrecht. */
  fov: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

/** Das ganze Jelly. Etwas weiter als in der App, damit Hüpfer und Hände Platz haben. */
export const HERO_VIEW: CameraView = { fov: 32, position: [0, 0.2, 6.6], target: [0, 0.12, 0] };

/**
 * Nur der Kopf (`HEAD` in `@jelly/scene/geometry`: Mitte 0,66, Radius 0,62), von der Unterkante des
 * Bildes unter dem Mund angeschnitten. Der enge Winkel hält ihn trotz der Nähe unverzerrt.
 */
export const FOOTER_VIEW: CameraView = {
  fov: 14,
  position: [0, 0.84, 4.6],
  target: [0, 0.84, 0.2],
};

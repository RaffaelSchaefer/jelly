/**
 * A ring on the floor under the jelly the pointer is over, in the color of that jelly. It shows on
 * a personal screen what a click would hit before it is made. The big stage has no pointer.
 *
 * @module
 */

import { Mesh, MeshBasicMaterial, RingGeometry } from "three";

import type { JellySpot } from "./jellies.ts";

import { findPalette } from "./palette.ts";
import { FLAT_ORDER } from "./props.ts";

/** In jelly units: a jelly is about 1.7 wide, the ring lies just around its shadow. */
const RING = { inner: 0.98, outer: 1.16, around: 48, lift: 0.07 };
/** How fast the ring comes and goes, per second, how small it starts and how strong it shines. */
const GROW_RATE = 16;
const SMALLEST_SCALE = 0.7;
const OPACITY = 0.9;
/** Below this the ring is not drawn anymore. */
const GONE = 0.01;

/** The ring and how far it is there. */
export interface HoverRing {
  mesh: Mesh<RingGeometry, MeshBasicMaterial>;
  /** The jelly it is painted for. */
  playerId: number | null;
  /** 0 is gone, 1 is fully there. */
  size: number;
}

/** What {@link updateHoverRing} needs for a frame. */
export interface HoverRingFrame {
  /** The jelly under the pointer, undefined for none. */
  spot: JellySpot | undefined;
  seconds: number;
  reducedMotion: boolean;
}

/** Creates the ring, invisible at first. Its mesh belongs into the scene. */
export function createHoverRing(): HoverRing {
  const geometry = new RingGeometry(RING.inner, RING.outer, RING.around).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = FLAT_ORDER;
  mesh.visible = false;
  return { mesh, playerId: null, size: 0 };
}

/** Puts the ring under the hovered jelly. Without one it shrinks where it was. */
export function updateHoverRing(ring: HoverRing, frame: HoverRingFrame): void {
  const { spot } = frame;
  if (spot && spot.player.id !== ring.playerId) {
    ring.playerId = spot.player.id;
    ring.mesh.material.color.set(findPalette(spot.player.color).glow);
    // A new jelly gets a ring that grows again, so the change shows.
    ring.size = 0;
  }
  const step = frame.reducedMotion ? 1 : 1 - Math.exp(-GROW_RATE * frame.seconds);
  ring.size += ((spot ? 1 : 0) - ring.size) * step;
  if (!spot && ring.size < GONE) {
    ring.playerId = null;
  }
  ring.mesh.visible = ring.size > GONE;
  if (spot) {
    ring.mesh.position.set(spot.feet.x, spot.feet.y + RING.lift, spot.feet.z);
  }
  ring.mesh.scale.setScalar(SMALLEST_SCALE + (1 - SMALLEST_SCALE) * ring.size);
  ring.mesh.material.opacity = ring.size * OPACITY;
}

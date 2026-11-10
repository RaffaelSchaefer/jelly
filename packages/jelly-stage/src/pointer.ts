/**
 * The pointer on a personal screen: a small crystal turning over the spot the own jelly is heading
 * to, with a ring on the floor. A new goal sends a splash over the floor, so the click shows where
 * it landed. The pointer stays until the jelly has arrived. The big stage shows none.
 *
 * @module
 */

import {
  BackSide,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  RingGeometry,
  Vector2,
} from "three";

import type { StageMove, StagePoint } from "./types.ts";
import type { FloorPoint } from "./world.ts";

import { findPalette } from "./jellies.ts";
import { FLAT_ORDER } from "./props.ts";
import { createShadow } from "./shadow.ts";
import { isOnTheWay } from "./walking.ts";
import { toFloorPoint, type RoomSize } from "./world.ts";
import { findFloorHeight, type Placement } from "./zones.ts";

/** The crystal in jelly units: a long tip pointing at the floor and a short cap above it. */
const CRYSTAL = { radius: 0.5, tip: 1.3, cap: 0.38, facets: 6 };
/** The outline is the crystal again, slightly larger and seen from inside. */
const OUTLINE_SCALE = 1.15;
/** How high the middle of the crystal floats, and how it moves there. */
const FLOAT = { height: 1.45, swing: 0.16, swingRate: 2.6, turnRate: 1.5 };
const RING = { inner: 0.62, outer: 0.82, around: 48, lift: 0.08 };
const RIPPLE = { seconds: 1.3, growth: 1.1, opacity: 0.8 };
/** The splash of a new goal: how long it runs, how small it starts and how far it grows. */
const SPLASH = { seconds: 0.75, start: 0.5, growth: 2.8, opacity: 0.95 };
const CRYSTAL_SHADOW = {
  halfWidth: 0.2,
  halfDepth: 0.2,
  radius: 0.2,
  softness: 0.22,
  strength: 0.4,
};
/** How fast the pointer pops up and shrinks away, per second. */
const GROW_RATE = 11;
/** Below this size the pointer is not drawn anymore. */
const SMALLEST_SIZE = 0.01;

/** Everything the pointer is made of, and how far it is along. */
export interface StagePointer {
  root: Object3D;
  /** Everything but the splash, which grows on its own. */
  body: Object3D;
  crystal: Object3D;
  splash: Mesh<RingGeometry, MeshBasicMaterial>;
  /** Seconds since the last splash began. */
  splashTime: number;
  /** The goal of the last frame, to notice a new one. */
  goal: FloorPoint | null;
  ripple: Mesh<RingGeometry, MeshBasicMaterial>;
  fill: MeshLambertMaterial;
  outline: MeshBasicMaterial;
  ringFill: MeshBasicMaterial;
  /** The jelly color it is painted in. */
  color: string;
  /** 0 is gone, 1 is fully there. */
  size: number;
  /** Seconds it has been moving. */
  time: number;
}

/** What {@link updatePointer} needs for a frame. */
export interface PointerFrame {
  /** Where the own jelly is heading, null when it goes nowhere. */
  destination: StagePoint | null;
  /** The newest move of the own jelly. */
  move: StageMove | undefined;
  color: string;
  /** The stage platforms, where the floor is raised. */
  platforms: Placement[];
  room: RoomSize;
  serverTime: number;
  seconds: number;
  reducedMotion: boolean;
}

/** Creates the crystal with its outline, its middle at the origin of the returned object. */
function createCrystal(fill: MeshLambertMaterial, outline: MeshBasicMaterial): Object3D {
  const { radius, tip, cap, facets } = CRYSTAL;
  const middle = (tip + cap) / 2;
  const geometry = new LatheGeometry(
    [new Vector2(0, -middle), new Vector2(radius, tip - middle), new Vector2(0, middle)],
    facets,
  );
  const shell = new Mesh(geometry, outline);
  shell.scale.setScalar(OUTLINE_SCALE);
  const crystal = new Object3D();
  crystal.add(shell, new Mesh(geometry, fill));
  return crystal;
}

/** Creates a flat ring on the floor. */
function createRing(material: MeshBasicMaterial): Mesh<RingGeometry, MeshBasicMaterial> {
  const geometry = new RingGeometry(RING.inner, RING.outer, RING.around).rotateX(-Math.PI / 2);
  const ring = new Mesh(geometry, material);
  ring.position.y = RING.lift;
  ring.renderOrder = FLAT_ORDER;
  return ring;
}

/** Creates a ring material that can fade. It draws after the solid things, depth keeps it behind them. */
function createRingMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
}

/** Creates the pointer, invisible at first. Its root belongs into the scene. */
export function createPointer(): StagePointer {
  const fill = new MeshLambertMaterial({ flatShading: true, toneMapped: false });
  const outline = new MeshBasicMaterial({ side: BackSide, toneMapped: false });
  const ringFill = createRingMaterial();
  const crystal = createCrystal(fill, outline);
  const ripple = createRing(createRingMaterial());
  const splash = createRing(createRingMaterial());
  const body = new Object3D();
  body.add(createShadow(CRYSTAL_SHADOW), createRing(ringFill), ripple, crystal);
  const root = new Object3D();
  root.add(body, splash);
  root.visible = false;
  const splashTime = SPLASH.seconds;
  const looks = { fill, outline, ringFill, color: "", size: 0, time: 0 };
  return { root, body, crystal, splash, splashTime, goal: null, ripple, ...looks };
}

/** Paints the pointer like the own jelly. */
function paintPointer(pointer: StagePointer, color: string): void {
  if (pointer.color === color) return;
  const palette = findPalette(color);
  pointer.color = color;
  pointer.fill.color.set(palette.glow);
  pointer.outline.color.set(palette.outline);
  pointer.ringFill.color.set(palette.glow);
  pointer.ripple.material.color.set(palette.glow);
  pointer.splash.material.color.set(palette.glow);
}

/** Lets the crystal float and turn and a ripple run outward from the ring. */
function animatePointer(pointer: StagePointer): void {
  const { crystal, ripple, time } = pointer;
  crystal.position.y = FLOAT.height + FLOAT.swing * Math.sin(time * FLOAT.swingRate);
  crystal.rotation.y = time * FLOAT.turnRate;
  const share = (time / RIPPLE.seconds) % 1;
  ripple.scale.set(1 + share * RIPPLE.growth, 1, 1 + share * RIPPLE.growth);
  ripple.material.opacity = (1 - share) * RIPPLE.opacity;
}

/** Starts a splash for a new goal and lets it run. Reduced motion shows none. */
function splashGoal(pointer: StagePointer, goal: FloorPoint | null, frame: PointerFrame): boolean {
  const isNew = goal !== null && (pointer.goal?.x !== goal.x || pointer.goal.z !== goal.z);
  pointer.goal = goal;
  if (isNew) pointer.splashTime = 0;
  const share = pointer.splashTime / SPLASH.seconds;
  const isRunning = share < 1 && !frame.reducedMotion;
  pointer.splash.visible = isRunning;
  if (!isRunning) return false;
  const scale = SPLASH.start + share * SPLASH.growth;
  pointer.splash.scale.set(scale, 1, scale);
  pointer.splash.material.opacity = (1 - share) ** 2 * SPLASH.opacity;
  pointer.splashTime += frame.seconds;
  return true;
}

/** Shows the pointer while the own jelly is on its way and lets it shrink away on arrival. */
export function updatePointer(pointer: StagePointer, frame: PointerFrame): void {
  const goal = frame.destination && toFloorPoint(frame.destination, frame.room);
  const wanted = goal && isOnTheWay(frame.move, goal, frame.serverTime, frame.room) ? 1 : 0;
  const step = frame.reducedMotion ? 1 : 1 - Math.exp(-GROW_RATE * frame.seconds);
  pointer.size += (wanted - pointer.size) * step;
  const isSplashing = splashGoal(pointer, goal, frame);
  pointer.body.visible = pointer.size > SMALLEST_SIZE;
  pointer.root.visible = pointer.body.visible || isSplashing;
  if (!pointer.root.visible) return;
  // Without a goal it shrinks where it stands.
  if (goal) pointer.root.position.set(goal.x, findFloorHeight(goal, frame.platforms), goal.z);
  pointer.body.scale.setScalar(pointer.size);
  paintPointer(pointer, frame.color);
  if (!frame.reducedMotion) pointer.time += frame.seconds;
  animatePointer(pointer);
}

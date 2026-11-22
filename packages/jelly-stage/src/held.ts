/**
 * Where a jelly wears its cosmetics: head and face move with the head, a plushie follows both
 * hands, paws sit on each hand and the rest stays with the body. The same places as in the app.
 *
 * @module
 */

import {
  boardPose,
  createCosmetic,
  disposeCosmetic,
  HAND,
  hasCosmeticModel,
  isWornOnHands,
  type CosmeticLook,
  type Jelly,
} from "@jelly/scene";
import { Object3D, type BufferGeometry } from "three";

import type { StagePlayer } from "./types.ts";

/** Every slot the stage draws. */
export const WORN_SLOTS = ["head", "face", "hands", "body", "aura"];

/** The holders a jelly wears its cosmetics in, all inside its root. */
export interface Wearer {
  jelly: Jelly;
  /** Follows the middle between both hands. */
  held: Object3D;
  /** Undoes the resting place of the hands, models are built around them. */
  heldModel: Object3D;
  /** One per hand, following its place and size. */
  paws: Object3D[];
}

/** Adds the holders for held and hand-worn cosmetics to `jelly`. */
export function createWearer(jelly: Jelly): Wearer {
  const held = new Object3D();
  const heldModel = new Object3D();
  heldModel.position.set(0, -HAND.y, 0);
  held.add(heldModel);
  const paws = jelly.hands.map(() => new Object3D());
  jelly.root.add(held, ...paws);
  return { jelly, held, heldModel, paws };
}

/** The holders that `key` in `slot` goes into. Paws need one model per hand. */
function holdersFor(wearer: Wearer, slot: string, key: string): Object3D[] {
  if (slot === "head" || slot === "face") return [wearer.jelly.faceAnchor];
  if (slot !== "hands") return [wearer.jelly.root];
  return isWornOnHands(key) ? wearer.paws : [wearer.heldModel];
}

/** Puts `model` into the holders of its slot and returns every copy. */
export function wearCosmetic(
  wearer: Wearer,
  model: BufferGeometry,
  ink: string,
  wish: { key: string; slot: string; look: CosmeticLook },
): Object3D[] {
  return holdersFor(wearer, wish.slot, wish.key).map((holder) => {
    // Real depth here: with the sticker of the app a jelly would stand in front of the couch.
    const cosmetic = createCosmetic(model, ink, "depth", wish.look);
    holder.add(cosmetic);
    return cosmetic;
  });
}

/** Takes off every copy of a cosmetic. */
export function takeOff(copies: Object3D[]): void {
  for (const cosmetic of copies) {
    cosmetic.removeFromParent();
    disposeCosmetic(cosmetic);
  }
}

/** Whether the jelly holds something with a model, so it keeps its hands out like the app. */
export function holdsModel(player: StagePlayer): boolean {
  const key = player.equipped.hands?.key;
  return Boolean(key && hasCosmeticModel(key));
}

/** Moves the holders after the hands, once per frame after the jelly was animated. */
export function followHands({ jelly, held, paws }: Wearer): void {
  const [left, right] = jelly.hands;
  if (!left || !right) return;
  const pose = boardPose(left.position, right.position);
  held.position.set(pose.x, pose.y, 0);
  held.rotation.z = pose.tilt;
  jelly.hands.forEach((hand, index) => {
    const paw = paws[index];
    if (!paw) return;
    paw.position.copy(hand.position);
    paw.scale.copy(hand.scale);
    paw.visible = hand.visible;
  });
}

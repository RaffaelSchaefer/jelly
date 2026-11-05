/**
 * Was das Jelly in den Händen trägt: Es folgt ihnen wie die Tafel in `SignBoard.tsx`.
 *
 * @module
 */

import type { Object3D } from "three";

import { HAND, type Jelly } from "@jelly/scene";
import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";

import { boardPose } from "../pet";

/**
 * Muss in der Wurzel des Jellys liegen: Es liest die Lage der Hände im selben Koordinatensystem.
 * Modelle entstehen um die Hände in Ruhe. Der innere Versatz hebt die Lage auf, die sie dort haben,
 * so bleibt ein Modell an seinem Platz und dreht sich nur um die Mitte zwischen ihnen.
 */
export default function HandHeld({ jelly, children }: { jelly: Jelly; children: ReactNode }) {
  const holder = useRef<Object3D>(null);

  useFrame(() => {
    if (!holder.current) return;
    const pose = boardPose(jelly.hands[0]!.position, jelly.hands[1]!.position);
    holder.current.position.set(pose.x, pose.y, 0);
    holder.current.rotation.z = pose.tilt;
  });

  return (
    <object3D ref={holder}>
      <object3D position={[0, -HAND.y, 0]}>{children}</object3D>
    </object3D>
  );
}

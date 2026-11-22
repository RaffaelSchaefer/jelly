/**
 * Was das Jelly in den Händen trägt: Es folgt ihnen wie die Tafel in `SignBoard.tsx`. Was es an den
 * Händen trägt, folgt jeder Hand einzeln.
 *
 * @module
 */

import type { Object3D } from "three";

import { boardPose, HAND, type Jelly } from "@jelly/scene";
import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";

/** Die beiden Hände eines Jellys, links und rechts. */
const HAND_INDICES = [0, 1] as const;

/**
 * Muss in der Wurzel des Jellys liegen: Es liest die Lage der Hände im selben Koordinatensystem.
 * Modelle entstehen um die Hände in Ruhe. Der innere Versatz hebt die Lage auf, die sie dort haben,
 * so bleibt ein Modell an seinem Platz und dreht sich nur um die Mitte zwischen ihnen.
 */
export default function HandHeld({
  jelly,
  visible = true,
  children,
}: {
  jelly: Jelly;
  /** Ausgeblendet bleibt das Modell geladen, etwa solange die Hände eine Tafel halten. */
  visible?: boolean;
  children: ReactNode;
}) {
  const holder = useRef<Object3D>(null);

  useFrame(() => {
    if (!holder.current) return;
    const pose = boardPose(jelly.hands[0]!.position, jelly.hands[1]!.position);
    holder.current.position.set(pose.x, pose.y, 0);
    holder.current.rotation.z = pose.tilt;
  });

  return (
    <object3D ref={holder} visible={visible}>
      <object3D position={[0, -HAND.y, 0]}>{children}</object3D>
    </object3D>
  );
}

/**
 * Was das Jelly an den Händen trägt, wie Pfoten: dasselbe Modell an jeder Hand, um den Ursprung
 * modelliert. Es folgt Lage und Größe seiner Hand, so bleibt es auch beim Winken an ihr. Muss in
 * der Wurzel des Jellys liegen wie {@link HandHeld}.
 */
export function HandWorn({
  jelly,
  visible = true,
  children,
}: {
  jelly: Jelly;
  /** Ausgeblendet bleibt das Modell geladen, etwa solange die Hände eine Tafel halten. */
  visible?: boolean;
  children: ReactNode;
}) {
  const holders = useRef<(Object3D | null)[]>([]);

  useFrame(() => {
    jelly.hands.forEach((hand, index) => {
      const holder = holders.current[index];
      if (!holder) return;
      holder.position.copy(hand.position);
      holder.scale.copy(hand.scale);
      holder.visible = visible && hand.visible;
    });
  });

  return HAND_INDICES.map((index) => (
    <object3D
      key={index}
      ref={(holder) => {
        holders.current[index] = holder;
      }}
    >
      {children}
    </object3D>
  ));
}

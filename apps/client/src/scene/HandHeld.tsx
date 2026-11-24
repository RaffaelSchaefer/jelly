/**
 * Was das Jelly in den Händen trägt: Es folgt ihnen wie die Tafel in `SignBoard.tsx`. Was es an den
 * Händen trägt, folgt jeder seiner Hände einzeln.
 *
 * @module
 */

import type { Object3D } from "three";

import { boardPose, holdRest, type Hold, type Jelly } from "@jelly/scene";
import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";

/**
 * Muss in der Wurzel des Jellys liegen: Es liest die Lage der Hände im selben Koordinatensystem.
 * Modelle entstehen um die Hände in Ruhe, so wie `hold` sie hinlegt. Der innere Versatz hebt die
 * Mitte zwischen ihnen dort auf, so bleibt ein Modell an seinem Platz und dreht sich nur um sie.
 */
export default function HandHeld({
  jelly,
  hold,
  visible = true,
  children,
}: {
  jelly: Jelly;
  /** Wie die Hände es halten (`holdOf` aus `@jelly/scene`). */
  hold: Hold;
  /** Ausgeblendet bleibt das Modell geladen, etwa solange die Hände eine Tafel halten. */
  visible?: boolean;
  children: ReactNode;
}) {
  const holder = useRef<Object3D>(null);
  const rest = holdRest(hold);

  useFrame(() => {
    if (!holder.current) return;
    const pose = boardPose(jelly.hands[0]!.position, jelly.hands[1]!.position, hold);
    holder.current.position.set(pose.x, pose.y, 0);
    holder.current.rotation.z = pose.tilt - rest.tilt;
  });

  return (
    <object3D ref={holder} visible={visible}>
      <object3D position={[-rest.x, -rest.y, 0]}>{children}</object3D>
    </object3D>
  );
}

/**
 * Was das Jelly an den Händen trägt, wie Pfoten oder den Schild: dasselbe Modell an jeder seiner
 * Hände, um den Ursprung modelliert. Es folgt Lage und Größe seiner Hand, so bleibt es auch beim
 * Winken an ihr. Muss in der Wurzel des Jellys liegen wie {@link HandHeld}.
 */
export function HandWorn({
  jelly,
  hands,
  visible = true,
  children,
}: {
  jelly: Jelly;
  /** An welchen Händen, 0 links, 1 rechts (`handsOf` aus `@jelly/scene`). */
  hands: readonly number[];
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

  return hands.map((index) => (
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

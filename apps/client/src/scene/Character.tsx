/**
 * Das animierte Pet: Jelly-Körper, Hände, Gesicht und angelegtes Cosmetic.
 *
 * Hier wird nur zusammengesteckt und verdrahtet. Die Bewegung selbst steht in `animation.ts`.
 *
 * @module
 */

import type { Group, Mesh } from "three";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

import { COSMETICS, type PetColor } from "../pet";
import { animateBody, animateFace, animateHands, createMotion, startFrame } from "./animation";
import Cosmetic from "./Cosmetic";
import Face from "./Face";
import JellyBody from "./JellyBody";
import { HAND, HEAD } from "./jellyGeometry";

/** Eigenschaften des Pets in der Szene. */
export interface CharacterProps {
  /** Farbvariante. */
  color: PetColor;
  /** Zähler, der bei jeder belohnten Aktion steigt. Jede Änderung löst einen Hüpfer aus. */
  pulse: number;
  /** Bewegung auf das Nötigste reduzieren. */
  reducedMotion: boolean;
  /** Hält er gerade etwas? Dann bleiben die Hände draußen. */
  holding?: boolean;
  /** ID des angelegten Cosmetics. */
  cosmetic?: string | null;
}

/** Das Pet mit allen Teilen. Muss innerhalb von `<Canvas>` stehen. */
export default function Character({
  color,
  pulse,
  reducedMotion,
  holding = false,
  cosmetic = null,
}: CharacterProps) {
  const worn = COSMETICS.find((item) => item.id === cosmetic);
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const hands = useRef<(Group | null)[]>([]);
  const eyes = useRef<(Group | null)[]>([]);
  const cheeks = useRef<(Mesh | null)[]>([]);
  const mouth = useRef<Mesh | null>(null);
  const motion = useRef(createMotion(pulse));

  useFrame(({ clock }, rawDelta) => {
    if (!root.current || !head.current) return;
    const s = motion.current;
    const frame = startFrame(s, { time: clock.elapsedTime, rawDelta, pulse, reducedMotion });
    animateBody(root.current, head.current, frame);
    animateFace({ eyes: eyes.current, cheeks: cheeks.current, mouth: mouth.current }, s, frame);
    animateHands(hands.current, s, frame, holding);
  });

  return (
    <group ref={root}>
      {/* Körper, Kopf und Hände sind ein Jelly. Es liest, wo die Kopf- und Handgruppen stehen. */}
      <JellyBody color={color} head={head} hands={hands} />
      {[-1, 1].map((side, index) => (
        <group
          key={side}
          ref={(node) => {
            hands.current[index] = node;
          }}
          position={[side * HAND.x, HAND.y, HAND.z]}
          scale={0}
          visible={false}
        />
      ))}
      <group ref={head} position={[HEAD.x, HEAD.y, HEAD.z]}>
        <group position={[-HEAD.x, -HEAD.y, -HEAD.z]}>
          <Face color={color} eyes={eyes} mouth={mouth} cheeks={cheeks} />
          {/* Kopf- und Gesichts-Cosmetics wippen mit dem Kopf, Effekte bleiben beim Körper. */}
          {worn && worn.slot !== "Effekte" ? <Cosmetic id={worn.id} color={color} /> : null}
        </group>
      </group>
      {worn?.slot === "Effekte" ? <Cosmetic id={worn.id} color={color} /> : null}
    </group>
  );
}

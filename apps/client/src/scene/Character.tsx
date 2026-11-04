/**
 * Das animierte Pet: das Jelly aus `@jelly/scene`, sein angelegtes Cosmetic und sein Schild.
 *
 * Hier wird nur verdrahtet. Bau und Bewegung des Jellys stehen in `packages/jelly-scene`, das auch
 * die Bühne des Servers nutzt.
 *
 * @module
 */

import type { Group } from "three";

import {
  animateJelly,
  createJelly,
  createMotion,
  disposeJelly,
  isEmoteKey,
  isPartnerMotionKey,
  partnerPose,
  restPose,
  type DuetRole,
  type Jelly,
} from "@jelly/scene";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";

import type { ActiveEmote } from "../useEmotes";
import type { ActiveVoice } from "../useJellyVoice";

import { COSMETICS, mouthAt, PET_COLORS, type PetColor } from "../pet";
import Cosmetic from "./Cosmetic";
import SignBoard from "./SignBoard";

/** Die Mundform dieses Bildes. Bei reduzierter Bewegung lächelt das Jelly nur. */
function currentMouth(
  voiced: RefObject<ActiveVoice | null> | undefined,
  role: DuetRole,
  reducedMotion: boolean,
) {
  const active = voiced?.current;
  if (!active || reducedMotion) return;
  return mouthAt(role === "partner" ? active.partnerNotes : active.notes, active.elapsed());
}

/**
 * Stellt die Hülle um das Jelly für ein Partner-Emote auf. Das Jelly selbst bewegt seine
 * Grundanimation, so wie auf der Bühne des Servers bekommt die Geste deshalb eine eigene Ebene
 * darüber.
 */
function poseStand(
  stand: Group,
  emote: ActiveEmote | null | undefined,
  role: DuetRole,
  reducedMotion: boolean,
) {
  const pose =
    emote && isPartnerMotionKey(emote.key)
      ? partnerPose(
          {
            key: emote.key,
            elapsed: (performance.now() - emote.startedAt) / 1000,
            role: emote.partner ? role : "solo",
          },
          reducedMotion,
        )
      : restPose(role);
  stand.position.set(pose.x, pose.lift, 0);
  stand.rotation.set(0, pose.turn, pose.tilt);
  stand.scale.setScalar(pose.scale);
}

/** Eigenschaften des Pets in der Szene. */
export interface CharacterProps {
  /** Farbvariante. */
  color: PetColor;
  /** Zähler, der bei jeder belohnten Aktion steigt. Jede Änderung löst einen Hüpfer aus. */
  pulse: number;
  /** Bewegung auf das Nötigste reduzieren. */
  reducedMotion: boolean;
  /** Text auf der Tafel in seinen Händen. Solange er eine hält, bleiben die Hände draußen. */
  sign?: string | null;
  /** ID des angelegten Cosmetics. */
  cosmetic?: string | null;
  /** Bekommt das aktuelle Jelly, etwa für die Anker des Studios. Sollte stabil sein. */
  onJelly?: (jelly: Jelly | null) => void;
  /** Lokal bestätigte Geste, unabhängig von der Szenenuhr. */
  emote?: ActiveEmote | null;
  /** Was er gerade formt. Sein Mund folgt den Vokalen. */
  voiced?: RefObject<ActiveVoice | null>;
  /** Welchen Platz es im Duett eines Partner-Emotes einnimmt. */
  role?: DuetRole;
}

/** Das Pet mit allen Teilen. Muss innerhalb von `<Canvas>` stehen. */
export default function Character({
  color,
  pulse,
  reducedMotion,
  sign = null,
  cosmetic = null,
  onJelly,
  emote,
  voiced,
  role = "own",
}: CharacterProps) {
  const worn = COSMETICS.find((item) => item.id === cosmetic);
  const jelly = useMemo(() => createJelly(PET_COLORS[color]), [color]);
  const motion = useRef(createMotion(pulse));
  const stand = useRef<Group>(null);
  const invalidate = useThree((state) => state.invalidate);

  // Beginn und Ende auch zeichnen, wenn reduzierte Bewegung die Animationsuhr anhält.
  useEffect(() => invalidate(), [emote, sign, invalidate]);

  // Fiber gibt `<primitive>`-Objekte nie selbst frei.
  useEffect(() => () => disposeJelly(jelly), [jelly]);

  useEffect(() => {
    onJelly?.(jelly);
    return () => onJelly?.(null);
  }, [jelly, onJelly]);

  // Priorität -1: Vor den Kindern, damit die Tafel die Hände desselben Bildes liest. Eine positive
  // Priorität würde das Zeichnen von Fiber abschalten.
  useFrame(({ clock }, rawDelta) => {
    animateJelly(jelly, motion.current, {
      time: clock.elapsedTime,
      rawDelta,
      pulse,
      reducedMotion,
      holding: Boolean(sign),
      emote:
        emote && isEmoteKey(emote.key)
          ? { key: emote.key, elapsed: (performance.now() - emote.startedAt) / 1000 }
          : undefined,
      mouth: currentMouth(voiced, role, reducedMotion),
    });
    if (stand.current) poseStand(stand.current, emote, role, reducedMotion);
  }, -1);

  return (
    <group ref={stand}>
      <primitive object={jelly.root}>
        {/* Kopf- und Gesichts-Cosmetics wippen mit dem Kopf, Effekte bleiben beim Körper. */}
        {worn && worn.slot !== "Effekte"
          ? createPortal(<Cosmetic id={worn.id} color={color} />, jelly.faceAnchor)
          : null}
        {worn?.slot === "Effekte" ? <Cosmetic id={worn.id} color={color} /> : null}
        <SignBoard jelly={jelly} label={sign} color={color} reducedMotion={reducedMotion} />
      </primitive>
    </group>
  );
}

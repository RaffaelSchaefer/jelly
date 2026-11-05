/**
 * Das animierte Pet: das Jelly aus `@jelly/scene`, seine Cosmetics und sein Schild.
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
  hasCosmeticModel,
  isEmoteKey,
  isPartnerMotionKey,
  partnerPose,
  restPose,
  type DuetRole,
  type Jelly,
  type JellyQuality,
} from "@jelly/scene";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";

import type { ActiveEmote } from "../useEmotes";
import type { ActiveVoice } from "../useJellyVoice";

import {
  mouthAt,
  PET_COLORS,
  wornCosmetics,
  type CosmeticSlot,
  type Equipped,
  type PetColor,
} from "../pet";
import Cosmetic from "./Cosmetic";
import HandHeld from "./HandHeld";
import SignBoard from "./SignBoard";

/** Ein Jelly ohne Angabe trägt nichts. */
const NOTHING_WORN: Equipped = {};

/** So lange läuft ein Stupser nach: Die Hände bleiben 1,6 s draußen, das Strahlen klingt vorher ab. */
const POKE_SETTLE_MS = 1800;

/** Abstand der Bilder währenddessen, wenn die Animationsuhr steht. */
const SETTLE_FRAME_MS = 100;

/**
 * Bei reduzierter Bewegung steht die Uhr, nach einem Stupser müssen Strahlen und Hände aber noch
 * sichtbar auslaufen. Darum gibt es für diese kurze Zeit eigene Bilder, sonst keine.
 */
function useSettlingFrames(pulse: number, reducedMotion: boolean) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!reducedMotion) return;
    invalidate();
    const timer = window.setInterval(invalidate, SETTLE_FRAME_MS);
    const stop = window.setTimeout(() => window.clearInterval(timer), POKE_SETTLE_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [pulse, reducedMotion, invalidate]);
}

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

/**
 * Was das Jelly trägt. Muss in seiner Wurzel liegen: Kopf- und Gesichts-Cosmetics wippen mit dem
 * Kopf, die für die Hände folgen ihnen, der Rest bleibt beim Körper.
 */
function WornCosmetics({
  jelly,
  worn,
  color,
}: {
  jelly: Jelly;
  worn: ReturnType<typeof wornCosmetics>;
  color: PetColor;
}) {
  const draw = (slots: CosmeticSlot[]) =>
    worn
      .filter((item) => slots.includes(item.slot))
      .map((item) => <Cosmetic key={item.id} id={item.id} color={color} />);
  return (
    <>
      {createPortal(draw(["head", "face"]), jelly.faceAnchor)}
      <HandHeld jelly={jelly}>{draw(["hands"])}</HandHeld>
      {draw(["body", "aura"])}
    </>
  );
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
  /** Was das Jelly trägt, je Platz. */
  equipped?: Equipped;
  /** Bekommt das aktuelle Jelly, etwa für die Anker des Studios. Sollte stabil sein. */
  onJelly?: (jelly: Jelly | null) => void;
  /** Lokal bestätigte Geste, unabhängig von der Szenenuhr. */
  emote?: ActiveEmote | null;
  /** Was er gerade formt. Sein Mund folgt den Vokalen. */
  voiced?: RefObject<ActiveVoice | null>;
  /** Welchen Platz es im Duett eines Partner-Emotes einnimmt. */
  role?: DuetRole;
  /** Welchen Körper-Shader es bekommt. Ein Wechsel baut das Jelly neu auf, wie bei der Farbe. */
  quality?: JellyQuality;
}

/** Das Pet mit allen Teilen. Muss innerhalb von `<Canvas>` stehen. */
export default function Character({
  color,
  pulse,
  reducedMotion,
  sign = null,
  equipped = NOTHING_WORN,
  onJelly,
  emote,
  voiced,
  role = "own",
  quality = "full",
}: CharacterProps) {
  const worn = wornCosmetics(equipped);
  // Ohne Modell zeigt ein Cosmetic nichts, dann hielte das Jelly leere Hände hin.
  const holdsModel = worn.some((item) => item.slot === "hands" && hasCosmeticModel(item.id));
  const holding = Boolean(sign) || holdsModel;
  const jelly = useMemo(() => createJelly(PET_COLORS[color], quality), [color, quality]);
  const motion = useRef(createMotion(pulse));
  const stand = useRef<Group>(null);
  const invalidate = useThree((state) => state.invalidate);

  // Jede Änderung auch zeichnen, wenn reduzierte Bewegung die Animationsuhr anhält.
  useEffect(() => invalidate(), [emote, sign, holding, jelly, equipped, invalidate]);
  useSettlingFrames(pulse, reducedMotion);

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
      holding,
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
        <WornCosmetics jelly={jelly} worn={worn} color={color} />
        <SignBoard jelly={jelly} label={sign} color={color} reducedMotion={reducedMotion} />
      </primitive>
    </group>
  );
}

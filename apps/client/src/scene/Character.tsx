/**
 * Das animierte Pet: das Jelly aus `@jelly/scene` und sein angelegtes Cosmetic.
 *
 * Hier wird nur verdrahtet. Bau und Bewegung des Jellys stehen in `packages/jelly-scene`, das auch
 * die Bühne des Servers nutzt.
 *
 * @module
 */

import { animateJelly, createJelly, createMotion, disposeJelly, type Jelly } from "@jelly/scene";
import { createPortal, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

import { COSMETICS, PET_COLORS, type PetColor } from "../pet";
import Cosmetic from "./Cosmetic";

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
  /** Bekommt das aktuelle Jelly, etwa für die Anker des Studios. Sollte stabil sein. */
  onJelly?: (jelly: Jelly | null) => void;
}

/** Das Pet mit allen Teilen. Muss innerhalb von `<Canvas>` stehen. */
export default function Character({
  color,
  pulse,
  reducedMotion,
  holding = false,
  cosmetic = null,
  onJelly,
}: CharacterProps) {
  const worn = COSMETICS.find((item) => item.id === cosmetic);
  const jelly = useMemo(() => createJelly(PET_COLORS[color]), [color]);
  const motion = useRef(createMotion(pulse));

  // Fiber gibt `<primitive>`-Objekte nie selbst frei.
  useEffect(() => () => disposeJelly(jelly), [jelly]);

  useEffect(() => {
    onJelly?.(jelly);
    return () => onJelly?.(null);
  }, [jelly, onJelly]);

  useFrame(({ clock }, rawDelta) => {
    animateJelly(jelly, motion.current, {
      time: clock.elapsedTime,
      rawDelta,
      pulse,
      reducedMotion,
      holding,
    });
  });

  return (
    <primitive object={jelly.root}>
      {/* Kopf- und Gesichts-Cosmetics wippen mit dem Kopf, Effekte bleiben beim Körper. */}
      {worn && worn.slot !== "Effekte"
        ? createPortal(<Cosmetic id={worn.id} color={color} />, jelly.faceAnchor)
        : null}
      {worn?.slot === "Effekte" ? <Cosmetic id={worn.id} color={color} /> : null}
    </primitive>
  );
}

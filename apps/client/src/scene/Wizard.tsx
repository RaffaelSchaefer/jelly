/**
 * Der Zauberer im Shop: ein Jelly in eigenen Farben mit Spitzhut, Bart und schwebender
 * Kristallkugel. Seine Lider hängen ein wenig, beim Dösen sinkt der Kopf.
 *
 * Gesten, Stimme und Sätze kommen von außen (`shop/useWizard.ts`). Die Modelle trägt nur er, sie
 * kommen aus `@jelly/scene/wizard` und nicht aus dem Katalog.
 *
 * @module
 */

import type { Jelly, JellyQuality } from "@jelly/scene";
import type { Object3D } from "three";

import { loadWizardPart, WIZARD_PALETTE } from "@jelly/scene/wizard";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type RefObject } from "react";
import { MathUtils } from "three";

import type { ActiveEmote } from "../useEmotes";
import type { ActiveVoice } from "../useJellyVoice";

import Character from "./Character";
import { Sticker } from "./Cosmetic";

/** Wie weit seine Augen offen stehen, als Anteil der normalen Höhe: alt und ein wenig müde. */
const HALF_LID = 0.62;

/** Wie tief der Kopf beim Dösen sinkt und wie weit er sich zur Seite neigt. */
const DOZE_DROP = 0.12;
const DOZE_TILT = 0.16;

/** Wie schnell er einnickt und aufwacht, pro Sekunde. */
const DOZE_SPEED = 3;

/** Wo die Kugel neben ihm schwebt, in seinen Koordinaten, und wie weit sie auf und ab steigt. */
const ORB_AT = { x: -1.42, y: -0.02, z: 0.5 } as const;
const ORB_FLOAT = 0.06;

// Einmal je Modul: Alle Zauberer teilen dieselben Promises, so wartet React nicht erneut.
const HAT = loadWizardPart("hat");
const FACE = loadWizardPart("face");
const ORB = loadWizardPart("orb");

/**
 * Macht das Gesicht alt: halb geschlossene Lider, beim Dösen geschlossene Augen und ein gesunkener
 * Kopf. Läuft nach `animateJelly`, das Augen und Kopf jedes Bild neu setzt.
 *
 * @param doze - 0 wach, 1 eingenickt.
 */
function ageFace(jelly: Jelly, doze: number) {
  const { eyes, eyeShapes } = jelly.face;
  for (const eye of eyes) {
    if (doze > 0.5) {
      eye.geometry = eyeShapes.closed;
      eye.scale.y = 1;
    } else if (eye.geometry === eyeShapes.open) {
      eye.scale.y *= HALF_LID;
    }
  }
  jelly.head.position.y -= DOZE_DROP * doze;
  jelly.head.rotation.z += DOZE_TILT * doze;
}

/** Die Kristallkugel. Sie schwebt für sich: Das Jelly hüpft und staucht, sie bleibt ruhig. */
function Orb({ reducedMotion }: { reducedMotion: boolean }) {
  const orb = useRef<Object3D>(null);
  useFrame(({ clock }) => {
    const lift = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 1.4) * ORB_FLOAT;
    orb.current?.position.set(ORB_AT.x, ORB_AT.y + lift, ORB_AT.z);
  });
  return (
    <object3D ref={orb} position={[ORB_AT.x, ORB_AT.y, ORB_AT.z]}>
      <Sticker model={ORB} ink={WIZARD_PALETTE.outline} />
    </object3D>
  );
}

/** Eigenschaften von {@link Wizard}. */
export interface WizardProps {
  /** Die laufende Geste, etwa Winken zur Begrüßung. */
  emote: ActiveEmote | null;
  /** Was er gerade sagt. Sein Mund folgt den Vokalen. */
  voiced: RefObject<ActiveVoice | null>;
  /** Ob er eingenickt ist. */
  dozing: boolean;
  reducedMotion: boolean;
  quality: JellyQuality;
}

/** Der Zauberer mit Hut, Bart und Kugel. Muss innerhalb von `<Canvas>` stehen. */
export default function Wizard({ emote, voiced, dozing, reducedMotion, quality }: WizardProps) {
  const [jelly, setJelly] = useState<Jelly | null>(null);
  const doze = useRef(dozing ? 1 : 0);
  const invalidate = useThree((state) => state.invalidate);

  // Bei reduzierter Bewegung steht die Uhr: Einnicken und Aufwachen brauchen dann ein eigenes Bild.
  useEffect(() => invalidate(), [dozing, invalidate]);

  // Priorität 0: nach dem Jelly (-1), dessen Animation Augen und Kopf jedes Bild zurücksetzt.
  useFrame((_, delta) => {
    if (!jelly) return;
    const goal = dozing ? 1 : 0;
    doze.current = reducedMotion ? goal : MathUtils.damp(doze.current, goal, DOZE_SPEED, delta);
    ageFace(jelly, doze.current);
  });

  return (
    <>
      <Character
        color="mint"
        palette={WIZARD_PALETTE}
        pulse={0}
        {...{ emote, voiced, reducedMotion, quality }}
        onJelly={setJelly}
      />
      {jelly
        ? createPortal(
            <>
              <Sticker model={HAT} ink={WIZARD_PALETTE.outline} />
              <Sticker model={FACE} ink={WIZARD_PALETTE.outline} />
            </>,
            jelly.faceAnchor,
          )
        : null}
      <Orb reducedMotion={reducedMotion} />
    </>
  );
}

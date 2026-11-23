/**
 * Funkelbart, der Zauberer im Shop: ein Jelly in eigenen Farben mit Spitzhut, Haar und Bart, Robe
 * und Kristallkugel, und solange er zeigt, mit einem Zauberstab. Seine Lider hängen schwer, er
 * folgt mit den Augen, was die Kundschaft ansieht, und lebt mit eigenen Gesten.
 *
 * Gesten, Stimme und Sätze kommen von außen (`shop/useWizard.ts`) als Haltung (`WizardPose`), die
 * `WizardRig.tsx` Bild für Bild umsetzt. Die Teile trägt nur er, sie kommen aus
 * `@jelly/scene/wizard` und nicht aus dem Katalog (`WizardParts.tsx`).
 *
 * @module
 */

import type { Jelly, JellyQuality } from "@jelly/scene";

import { WIZARD_PALETTE } from "@jelly/scene/wizard";
import { useThree } from "@react-three/fiber";
import { createRef, useEffect, useRef, useState, type RefObject } from "react";

import type { ActiveEmote } from "../useEmotes";
import type { ActiveVoice } from "../useJellyVoice";

import { RESTING_POSE, type WizardPose } from "../pet/wizardScripts";
import Character from "./Character";
import { WizardHead, WizardOrb, WizardRobe, WizardWand, type WizardHolders } from "./WizardParts";
import WizardRig from "./WizardRig";

/** Neue, leere Halter für Hut, Bart, Kugel, Brauen und Schnurrbart. */
function createHolders(): WizardHolders {
  return {
    hat: createRef(),
    beard: createRef(),
    orb: createRef(),
    ball: createRef(),
    crystal: createRef(),
    brows: [createRef(), createRef()],
    mustache: [createRef(), createRef()],
  };
}

/** Ohne Haltung von außen ruht er und schläft, solange `dozing` gilt. */
function useOwnPose(pose: RefObject<WizardPose> | undefined, dozing: boolean) {
  const own = useRef<WizardPose>({ ...RESTING_POSE });
  useEffect(() => {
    if (pose) return;
    const asleepSince = dozing ? performance.now() : null;
    own.current = { ...RESTING_POSE, mood: dozing ? "asleep" : "neutral", asleepSince };
  }, [pose, dozing]);
  return pose ?? own;
}

/**
 * Zeichnet, wenn sich die Haltung ändert. Bei reduzierter Bewegung steht die Uhr: Dann braucht auch
 * das Lösen eines Zaubers und das Ende einer Geste eigene Bilder.
 */
function usePoseFrames(
  pose: RefObject<WizardPose>,
  version: number,
  dozing: boolean,
  reducedMotion: boolean,
) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const redraw = () => invalidate();
    redraw();
    const gesture = pose.current.gesture;
    if (!reducedMotion || !gesture) return;
    const moments = [gesture.releaseAt, gesture.seconds].filter(
      (seconds): seconds is number => seconds !== undefined && Number.isFinite(seconds),
    );
    const timers = moments.map((seconds) => {
      const left = gesture.startedAt + seconds * 1000 - performance.now();
      return window.setTimeout(redraw, Math.max(0, left) + 20);
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [pose, version, dozing, reducedMotion, invalidate]);
}

/** Eigenschaften von {@link Wizard}. */
export interface WizardProps {
  /** Eine geteilte Geste, etwa das Zeigen. Dabei hält er den Zauberstab. */
  emote: ActiveEmote | null;
  /** Was er gerade sagt. Sein Mund folgt den Vokalen. */
  voiced: RefObject<ActiveVoice | null>;
  /** Ob er eingenickt ist. Ohne `pose` schläft er dann. */
  dozing: boolean;
  reducedMotion: boolean;
  quality: JellyQuality;
  /** Steigt mit jedem Kauf: Der Kern der Kristallkugel flammt auf. */
  pulse?: number;
  /** Seine Haltung: eigene Geste, Stimmung, Blick und Schlaf, Bild für Bild gelesen. */
  pose?: RefObject<WizardPose>;
  /** Steigt, wenn sich die Haltung ändert. */
  poseVersion?: number;
  /** Bekommt jedes Bild, wie weit die Kugel über ihrer Ruhelage steht, für Licht und Schein. */
  orbLift?: RefObject<number>;
}

/** Der Zauberer mit allen Teilen. Muss innerhalb von `<Canvas>` stehen. */
export default function Wizard({
  emote,
  voiced,
  dozing,
  reducedMotion,
  quality,
  pulse = 0,
  pose,
  poseVersion = 0,
  orbLift,
}: WizardProps) {
  const [jelly, setJelly] = useState<Jelly | null>(null);
  // Einmal je Zauberer und über alle Bilder dieselben, damit Gesten sie bewegen können.
  const [holders] = useState(createHolders);
  const posed = useOwnPose(pose, dozing);
  usePoseFrames(posed, poseVersion, dozing, reducedMotion);

  return (
    <>
      <Character
        color="mint"
        palette={WIZARD_PALETTE}
        pulse={0}
        {...{ emote, voiced, reducedMotion, quality }}
        onJelly={setJelly}
      />
      {jelly ? (
        <>
          <WizardHead jelly={jelly} holders={holders} />
          <WizardRobe jelly={jelly} />
          {emote?.key === "point" ? <WizardWand jelly={jelly} /> : null}
          <WizardRig {...{ jelly, holders, reducedMotion, pulse, orbLift }} pose={posed} />
        </>
      ) : null}
      <WizardOrb holders={holders} />
    </>
  );
}

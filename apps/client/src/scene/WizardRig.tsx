/**
 * Bewegt den Zauberer Bild für Bild nach seiner Haltung (`WizardPose`): Geste, Stimmung und schwere
 * Lider aus `@jelly/scene/wizard`, dazu sein Blick, der gelüpfte Hut, die steigende und glühende
 * Kugel, buschige Brauen, die den gezeichneten folgen, und ein Schnurrbart, der bei offenen Vokalen
 * zuckt. Die Rechnung dazu steht in `pet/wizardFaceRig.ts`.
 *
 * Läuft mit Priorität 0, also nach dem Jelly (−1), dessen Grundanimation Kopf, Augen und Brauen
 * jedes Bild neu setzt.
 *
 * @module
 */

import type { Jelly, MouthShape } from "@jelly/scene";
import type { Object3D } from "three";

import {
  animateCrystalBall,
  animateWizard,
  HAT_PIVOT,
  placeEyes,
  WIZARD_PARTS,
  type WizardExtras,
} from "@jelly/scene/wizard";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { MathUtils } from "three";

import type { WizardPose } from "../pet/wizardScripts";
import type { WizardHolders } from "./WizardParts";

import {
  browRig,
  createGaze,
  moodDoze,
  MUSTACHE_RIG,
  mustacheTwitch,
  stepGaze,
  wizardFrame,
  type GazeState,
} from "../pet/wizardFaceRig";

/** So weit darf der Hut höchstens steigen und kippen. */
const HAT_LIMIT = { lift: 0.12, tilt: 0.25 } as const;

/** Wie weit die Glaskugel in ihren Krallen auf und ab schwebt und wie schnell, in rad/s. */
const BALL_FLOAT = 0.012;
const BALL_FLOAT_SPEED = 1.4;

/**
 * Wie schnell das Aufflammen nach einem Kauf abklingt, pro Sekunde: über gut eine Sekunde, bei
 * reduzierter Bewegung als kurzes Glimmen.
 */
const FLARE_DECAY = 2;
const FLARE_DECAY_CALM = 10;

/** Längster Schritt der Uhr. Nach einer Pause verflöge sonst alles im ersten Bild. */
const MAX_STEP = 0.1;

/** Die Drehpunkte der Hälften von Brauen und Schnurrbart in der Höhe. */
const BROW_Y = WIZARD_PARTS.brow.pivot?.[1] ?? 0;
const MUSTACHE_Y = WIZARD_PARTS.mustache.pivot?.[1] ?? 0;

/**
 * Lässt den Kern der Kugel aufflammen, sobald sich `pulse` ändert, und wieder abklingen. Liefert je
 * Bild die Stärke, 0 bis 1.
 */
function useFlare(pulse: number, reducedMotion: boolean) {
  const flare = useRef({ seen: pulse, value: 0 });
  const invalidate = useThree((state) => state.invalidate);
  // Bei reduzierter Bewegung steht die Uhr: Das Aufflammen braucht dann eigene Bilder.
  useEffect(() => invalidate(), [pulse, invalidate]);
  return (delta: number) => {
    const state = flare.current;
    if (state.seen !== pulse) {
      state.seen = pulse;
      state.value = 1;
    }
    const decay = reducedMotion ? FLARE_DECAY_CALM : FLARE_DECAY;
    state.value = MathUtils.damp(state.value, 0, decay, Math.min(delta, MAX_STEP));
    if (reducedMotion && state.value > 0.01) invalidate();
    return state.value;
  };
}

/** Der Hut an der Krempe: gelüpft und gekippt, in seinen Grenzen. */
function placeHat(hat: Object3D | null, { hatLift, hatTilt }: WizardExtras) {
  if (!hat) return;
  const lift = MathUtils.clamp(hatLift, 0, HAT_LIMIT.lift);
  hat.position.set(HAT_PIVOT[0], HAT_PIVOT[1] + lift, HAT_PIVOT[2]);
  hat.rotation.z = MathUtils.clamp(hatTilt, -HAT_LIMIT.tilt, HAT_LIMIT.tilt);
}

/**
 * Die Glaskugel schwebt in ihren Krallen, steigt beim Zaubern und glüht so hell wie nötig.
 *
 * @returns Wie weit sie gerade über ihrer Ruhelage steht.
 */
function placeOrb(holders: WizardHolders, extras: WizardExtras, seconds: number, flare: number) {
  const lift = BALL_FLOAT * Math.sin(seconds * BALL_FLOAT_SPEED) + extras.orbLift;
  holders.ball.current?.position.setY(lift);
  const crystal = holders.crystal.current;
  if (crystal) animateCrystalBall(crystal, seconds, Math.max(flare, extras.orbGlow));
  return lift;
}

/**
 * Die buschigen Brauen nehmen Lage und Drehung der gezeichneten an, die danach verschwinden: So
 * schaut keine Tintenbraue unter dem Haar hervor.
 */
function rigBrows({ face }: Jelly, holders: WizardHolders, doze: number) {
  face.brows.forEach((ink, index) => {
    const lift = ink.visible ? ink.position.y : 0;
    const tilt = ink.visible ? ink.rotation.z : 0;
    const bushy = holders.brows[index as 0 | 1]?.current;
    if (bushy) {
      const rig = browRig(lift, tilt, index === 0 ? -1 : 1, doze);
      bushy.position.y = BROW_Y + rig.y;
      bushy.rotation.z = rig.rotation;
    }
    ink.visible = false;
  });
}

/** Welche Form der Mund gerade zeigt, `null` beim Lächeln. */
function mouthShapeOf({ face }: Jelly) {
  const shapes = Object.entries(face.mouthShapes) as [MouthShape, unknown][];
  return shapes.find(([, geometry]) => geometry === face.mouth.geometry)?.[0] ?? null;
}

/** Der Schnurrbart zuckt bei offenen Vokalen nach oben. Liefert, wie weit er gerade zuckt. */
function rigMustache(jelly: Jelly, holders: WizardHolders, twitch: number, delta: number) {
  const value = MathUtils.damp(
    twitch,
    mustacheTwitch(mouthShapeOf(jelly)),
    MUSTACHE_RIG.rate,
    delta,
  );
  const rise = (MUSTACHE_RIG.rise * value) / MUSTACHE_RIG.twitch;
  for (const half of holders.mustache) {
    if (!half.current) continue;
    half.current.rotation.z = value;
    half.current.position.y = MUSTACHE_Y + rise;
  }
  return value;
}

/** Eigenschaften von {@link WizardRig}. */
export interface WizardRigProps {
  jelly: Jelly;
  holders: WizardHolders;
  /** Seine Haltung, Bild für Bild gelesen. */
  pose: RefObject<WizardPose>;
  reducedMotion: boolean;
  /** Steigt mit jedem Zauber: Der Kern der Kugel flammt auf. */
  pulse: number;
  /** Bekommt jedes Bild, wie weit die Kugel über ihrer Ruhelage steht. Ihr Licht folgt ihr. */
  orbLift?: RefObject<number>;
}

/** Bewegt den Zauberer jedes Bild. Zeichnet selbst nichts. Muss innerhalb von `<Canvas>` stehen. */
export default function WizardRig({
  jelly,
  holders,
  pose,
  reducedMotion,
  pulse,
  orbLift,
}: WizardRigProps) {
  const flare = useFlare(pulse, reducedMotion);
  const invalidate = useThree((state) => state.invalidate);
  const gaze = useRef<GazeState>(createGaze(0));
  const twitch = useRef(0);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, MAX_STEP);
    const now = clock.elapsedTime;
    const current = pose.current;
    const extras = animateWizard(
      jelly,
      wizardFrame(current, performance.now(), now),
      reducedMotion,
    );
    const step = { now, delta, calm: reducedMotion, random: Math.random };
    gaze.current = stepGaze(gaze.current, current.gaze, step);
    placeEyes(jelly.face, gaze.current.dx, gaze.current.dy);
    jelly.head.rotation.z += gaze.current.roll;
    placeHat(holders.hat.current, extras);
    const lift = placeOrb(holders, extras, reducedMotion ? 0 : now, flare(rawDelta));
    if (orbLift) {
      // Licht und Schein lesen die Lage vor diesem Bild. Steht die Uhr, holen sie sie im nächsten nach.
      if (reducedMotion && Math.abs(orbLift.current - lift) > 1e-3) invalidate();
      orbLift.current = lift;
    }
    rigBrows(jelly, holders, moodDoze(current.mood));
    // Bei reduzierter Bewegung formt der Mund keine Vokale: Der Schnurrbart ruht sofort.
    twitch.current = rigMustache(jelly, holders, twitch.current, reducedMotion ? 1 : delta);
  });

  return null;
}

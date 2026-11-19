/**
 * Die Teile des Zauberers als Sticker an ihren Ankern: Hut, Haar, Bart und Gesicht am Kopf, die
 * Robe am Körper, die Kristallkugel auf ihrem Ständer neben ihm und der Zauberstab in der rechten
 * Hand. Malschicht und Strichstärke jedes Teils stehen in `WIZARD_PARTS` (`@jelly/scene/wizard`).
 *
 * Was Gesten bewegen, hängt in eigenen Haltern ({@link WizardHolders}): der Hut an seinem
 * Drehpunkt, die Kugel samt Ständer, die Glaskugel in ihren Krallen, Brauen und Schnurrbart je
 * Seite. Bewegt werden sie Bild für Bild in `WizardRig.tsx`.
 *
 * @module
 */

import type { Jelly } from "@jelly/scene";
import type { BufferGeometry, Object3D } from "three";

import {
  createCrystalBall,
  disposeCrystalBall,
  HAT_PIVOT,
  loadWizardPart,
  ORB_REST,
  WIZARD_CRYSTAL,
  WIZARD_PALETTE,
  WIZARD_PARTS,
  type WizardPart,
} from "@jelly/scene/wizard";
import { createPortal } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";

import { Sticker } from "./Cosmetic";

/** Ein Halter, den eine Geste bewegen kann. */
type Holder = RefObject<Object3D | null>;

/** Je Seite ein Halter, links (gespiegelt) zuerst, wie `Face.brows`. */
type Sides = readonly [Holder, Holder];

/** Die Halter des Zauberers. Sie bleiben über alle Bilder dieselben. */
export interface WizardHolders {
  /** Hut und Hutband, am Drehpunkt der Krempe (`HAT_PIVOT`). */
  hat: Holder;
  /** Die Kugel samt Ständer, an ihrem Ruheplatz auf der Theke (`ORB_REST`). */
  orb: Holder;
  /** Nur die Glaskugel in ihren Krallen. Sie schwebt ein wenig, beim Zaubern hebt sie sich. */
  ball: Holder;
  /** Die Glaskugel selbst, für ihren Shader. */
  crystal: Holder;
  /** Die buschigen Brauen, je an ihrem Drehpunkt. */
  brows: Sides;
  /** Die Hälften des Schnurrbarts, je an ihrem Drehpunkt. */
  mustache: Sides;
}

/** Die Teile als Promise, einmal je Modul: Alle Zauberer teilen sie, React wartet nicht erneut. */
const MODELS = Object.fromEntries(
  Object.keys(WIZARD_PARTS).map((part) => [part, loadWizardPart(part as WizardPart)]),
) as Record<WizardPart, Promise<BufferGeometry>>;

/** Spiegelt an der Mittelachse des Jellys. */
const MIRROR = [-1, 1, 1] as const;

/** Drehpunkt eines Teils ohne eigenen: der Ursprung des Jellys. */
const ORIGIN = [0, 0, 0] as const;

/** Ein Punkt mit umgekehrtem Vorzeichen: Ein Kind mit diesem Versatz liegt wieder an seinem Platz. */
function opposite([x, y, z]: readonly [number, number, number]) {
  return [-x, -y, -z] as const;
}

/** Ein Teil des Zauberers als Sticker, in seiner Malschicht und Strichstärke. */
function Part({ part }: { part: WizardPart }) {
  const { layer, outline } = WIZARD_PARTS[part];
  return (
    <Sticker model={MODELS[part]} ink={WIZARD_PALETTE.outline} layer={layer} outline={outline} />
  );
}

/**
 * Eine Hälfte von Brauen oder Schnurrbart in einem Halter an ihrem Drehpunkt: Dreht eine Geste den
 * Halter, dreht sich die Hälfte um diesen Punkt. Die linke ist die gespiegelte rechte.
 */
function Half({ part, side, holder }: { part: "brow" | "mustache"; side: 0 | 1; holder: Holder }) {
  const pivot = WIZARD_PARTS[part].pivot ?? ORIGIN;
  const half = (
    <object3D ref={holder} position={pivot}>
      <object3D position={opposite(pivot)}>
        <Part part={part} />
      </object3D>
    </object3D>
  );
  return side === 0 ? <object3D scale={MIRROR}>{half}</object3D> : half;
}

/** Hut und Hutband in einem Halter an der Krempe: So kann er den Hut lüpfen. */
function Hat({ holder }: { holder: Holder }) {
  return (
    <object3D ref={holder} position={HAT_PIVOT}>
      <object3D position={opposite(HAT_PIVOT)}>
        <Part part="hat" />
        <Part part="hatTrim" />
      </object3D>
    </object3D>
  );
}

/** Was am Kopf sitzt. Es wippt und neigt sich mit ihm, auch beim Dösen. */
export function WizardHead({ jelly, holders }: { jelly: Jelly; holders: WizardHolders }) {
  return createPortal(
    <>
      <Hat holder={holders.hat} />
      <Part part="hair" />
      <Part part="locks" />
      <Part part="beard" />
      <Half part="brow" side={0} holder={holders.brows[0]} />
      <Half part="brow" side={1} holder={holders.brows[1]} />
      <Half part="mustache" side={0} holder={holders.mustache[0]} />
      <Half part="mustache" side={1} holder={holders.mustache[1]} />
      <Part part="nose" />
    </>,
    jelly.faceAnchor,
  );
}

/** Die Robe mit ihren Spangen. Sie hängt in der Wurzel des Jellys und schwingt mit dem Körper. */
export function WizardRobe({ jelly }: { jelly: Jelly }) {
  return createPortal(
    <>
      <Part part="robe" />
      <Part part="clasps" />
    </>,
    jelly.root,
  );
}

/**
 * Der Zauberstab in seiner rechten Hand. Er wächst und schrumpft mit ihr: Eingezogen ist sie auf
 * Größe 0 und unsichtbar.
 */
export function WizardWand({ jelly }: { jelly: Jelly }) {
  return createPortal(<Part part="wand" />, jelly.hands[1]!);
}

/**
 * Die Kristallkugel auf ihrem Ständer, an ihrem Ruheplatz auf der Theke. Die Glaskugel liegt
 * zwischen Ständer (Schicht 0) und vorderen Krallen (Schicht 2): So greifen die Krallen sie.
 */
export function WizardOrb({ holders }: { holders: WizardHolders }) {
  const ball = useMemo(
    () => createCrystalBall({ ...WIZARD_CRYSTAL, ink: WIZARD_PALETTE.outline }),
    [],
  );
  useEffect(() => () => disposeCrystalBall(ball), [ball]);
  return (
    <object3D ref={holders.orb} position={ORB_REST}>
      <Part part="orbStand" />
      <Part part="orbSparks" />
      <object3D ref={holders.ball}>
        <primitive ref={holders.crystal} object={ball} />
      </object3D>
      <Part part="orbClaws" />
    </object3D>
  );
}

/**
 * Die Bühne des Zauberladens: links der Zauberer hinter seiner Theke, rechts das eigene Jelly zur
 * Anprobe. Eine Canvas für beide mit fester Kamera.
 *
 * Wand, Regale, Theke, Kerzen, Runenkreis und Sprechblase legt `shop/ShopStage.tsx` als DOM davor
 * und dahinter. Eine Theke in 3D ginge nicht: Cosmetics liegen als Sticker obenauf und würden sie
 * überzeichnen. Kamera und Plätze stehen in `pet/shopStage.ts`, daraus rechnet auch das DOM.
 *
 * Kerzen, Kugel, Runenkreis und Mond beleuchten beide Jellies und ihre Sticker (`ShopLights.tsx`),
 * Kugel und Flammen schimmern (`ShopGlows.tsx`). Was der Kunde neu anprobiert, springt auf.
 *
 * @module
 */

import { createSceneLight } from "@jelly/scene";
import { loadWizardPart, WIZARD_PARTS, type WizardPart } from "@jelly/scene/wizard";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { RenderProfile } from "../pet";
import type { LightCue } from "../pet/shopLight";
import type { CharacterProps } from "./Character";
import type { WizardProps } from "./Wizard";

import { IDLE_LIGHTING } from "../pet/shopLight";
import { OWN_AT, SHOP_VIEW, WIZARD_AT, type RuneState } from "../pet/shopStage";
import { TRY_ON } from "../pet/shopTimeline";
import AnimationClock from "./AnimationClock";
import Character from "./Character";
import RenderBoundary from "./RenderBoundary";
import ShopGlows from "./ShopGlows";
import ShopLights from "./ShopLights";
import { MaterializeContext } from "./stageLook";
import { useSceneLight } from "./useSceneLight";
import Wizard from "./Wizard";

/** Die Kamera. Mit `rotation` richtet Fiber sie nicht auf den Ursprung aus. */
const CAMERA = {
  position: [...SHOP_VIEW.eye] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  fov: SHOP_VIEW.fov,
};

/** Wo die beiden stehen. */
const WIZARD_PLACE = [...WIZARD_AT] as [number, number, number];
const OWN_PLACE = [...OWN_AT] as [number, number, number];

/** Neue Sticker am Kunden springen beim Aufspringen der Anprobe auf, über 360 ms. */
const MATERIALIZE = { delayMs: TRY_ON.pop, durationMs: 360 } as const;

/** So lange nach dem ersten Bild springt nichts auf: Was das Jelly schon trägt, steht einfach da. */
const ARM_MS = 800;
const ARM_FRAMES = 3;

/**
 * Was die Szene vom eigenen Jelly braucht. Geste und Stimme sind frei, so kann der Kunde später
 * mitspielen.
 */
type Customer = Pick<CharacterProps, "color" | "equipped" | "pulse"> &
  Partial<Pick<CharacterProps, "emote" | "voiced">>;

/**
 * Was die Szene vom Zauberer braucht. Die Bühne reicht alles aus `useWizard` durch, so kommen neue
 * Eigenschaften des Zauberers ohne Umweg hier an.
 */
type Shopkeeper = Omit<WizardProps, "reducedMotion" | "quality">;

/** Eigenschaften von {@link ShopScene}. */
export interface ShopSceneProps {
  own: Customer;
  wizard: Shopkeeper;
  rendering: RenderProfile;
  /** Bilder pro Sekunde, `null` heißt unbegrenzt. */
  frameLimit: number | null;
  reducedMotion: boolean;
  /** Der laufende Moment fürs Licht: Anprobe, Ladung, Zauber, Fehlschlag. */
  lightCue?: LightCue | null;
  /** Wie der Runenkreis unter dem Kunden leuchtet. Er beleuchtet ihn von unten. */
  circle?: RuneState;
  /** Die Teile des Zauberers stehen. Kommt einmal. */
  onReady?: () => void;
}

/** Beleuchtet, was sich beleuchten lässt. Eine eigene Komponente, weil Hooks in `<Canvas>` gehören. */
function SceneLightPatcher({ light }: { light: ReturnType<typeof createSceneLight> }) {
  useSceneLight(light);
  return null;
}

/**
 * Meldet einmal, dass die Teile des Zauberers stehen: Alle sind geladen, und zwei Bilder später
 * sind sie auch eingehängt und gezeichnet.
 */
function WizardReady({ onReady }: { onReady?: () => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const callback = useRef(onReady);
  const state = useRef({ loaded: false, frames: 0, done: false });
  useEffect(() => {
    callback.current = onReady;
  }, [onReady]);
  useEffect(() => {
    let live = true;
    const parts = Object.keys(WIZARD_PARTS) as WizardPart[];
    void Promise.allSettled(parts.map(loadWizardPart)).then(() => {
      if (!live) return;
      state.current.loaded = true;
      invalidate();
    });
    return () => {
      live = false;
    };
  }, [invalidate]);
  useFrame(() => {
    const ready = state.current;
    if (ready.done || !ready.loaded) return;
    ready.frames += 1;
    // Steht die Uhr, kommt das zweite Bild nur auf Anfrage.
    if (ready.frames < 2) return void invalidate();
    ready.done = true;
    callback.current?.();
  });
  return null;
}

/**
 * Lässt neue Sticker am Kunden aufspringen, aber erst 800 ms und drei Bilder nach dem ersten Bild:
 * Das erste kompiliert die Shader und kann lange dauern, was das Jelly schon trägt, steht bis
 * dahin. Bei reduzierter Bewegung erscheinen sie sofort.
 */
function Materializing({
  reducedMotion,
  children,
}: {
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  const frames = useRef({ first: 0, count: 0 });
  useFrame(() => {
    const seen = frames.current;
    if (seen.count < 0) return;
    const now = performance.now();
    if (seen.count === 0) seen.first = now;
    seen.count += 1;
    if (seen.count < ARM_FRAMES || now - seen.first < ARM_MS) return;
    seen.count = -1;
    setArmed(true);
  });
  const value = armed && !reducedMotion ? MATERIALIZE : null;
  return <MaterializeContext value={value}>{children}</MaterializeContext>;
}

/** Zauberer und eigenes Jelly auf durchsichtigem Grund. Ohne WebGL steht ein Hinweis da. */
export default function ShopScene({
  own,
  wizard,
  rendering,
  frameLimit,
  reducedMotion,
  lightCue = null,
  circle = "ruhe",
  onReady,
}: ShopSceneProps) {
  const light = useMemo(createSceneLight, []);
  const lighting = useRef(IDLE_LIGHTING);
  // Wie weit die Kugel über ihrer Ruhelage steht: Der Zauberer hebt sie, Licht und Schein folgen.
  const orbLift = useRef(0);
  const steady = rendering.quality === "optimized";
  return (
    <RenderBoundary>
      <Canvas
        aria-hidden="true"
        camera={CAMERA}
        dpr={rendering.dpr}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        frameloop="demand"
        fallback={<p className="render-fallback">Dieser WebView unterstützt kein WebGL.</p>}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <AnimationClock paused={reducedMotion} frameLimit={frameLimit} />
        <SceneLightPatcher light={light} />
        <ShopLights
          {...{ light, lighting, circle, steady, orbLift }}
          cue={lightCue}
          dozing={wizard.dozing}
          calm={reducedMotion}
        />
        <ShopGlows lighting={lighting} orbLift={orbLift} />
        <WizardReady onReady={onReady} />
        <object3D position={WIZARD_PLACE}>
          <Wizard
            {...wizard}
            orbLift={orbLift}
            reducedMotion={reducedMotion}
            quality={rendering.quality}
          />
        </object3D>
        <object3D position={OWN_PLACE}>
          <Materializing reducedMotion={reducedMotion}>
            <Character {...own} reducedMotion={reducedMotion} quality={rendering.quality} />
          </Materializing>
        </object3D>
      </Canvas>
    </RenderBoundary>
  );
}

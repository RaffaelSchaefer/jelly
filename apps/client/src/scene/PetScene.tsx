/**
 * Die 3D-Bühne: transparente WebGL-Canvas mit Kamera und dem Pet darin.
 *
 * Wird in `App.tsx` per `lazy()` geladen, damit Three.js den ersten Start nicht bremst.
 *
 * @module
 */

import type { Jelly } from "@jelly/scene";

import { createFramePacer } from "@jelly/stage/frame-pacing";
import { advance, Canvas, useThree } from "@react-three/fiber";
import { useEffect, useState, type RefObject } from "react";
import { MathUtils } from "three";

import {
  CANVAS_OVERSCAN,
  createSlowFrameMeter,
  type CameraFocus,
  type RenderProfile,
} from "../pet";
import CameraRig from "./CameraRig";
import Character, { type CharacterProps } from "./Character";
import LiquidGlass from "./LiquidGlass";
import RenderBoundary from "./RenderBoundary";
import StudioAnchors from "./StudioAnchors";

/** Öffnungswinkel, auf den die Bühnengeometrie in `pet/layout.ts` abgestimmt ist. */
const STAGE_FOV = 34;

/** Derselbe Bildausschnitt in der größeren Canvas: Das Pet bleibt gleich groß und am selben Ort. */
const FOV = MathUtils.radToDeg(
  2 * Math.atan(Math.tan(MathUtils.degToRad(STAGE_FOV / 2)) * CANVAS_OVERSCAN),
);

/**
 * Die Canvas ragt über den anklickbaren Bereich hinaus, Klicks gehen an ihr vorbei. Fiber würde
 * sonst eine Position und volle Größe setzen.
 */
const OVERSCAN_STYLE = {
  position: "absolute",
  inset: `${((1 - CANVAS_OVERSCAN) / 2) * 100}%`,
  width: "auto",
  height: "auto",
  pointerEvents: "none",
} as const;

/**
 * Taktet die Szene mit `frameLimit` Bildern pro Sekunde, solange das Fenster sichtbar ist. Sonst
 * zeichnet die Canvas mit `frameloop="demand"` nur, wenn sich etwas ändert.
 *
 * Zeichnet direkt mit `advance`: Ein `invalidate` aus diesem Takt käme erst im nächsten Bild an und
 * ließe 60 FPS auf einem 60-Hz-Bildschirm auf 30 fallen. Verborgen steht der Takt ganz. Ein
 * Fokusverlust hält ihn nicht an: Das Jelly lebt beim Spielen weiter.
 */
function AnimationClock({ paused, frameLimit }: { paused: boolean; frameLimit: number | null }) {
  const invalidate = useThree((state) => state.invalidate);
  const readState = useThree((state) => state.get);
  useEffect(() => {
    const pacer = createFramePacer(frameLimit);
    let frame = 0;
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      if (pacer.isDue(now)) advance(now, true, readState());
    }
    function sync() {
      cancelAnimationFrame(frame);
      if (document.hidden) return;
      // Auch bei stehender Uhr: Beim Wiederanzeigen soll sofort ein aktuelles Bild dastehen.
      invalidate();
      if (!paused) frame = requestAnimationFrame(tick);
    }
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused, frameLimit, invalidate, readState]);
  return null;
}

/**
 * Meldet, wenn das Gerät nicht hinterherkommt. Zählt die Bildschirmaktualisierungen statt der
 * gezeichneten Bilder: Ein niedrig gestellter Bildraten-Regler ist kein schwaches Gerät. Startet
 * erst mit der Szene, das Laden von Three.js zählt also nicht.
 *
 * @param onSlow - Ohne Wert wird nicht gemessen.
 */
function useSlowDevice(onSlow?: () => void) {
  useEffect(() => {
    if (!onSlow) return;
    const isSlow = createSlowFrameMeter();
    let frame = 0;
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      if (!document.hidden && isSlow(now)) onSlow?.();
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [onSlow]);
}

/** Eigenschaften von {@link PetScene}. */
export interface PetSceneProps extends Omit<CharacterProps, "quality"> {
  /** Wie aufwendig die Szene gezeichnet wird. */
  rendering: RenderProfile;
  /** Bilder pro Sekunde, `null` heißt unbegrenzt. */
  frameLimit: number | null;
  /** Worauf die Kamera fährt. Ohne Wert steht sie in der Grundansicht. */
  focus?: CameraFocus | null;
  /** Element für die Anker des Studios. Ohne Element wird nichts projiziert. */
  anchors?: RefObject<HTMLElement | null>;
  /** Wird gerufen, wenn das Gerät zu langsam ist. Ohne Wert wird nicht gemessen. */
  onSlowDevice?: () => void;
}

/** Das Pet auf transparentem Hintergrund. Ohne WebGL erscheint ein Hinweis statt eines Fehlers. */
export default function PetScene({
  rendering,
  frameLimit,
  focus = null,
  anchors,
  onSlowDevice,
  ...character
}: PetSceneProps) {
  const [jelly, setJelly] = useState<Jelly | null>(null);
  useSlowDevice(onSlowDevice);
  return (
    <RenderBoundary>
      <Canvas
        aria-hidden="true"
        camera={{ position: [0, 0.1, 5.8], fov: FOV }}
        style={OVERSCAN_STYLE}
        // Pixeldichte deckeln, damit hochauflösende Displays nicht unnötig GPU kosten.
        dpr={rendering.dpr}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        frameloop="demand"
        fallback={<p className="render-fallback">Dieser WebView unterstützt kein WebGL.</p>}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <AnimationClock paused={character.reducedMotion} frameLimit={frameLimit} />
        <CameraRig focus={focus} reducedMotion={character.reducedMotion} />
        <Character {...character} quality={rendering.quality} onJelly={setJelly} />
        {character.emote?.partner ? (
          <Character
            role="partner"
            quality={rendering.quality}
            color={character.emote.partner.color}
            equipped={character.emote.partner.equipped}
            pulse={0}
            reducedMotion={character.reducedMotion}
            emote={character.emote}
            voiced={character.voiced}
          />
        ) : null}
        {anchors && jelly ? <StudioAnchors jelly={jelly} target={anchors} /> : null}
        {rendering.glass ? (
          <LiquidGlass
            color={character.color}
            anchors={anchors}
            reducedMotion={character.reducedMotion}
          />
        ) : null}
      </Canvas>
    </RenderBoundary>
  );
}

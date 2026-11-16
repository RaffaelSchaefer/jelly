/**
 * Die Bühne des Zauberladens: links der Zauberer hinter seiner Theke, rechts das eigene Jelly zur
 * Anprobe. Eine Canvas für beide mit fester Kamera.
 *
 * Theke, Teppich und Sprechblase legt `shop/ShopStage.tsx` als DOM darüber. Ein Tresen in 3D ginge
 * nicht: Cosmetics liegen als Sticker obenauf und würden ihn überzeichnen. Wo diese Teile liegen,
 * folgt aus {@link SHOP_VIEW} und steht in `shop/shop.css`.
 *
 * @module
 */

import type { RefObject } from "react";

import { Canvas } from "@react-three/fiber";

import type { Equipped, PetColor, RenderProfile } from "../pet";
import type { ActiveEmote } from "../useEmotes";
import type { ActiveVoice } from "../useJellyVoice";

import AnimationClock from "./AnimationClock";
import Character from "./Character";
import RenderBoundary from "./RenderBoundary";
import Wizard from "./Wizard";

/**
 * Kamera und Plätze in Szenen-Einheiten. Die Kamera blickt waagerecht aus 8,8 Einheiten: Sichtbar
 * ist y von −1,25 bis 2,49, genug für Füße, Hut und einen Jubelsprung. Bei einer Bühne im
 * Seitenverhältnis 12 : 5 reicht die Breite bis ±4,49. Bei 24° bleiben beide Jellies fast frontal,
 * ihre Sticker sind nur von vorn modelliert.
 */
export const SHOP_VIEW = { height: 0.62, distance: 8.8, fov: 24, wizardX: -2.15, ownX: 2.15 };

/** Die Kamera. Mit `rotation` richtet Fiber sie nicht auf den Ursprung aus. */
const CAMERA = {
  position: [0, SHOP_VIEW.height, SHOP_VIEW.distance] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  fov: SHOP_VIEW.fov,
};

/** Was die Szene vom eigenen Jelly braucht. */
interface Customer {
  color: PetColor;
  /** Was es trägt, samt dem Teil zur Probe. */
  equipped: Equipped;
  /** Steigt mit jedem Kauf: Es hüpft vor Freude. */
  pulse: number;
}

/** Was die Szene vom Zauberer braucht. */
interface Shopkeeper {
  emote: ActiveEmote | null;
  voiced: RefObject<ActiveVoice | null>;
  dozing: boolean;
}

/** Eigenschaften von {@link ShopScene}. */
export interface ShopSceneProps {
  own: Customer;
  wizard: Shopkeeper;
  rendering: RenderProfile;
  /** Bilder pro Sekunde, `null` heißt unbegrenzt. */
  frameLimit: number | null;
  reducedMotion: boolean;
}

/** Zauberer und eigenes Jelly auf durchsichtigem Grund. Ohne WebGL steht ein Hinweis da. */
export default function ShopScene({
  own,
  wizard,
  rendering,
  frameLimit,
  reducedMotion,
}: ShopSceneProps) {
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
        <object3D position={[SHOP_VIEW.wizardX, 0, 0]}>
          <Wizard {...wizard} reducedMotion={reducedMotion} quality={rendering.quality} />
        </object3D>
        <object3D position={[SHOP_VIEW.ownX, 0, 0]}>
          <Character {...own} reducedMotion={reducedMotion} quality={rendering.quality} />
        </object3D>
      </Canvas>
    </RenderBoundary>
  );
}

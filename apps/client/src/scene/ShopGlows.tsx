/**
 * Die Schimmer im Zauberladen: ein Schein um die Kristallkugel, der atmet und beim Laden auf 1,8
 * Einheiten wächst, und je ein Hof um die beiden Kerzenflammen, der mit ihnen flackert.
 *
 * Sprites mit eigener Mischung: Die Farbe kommt dazu (ONE/ONE), das Alpha der Canvas bleibt (ZERO/
 * ONE). So hellen sie auch dort auf, wo die Canvas durchsichtig ist und das DOM der Wand
 * durchscheint, statt es abzudunkeln. Sie liegen über allem in der Szene (renderOrder 40, ohne
 * Tiefentest). Die Flammen selbst und die Theke sind DOM über der Canvas.
 *
 * @module
 */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import {
  AddEquation,
  Color,
  CustomBlending,
  OneFactor,
  Sprite,
  SpriteMaterial,
  ZeroFactor,
  type Texture,
} from "three";

import { SHOP_LIGHT_RIG, shopGlows, type ShopLighting } from "../pet/shopLight";
import { createGlowTexture } from "./glowTexture";

/** Nach dem Licht (-2): Die Schimmer lesen das Licht desselben Bildes. */
const GLOW_PRIORITY = -1;

/** Vor allem anderen gezeichnet, in der Liste der durchsichtigen Dinge. */
const GLOW_ORDER = 40;

/** So groß ist der Hof einer Kerze, in Einheiten. */
const HALO_SIZE = 0.9;

/** Die Farben: kühle Kugel, violett beim Zaubern, warme Flammen. */
const ORB_COOL = new Color(SHOP_LIGHT_RIG.orb.color);
const ORB_VIOLET = new Color(SHOP_LIGHT_RIG.orb.tint);
const FLAME = new Color(SHOP_LIGHT_RIG.candle.color);

/** Ein Schimmer an `position`. Die Stärke setzt später `material.color`, nicht die Deckkraft. */
function createGlow(map: Texture, position: readonly [number, number, number]) {
  const material = new SpriteMaterial({
    map,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  const sprite = new Sprite(material);
  sprite.position.set(...position);
  sprite.renderOrder = GLOW_ORDER;
  return sprite;
}

/** Die drei Schimmer samt ihrem Bild. */
function createGlows() {
  const map = createGlowTexture();
  return {
    map,
    orb: createGlow(map, SHOP_LIGHT_RIG.orb.at),
    candle: createGlow(map, SHOP_LIGHT_RIG.candle.at),
    taper: createGlow(map, SHOP_LIGHT_RIG.taper.at),
  };
}

/** Gibt Bild und Materialien frei. Fiber gibt `<primitive>`-Objekte nie selbst frei. */
function disposeGlows({ map, orb, candle, taper }: ReturnType<typeof createGlows>) {
  for (const sprite of [orb, candle, taper]) sprite.material.dispose();
  map.dispose();
}

/** Wo die Kugel ruht. Steigt sie beim Zaubern, steigt ihr Schein mit. */
const ORB_REST_Y = SHOP_LIGHT_RIG.orb.at[1];

/**
 * Schimmer um Kugel und Kerzen, gelesen aus dem Licht jedes Bildes. Innerhalb von `<Canvas>`.
 *
 * @param orbLift - Wie weit die Kugel gerade über ihrer Ruhelage steht.
 */
export default function ShopGlows({
  lighting,
  orbLift,
}: {
  lighting: RefObject<ShopLighting>;
  orbLift: RefObject<number>;
}) {
  const glows = useMemo(createGlows, []);
  useEffect(() => () => disposeGlows(glows), [glows]);

  useFrame(() => {
    const look = shopGlows(lighting.current);
    const { orb, candle, taper } = glows;
    orb.position.setY(ORB_REST_Y + orbLift.current);
    orb.scale.setScalar(look.orbSize);
    orb.material.color.copy(ORB_COOL).lerp(ORB_VIOLET, lighting.current.orbTint);
    orb.material.color.multiplyScalar(look.orbStrength);
    candle.scale.setScalar(HALO_SIZE);
    candle.material.color.copy(FLAME).multiplyScalar(look.candle);
    taper.scale.setScalar(HALO_SIZE);
    taper.material.color.copy(FLAME).multiplyScalar(look.taper);
  }, GLOW_PRIORITY);

  return (
    <>
      <primitive object={glows.orb} />
      <primitive object={glows.candle} />
      <primitive object={glows.taper} />
    </>
  );
}

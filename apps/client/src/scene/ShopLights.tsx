/**
 * Das Licht im Zauberladen: schreibt jedes Bild Kerzen, Kugel, Runenkreis, Mondrand und Dämpfer in
 * das Licht der Szene und `--flicker` auf die Bühne, damit Flammen und Lichtfleck im DOM mit den
 * Kerzen in der Szene flackern. Was wann wie hell ist, rechnet `pet/shopLight.ts`.
 *
 * Geschrieben wird nur, was sich ändert: Ruhig und optimiert steht das Licht, bis ein Moment kommt.
 *
 * @module
 */

import { setSceneLight, setSceneRim, type SceneLight } from "@jelly/scene";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { Color } from "three";

import type { RuneState } from "../pet/shopStage";

import {
  circleWhite,
  SHOP_LIGHT_RIG,
  shopLighting,
  type LightCue,
  type ShopLighting,
} from "../pet/shopLight";

/** Nach dem Beleuchten der Materialien (-3), vor den Jellies (-1) und den Schimmern. */
const LIGHT_PRIORITY = -2;

/** Kleinere Schritte des Flackerns schreibt die Bühne nicht neu. */
const FLICKER_STEP = 0.01;

/** Die Farben der Kugel: kühl in Ruhe, violett beim Zaubern. */
const ORB_COOL = new Color(SHOP_LIGHT_RIG.orb.color);
const ORB_VIOLET = new Color(SHOP_LIGHT_RIG.orb.tint);

/** Die Farben des Runenkreises: Gold in Ruhe, Weißgold, wenn er hell aufleuchtet. */
const CIRCLE_GOLD = new Color(SHOP_LIGHT_RIG.circle.color);
const CIRCLE_BRIGHT = new Color(SHOP_LIGHT_RIG.circle.bright);
/** Wiederverwendet, damit das Licht pro Bild nichts anlegt. */
const circleColor = new Color();

/** Eigenschaften von {@link ShopLights}. */
export interface ShopLightsProps {
  light: SceneLight;
  /** Bekommt das Licht jedes Bildes, etwa für die Schimmer. */
  lighting: RefObject<ShopLighting>;
  cue: LightCue | null;
  circle: RuneState;
  dozing: boolean;
  /** Reduzierte Bewegung. */
  calm: boolean;
  /** Optimierte Darstellung: kein Flackern, kein Atmen. */
  steady: boolean;
  /** Wie weit die Kugel gerade über ihrer Ruhelage steht. */
  orbLift: RefObject<number>;
}

/** Ob sich zwei Lichter sichtbar unterscheiden. */
function changed(last: ShopLighting | null, next: ShopLighting) {
  if (!last) return true;
  return (Object.keys(next) as (keyof ShopLighting)[]).some(
    (key) => Math.abs(last[key] - next[key]) > 1e-4,
  );
}

/** Kleinere Schritte der steigenden Kugel schreibt das Licht nicht neu, in Einheiten. */
const ORB_LIFT_STEP = 1e-3;

/** Schreibt ein Licht in die Uniforms der Szene. Das Licht der Kugel steigt mit ihr um `orbLift`. */
function writeLight(light: SceneLight, value: ShopLighting, orbLift: number, orbColor: Color) {
  const { candle, taper, orb, circle, rim, exposure } = SHOP_LIGHT_RIG;
  setSceneLight(light, 0, {
    position: candle.at,
    color: candle.color,
    intensity: candle.intensity * value.candle * exposure.points,
    range: candle.range,
  });
  setSceneLight(light, 1, {
    position: taper.at,
    color: taper.color,
    intensity: taper.intensity * value.taper * exposure.points,
    range: taper.range,
  });
  orbColor.copy(ORB_COOL).lerp(ORB_VIOLET, value.orbTint);
  setSceneLight(light, 2, {
    position: [orb.at[0], orb.at[1] + orbLift, orb.at[2]],
    color: orbColor,
    intensity: value.orb * exposure.points,
    range: orb.range,
  });
  circleColor.copy(CIRCLE_GOLD).lerp(CIRCLE_BRIGHT, circleWhite(value.circle));
  setSceneLight(light, 3, {
    position: circle.at,
    color: circleColor,
    intensity: value.circle * exposure.points,
    range: circle.range,
  });
  setSceneRim(light, { ...rim, strength: value.rim * exposure.rim });
  light.uniforms.uSceneShade.value = value.shade;
}

/** Was vorher war: der letzte Moment und seit wann Dösen und Runenkreis so sind. */
function useHistory(cue: LightCue | null, circle: RuneState, dozing: boolean) {
  const history = useRef({
    cue,
    previous: null as LightCue | null,
    circle,
    circleSince: Number.NEGATIVE_INFINITY,
    dozing,
    dozeSince: Number.NEGATIVE_INFINITY,
  });
  // Vor dem nächsten Bild, sonst sähe ein Bild den neuen Moment mit dem falschen Vorgänger. Ein
  // zweiter Lauf mit denselben Werten ändert nichts.
  useLayoutEffect(() => {
    const seen = history.current;
    const now = performance.now();
    if (seen.cue !== cue) Object.assign(seen, { previous: seen.cue, cue });
    if (seen.circle !== circle) Object.assign(seen, { circle, circleSince: now });
    if (seen.dozing !== dozing) Object.assign(seen, { dozing, dozeSince: now });
  }, [cue, circle, dozing]);
  return history;
}

/**
 * Die Bühne um die Canvas, auf die `--flicker` geschrieben wird. Solange das Licht flackert, lässt
 * die Bühne ihr eigenes Ersatz-Flackern der Flammen weg (`data-flicker-driven`).
 */
function useFlickerTarget() {
  const canvas = useThree((state) => state.gl.domElement);
  const stage = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = canvas.closest<HTMLElement>(".shop-stage");
    stage.current = element;
    element?.setAttribute("data-flicker-driven", "");
    return () => {
      element?.removeAttribute("data-flicker-driven");
      element?.style.removeProperty("--flicker");
      stage.current = null;
    };
  }, [canvas]);
  return stage;
}

/** Hält das Licht der Szene und `--flicker` aktuell. Muss innerhalb von `<Canvas>` stehen. */
export default function ShopLights({
  light,
  lighting,
  cue,
  circle,
  dozing,
  calm,
  steady,
  orbLift,
}: ShopLightsProps) {
  const invalidate = useThree((state) => state.invalidate);
  const history = useHistory(cue, circle, dozing);
  const stage = useFlickerTarget();
  const written = useRef<{
    light: ShopLighting | null;
    orbLift: number;
    flicker: number;
    orb: Color;
  }>({
    light: null,
    orbLift: 0,
    flicker: Number.NaN,
    orb: new Color(),
  });

  // Steht die Uhr (reduzierte Bewegung), braucht jeder Wechsel ein eigenes Bild.
  useEffect(() => invalidate(), [cue, circle, dozing, calm, steady, invalidate]);

  useFrame(({ clock }) => {
    const { previous, circleSince, dozeSince } = history.current;
    const input = { time: clock.elapsedTime, now: performance.now(), calm, steady, dozing };
    const value = shopLighting({ ...input, dozeSince, cue, previous, circle, circleSince });
    lighting.current = value;
    const last = written.current;
    const lift = orbLift.current;
    if (changed(last.light, value) || Math.abs(last.orbLift - lift) > ORB_LIFT_STEP) {
      writeLight(light, value, lift, last.orb);
      last.light = value;
      last.orbLift = lift;
    }
    const element = stage.current;
    if (element && !(Math.abs(value.candle - last.flicker) < FLICKER_STEP)) {
      element.style.setProperty("--flicker", value.candle.toFixed(3));
      last.flicker = value.candle;
    }
  }, LIGHT_PRIORITY);

  return null;
}

/**
 * Berührungen am Jelly mit Maus oder Finger: Ein Klick auf die Nase ist ein Nasenstupser, ein Wisch
 * mit gedrücktem Zeiger über die obere Kopfhälfte streichelt. Jeder andere Klick und die Tastatur
 * bleiben der normale Stupser. Zonen und Geste rechnet `pet/headZones.ts`.
 *
 * @module
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";

import type { PetGame } from "./usePet";

import { followStroke, handLean, headZone, startStroke, type HeadProbe, type Stroke } from "./pet";

/** Die Geste seit dem letzten Drücken. `down` gilt, bis der Zeiger losgelassen wird. */
interface Gesture {
  stroke: Stroke;
  down: boolean;
}

/** Ein Punkt eines Zeiger-Ereignisses. */
const pointOf = (event: { clientX: number; clientY: number }) => ({
  x: event.clientX,
  y: event.clientY,
});

/** Was die Geste über die Zeiger-Ereignisse hinweg braucht. */
interface StrokeRefs {
  gesture: { current: Gesture | null };
  probe: { current: HeadProbe | null };
  /** Wo die Hand gerade ist, für die Szene. */
  lean: { current: number };
}

/**
 * Hört nach dem Drücken auf das ganze Fenster: Auch wenn der Knopf zwischendurch gesperrt wird oder
 * der Zeiger ihn verlässt, endet die Geste mit dem Loslassen.
 *
 * @param onBegin - Sobald aus der Geste ein Streicheln wird, einmal je Geste.
 * @param onEnd - Beim Loslassen.
 */
function useStrokeFollow(refs: StrokeRefs, onBegin: () => void, onEnd: () => void) {
  const { gesture, probe, lean } = refs;
  useEffect(() => {
    function move(event: globalThis.PointerEvent) {
      const current = gesture.current;
      const head = current?.down && event.isPrimary ? probe.current?.() : null;
      if (!current || !head) return;
      const at = pointOf(event);
      lean.current = handLean(head, at);
      if (followStroke(current.stroke, at, head)) onBegin();
    }
    function end() {
      if (!gesture.current?.down) return;
      gesture.current.down = false;
      onEnd();
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [gesture, probe, lean, onBegin, onEnd]);
}

/**
 * Die Bedienung des Knopfs `.pet-touch`. Ein Streicheln meldet sich einmal je Geste wie ein
 * Stupser, der Klick an seinem Ende zählt nicht mehr.
 *
 * @returns `probe` bekommt die Szene für die Trefferzonen, `handlers` gehören an den Knopf.
 *   `petting` gilt, solange gestreichelt wird, `lean` sagt, wo die Hand gerade ist.
 */
export function usePetTouch({ interact }: Pick<PetGame, "interact">) {
  const probe = useRef<HeadProbe | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const lean = useRef(0);
  const [petting, setPetting] = useState(false);
  // Erst wenn aus der Geste ein Streicheln wird, gibt es Sprechblase, Laut und XP.
  const onBegin = useCallback(() => {
    setPetting(true);
    void interact("poke", "pet");
  }, [interact]);
  const onEnd = useCallback(() => setPetting(false), []);
  useStrokeFollow({ gesture, probe, lean }, onBegin, onEnd);

  const handlers = {
    onPointerDown(event: PointerEvent) {
      if (!event.isPrimary || event.button !== 0) return;
      gesture.current = { stroke: startStroke(pointOf(event)), down: true };
    },
    onClick(event: MouseEvent) {
      const last = gesture.current;
      gesture.current = null;
      // Ein Klick per Tastatur hat keinen Ort (`detail` 0): Er ist immer der normale Stupser.
      const stroke = event.detail > 0 ? last?.stroke : undefined;
      if (stroke?.petting) return;
      const zone = stroke && probe.current ? headZone(probe.current(), stroke.last) : null;
      void interact("poke", zone === "nose" ? "boop" : undefined);
    },
  };
  return { probe, handlers, petting, lean };
}

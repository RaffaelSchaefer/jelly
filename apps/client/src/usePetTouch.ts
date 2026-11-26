/**
 * Berührungen am Jelly mit Maus, Stift oder Finger: Ein Klick oder Tipp auf die Nase ist ein
 * Nasenstupser, ein Wisch mit gedrücktem Zeiger über die obere Kopfhälfte streichelt. Jeder andere
 * Klick und die Tastatur bleiben der normale Stupser. Zonen und Geste rechnet `pet/headZones.ts`.
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

import {
  followStroke,
  handLean,
  headZone,
  isTap,
  reachOf,
  startStroke,
  type HeadProbe,
  type ScreenPoint,
  type Stroke,
} from "./pet";

/** Die Geste seit dem letzten Drücken. `down` gilt, bis der Zeiger losgelassen wird. */
interface Gesture {
  stroke: Stroke;
  down: boolean;
  /** Der Zeiger, der die Geste führt. Ein zweiter Finger ändert nichts. */
  pointerId: number;
  /** Der Knopf: Ist er beim Heben gesperrt, zählt der Tipp nicht. */
  button: HTMLButtonElement;
  /** Der Tipp ist schon beim Heben gezählt, der Klick danach nicht mehr. */
  handled: boolean;
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

/** Was aus einer Geste wird. */
interface StrokeCalls {
  /** Sobald aus der Geste ein Streicheln wird, einmal je Geste. */
  onBegin: () => void;
  /** Beim Loslassen. */
  onEnd: () => void;
  /** Ein Stupser, mit der Nase als `boop`. */
  onPoke: (touch?: "boop") => void;
}

/** Welcher Stupser es am Ort der Geste ist: auf der Nase der Nasenstupser, sonst der normale. */
function pokeAt(stroke: Stroke, probe: HeadProbe | null, at: ScreenPoint): "boop" | undefined {
  const zone = probe ? headZone(probe(), at, reachOf(stroke.pointer)) : null;
  return zone === "nose" ? "boop" : undefined;
}

/**
 * Finger und Stift stupsen beim Heben statt per Klick: Nach langem Druck oder etwas Zittern käme
 * von Chromium kein Klick. Die Maus bleibt beim Klick.
 */
function liftTap(current: Gesture, event: globalThis.PointerEvent, probe: HeadProbe | null) {
  const at = pointOf(event);
  if (event.type !== "pointerup" || current.button.disabled || !isTap(current.stroke, at)) {
    return null;
  }
  current.handled = true;
  return { touch: pokeAt(current.stroke, probe, at) };
}

/**
 * Hört nach dem Drücken auf das ganze Fenster: Auch wenn der Knopf zwischendurch gesperrt wird oder
 * der Zeiger ihn verlässt, endet die Geste mit dem Loslassen.
 */
function useStrokeFollow(refs: StrokeRefs, calls: StrokeCalls) {
  const { gesture, probe, lean } = refs;
  const { onBegin, onEnd, onPoke } = calls;
  useEffect(() => {
    const own = (event: globalThis.PointerEvent) =>
      gesture.current?.down && gesture.current.pointerId === event.pointerId
        ? gesture.current
        : null;
    function move(event: globalThis.PointerEvent) {
      const current = own(event);
      const head = current ? probe.current?.() : null;
      if (!current || !head) return;
      const at = pointOf(event);
      lean.current = handLean(head, at);
      if (followStroke(current.stroke, at, head)) onBegin();
    }
    function end(event: globalThis.PointerEvent) {
      const current = own(event);
      if (!current) return;
      current.down = false;
      onEnd();
      // Abgebrochen kommt auch kein Klick mehr.
      if (event.type === "pointercancel") current.handled = true;
      const tap = liftTap(current, event, probe.current);
      if (tap) onPoke(tap.touch);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [gesture, probe, lean, onBegin, onEnd, onPoke]);
}

/**
 * Die Bedienung des Knopfs `.pet-touch`. Ein Streicheln meldet sich einmal je Geste wie ein
 * Stupser, der Klick an seinem Ende zählt nicht mehr. Finger und Stift treffen Nase und Kopf auch
 * knapp daneben und streicheln erst nach mehr als ihrem Zittern (`pet/headZones.ts`).
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
  const onPoke = useCallback((touch?: "boop") => void interact("poke", touch), [interact]);
  useStrokeFollow({ gesture, probe, lean }, { onBegin, onEnd, onPoke });

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (!event.isPrimary || event.button !== 0) return;
      gesture.current = {
        stroke: startStroke(pointOf(event), event.pointerType || "mouse"),
        down: true,
        pointerId: event.pointerId,
        button: event.currentTarget,
        handled: false,
      };
    },
    onClick(event: MouseEvent) {
      const last = gesture.current;
      gesture.current = null;
      // Ein Klick per Tastatur hat keinen Ort (`detail` 0): Er ist immer der normale Stupser, auch
      // wenn eine Geste davor ohne Klick endete.
      if (event.detail > 0 && last?.handled) return;
      const stroke = event.detail > 0 ? last?.stroke : undefined;
      if (stroke?.petting) return;
      void interact("poke", stroke ? pokeAt(stroke, probe.current, stroke.last) : undefined);
    },
  };
  return { probe, handlers, petting, lean };
}

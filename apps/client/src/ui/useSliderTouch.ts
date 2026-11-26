/**
 * Ein Regler im scrollenden Panel, mit Finger oder Stift. Chromium setzt den Wert schon beim
 * Aufsetzen auf die Stelle unter dem Finger, auch wenn daraus ein Scrollen wird. Hier wartet der
 * Wert, bis der Zug zur Seite geht. Wird gescrollt (`pointercancel`), bleibt er, wie er war. Ein
 * Tipp ohne Zug setzt ihn beim Heben wie ein Klick. Die Maus bleibt unberührt.
 *
 * @module
 */

import { useRef, type PointerEvent } from "react";

import { isSideways } from "../pet/pointerKinds";

/** Was ein Druck auf den Regler gerade weiß. */
interface Press {
  /** Wo Finger oder Stift aufsetzten. */
  x: number;
  y: number;
  pointerType: string;
  /** Der Zug geht zur Seite: Jeder Wert gilt sofort. */
  sliding: boolean;
  /** Der Wert, den der Regler zuletzt wollte, solange das noch nicht feststeht. */
  pending: number | null;
}

/**
 * Hält Werte von Finger und Stift zurück, bis feststeht, dass der Regler gezogen wird.
 *
 * @param onChange - Bekommt nur Werte, die wirklich gelten.
 * @returns `change` statt `onChange` am Feld, `handlers` dazu an das Feld.
 */
export function useSliderTouch(onChange: (value: number) => void) {
  const press = useRef<Press | null>(null);
  const handlers = {
    onPointerDown(event: PointerEvent<HTMLInputElement>) {
      press.current =
        event.pointerType === "mouse"
          ? null
          : {
              x: event.clientX,
              y: event.clientY,
              pointerType: event.pointerType,
              sliding: false,
              pending: null,
            };
    },
    onPointerMove(event: PointerEvent<HTMLInputElement>) {
      const current = press.current;
      if (!current || current.sliding) return;
      const dx = event.clientX - current.x;
      if (!isSideways(dx, event.clientY - current.y, current.pointerType)) return;
      current.sliding = true;
      if (current.pending !== null) onChange(current.pending);
      current.pending = null;
    },
    onPointerUp() {
      const pending = press.current?.pending ?? null;
      press.current = null;
      if (pending !== null) onChange(pending);
    },
    onPointerCancel() {
      press.current = null;
    },
    // Hob sich der Stift neben dem Regler, hielte der Druck sonst die Pfeiltasten zurück.
    onKeyDown() {
      press.current = null;
    },
  };
  function change(value: number) {
    const current = press.current;
    if (current && !current.sliding) current.pending = value;
    else onChange(value);
  }
  return { change, handlers };
}

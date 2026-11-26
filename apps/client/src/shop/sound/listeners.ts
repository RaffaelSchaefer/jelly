/**
 * Geräusche unter dem Zeiger und beim Scrollen, über Zuhörer am Dokument statt an jedem Element:
 * eine Harfe über den Waren (`data-hover-sound="harp"` mit `data-hover-step`), Wachs am Siegel
 * (`wax`), eine Münze am Beutel (`coin`) und Rascheln in der Rolle (`data-rustle`). Die Grenzen aus
 * `pet/shopMix.ts` halten sie leise und selten.
 *
 * Mit der Tastatur klingt die Harfe beim Fokus, aber nur, wenn zuletzt eine Taste gedrückt wurde.
 * Das ersetzt `:focus-visible`, das Safari vor 15.4 fehlt.
 *
 * @module
 */

import type { CueOptions } from "./cues";

import { canHover } from "../../pet/pointerKinds";
import {
  HOVER_GATE,
  nextHover,
  nextRustle,
  pointerPan,
  RUSTLE_GATE,
  type HoverGate,
  type RustleGate,
} from "../../pet/shopMix";

/** Wer die Geräusche spielt, im Laden `shopSound`. */
export interface HoverSounds {
  cue(name: "hover" | "rustle", options: CueOptions): boolean;
  /** Wo zuletzt geklickt wurde, von −0,5 bis 0,5. */
  pointAt(pan: number): void;
}

/** Was die Zuhörer sich merken. */
interface HoverState {
  sounds: HoverSounds;
  gate: HoverGate;
  rustle: RustleGate;
  /** Das Element mit Geräusch, über dem der Zeiger gerade ist. */
  current: Element | null;
  /** Ob zuletzt eine Taste gedrückt wurde. */
  keyboard: boolean;
  /** Die letzte Scroll-Lage je Element. */
  tops: WeakMap<Element, number>;
}

/** Die Spielarten unter dem Zeiger. */
const VARIANTS = new Set(["harp", "wax", "coin"]);

/** Alle Zuhörer laufen früh und blockieren nichts. */
const OPTIONS = { capture: true, passive: true } as const;

/** Das nächste Element mit einem Geräusch unter dem Zeiger. */
function hoverTarget(target: EventTarget | null) {
  return target instanceof Element ? target.closest("[data-hover-sound]") : null;
}

/** Spielt, was ein Element will, wenn die Grenzen es erlauben. */
function play(state: HoverState, element: Element) {
  const variant = element.getAttribute("data-hover-sound") ?? "";
  if (!VARIANTS.has(variant)) return;
  const step = Number(element.getAttribute("data-hover-step") ?? 0) || 0;
  const next = nextHover(state.gate, `${variant}:${step}`, performance.now());
  if (!next) return;
  state.gate = next;
  state.sounds.cue("hover", { variant: variant as "harp" | "wax" | "coin", step });
}

/**
 * Einmal je betretenem Element, mit Maus und schwebendem Stift. Ein Finger schwebt nicht: Sein
 * Aufsetzen klingt schon als Klick, und beim Scrollen durch die Rolle spielte sonst die Harfe.
 */
function onOver(state: HoverState, event: PointerEvent) {
  if (!canHover(event.pointerType)) return;
  const target = hoverTarget(event.target);
  if (target === state.current) return;
  state.current = target;
  if (target) play(state, target);
}

/** Scrollen in der Rolle raschelt, je mehr Weg, desto mehr. */
function onScroll(state: HoverState, event: Event) {
  const scroller = event.target instanceof Element ? event.target : null;
  if (!scroller?.closest("[data-rustle]")) return;
  const top = scroller.scrollTop;
  const delta = top - (state.tops.get(scroller) ?? top);
  state.tops.set(scroller, top);
  const next = nextRustle(state.rustle, delta, performance.now());
  state.rustle = next.gate;
  if (next.intensity !== null) state.sounds.cue("rustle", { intensity: next.intensity });
}

/** Die Zuhörer je Ereignis. */
function listenersOf(state: HoverState): [string, (event: Event) => void][] {
  return [
    ["pointerover", (event) => onOver(state, event as PointerEvent)],
    [
      "pointerout",
      (event) => {
        // Verlässt der Zeiger das Fenster, darf dasselbe Element beim Zurückkommen wieder klingen.
        if (!(event as PointerEvent).relatedTarget) state.current = null;
      },
    ],
    [
      "focusin",
      (event) => {
        const target = hoverTarget(event.target);
        if (state.keyboard && target) play(state, target);
      },
    ],
    [
      "keydown",
      () => {
        state.keyboard = true;
      },
    ],
    [
      "pointerdown",
      (event) => {
        // Ein Klick: kurz Stille unter dem Zeiger, und die Oberfläche klingt an dieser Stelle.
        state.keyboard = false;
        state.gate = { ...state.gate, clickAt: performance.now() };
        state.sounds.pointAt(pointerPan((event as PointerEvent).clientX, window.innerWidth));
      },
    ],
    ["scroll", (event) => onScroll(state, event)],
  ];
}

/**
 * Hört auf Zeiger, Fokus, Tasten und Scrollen im ganzen Dokument.
 *
 * @returns Das Aufräumen.
 */
export function listenForShopHovers(sounds: HoverSounds) {
  const state: HoverState = {
    sounds,
    gate: HOVER_GATE,
    rustle: RUSTLE_GATE,
    current: null,
    keyboard: false,
    tops: new WeakMap(),
  };
  const listeners = listenersOf(state);
  for (const [type, listener] of listeners) document.addEventListener(type, listener, OPTIONS);
  return () => {
    for (const [type, listener] of listeners) {
      document.removeEventListener(type, listener, OPTIONS);
    }
  };
}

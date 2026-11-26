/**
 * Was Finger und Stift auf der Karte anders brauchen als die Maus: Ein Finger schwebt nicht, ein
 * Stift schwebt wie die Maus. Langer Druck und die Seitentaste des Stifts öffnen unter Windows das
 * Kontextmenü der Webview, das hat auf der Karte nichts zu suchen. Reichweite und Art des Zeigers
 * rechnet `pet/pointerKinds.ts`.
 *
 * @module
 */

import type { ScreenPoint, StageView } from "@jelly/stage";

import { blockContextMenu as blockMenusIn } from "../pointerGuards";

/** Hier behält man Text: Suche und Meldungen, die man kopieren möchte. */
const KEEPS_CONTEXT_MENU = "input, #status";

/** Wo ein Zeiger-Ereignis auf der Canvas liegt. */
function pointOf(event: PointerEvent): ScreenPoint {
  return { x: event.offsetX, y: event.offsetY };
}

/**
 * Name und Ring unter dem Zeiger. Maus und schwebender Stift zeigen, was ein Klick träfe. Ein
 * Finger schwebt nicht: Er zeigt nichts, während er zieht, und nach dem Heben bleibt nichts
 * stehen.
 */
export function listenToHover(canvas: HTMLCanvasElement, readView: () => StageView | null): void {
  const clear = () => readView()?.setPointer(null);
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "touch") readView()?.setPointer(pointOf(event));
  });
  canvas.addEventListener("pointerleave", clear);
  for (const type of ["pointerup", "pointercancel"] as const) {
    canvas.addEventListener(type, (event) => {
      if (event.pointerType === "touch") clear();
    });
  }
}

/**
 * Kein Kontextmenü der Webview auf Karte und Knöpfen, auch nicht nach langem Druck oder mit der
 * Seitentaste des Stifts. Suche und Meldungen behalten es für Kopieren und Einfügen.
 */
export function blockContextMenu(root: Document): void {
  blockMenusIn(root, KEEPS_CONTEXT_MENU);
}

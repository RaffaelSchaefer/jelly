/**
 * Was die Webview bei Finger und Stift von sich aus täte und in Pet, Shop und Karte nichts zu
 * suchen hat: Ein langer Druck und die Seitentaste des Stifts öffnen unter Windows das Kontextmenü,
 * ein langer Druck markiert Text, ein Zug am Bild zieht es heraus. Felder zum Schreiben behalten
 * all das.
 *
 * @module
 */

/** Hier darf man immer Text markieren und kopieren. */
const EDITABLE = "input, textarea, [contenteditable]";

/** Ob ein Ziel in einem der Bereiche liegt, die das Menü behalten. */
function keeps(target: EventTarget | null, keep: string) {
  return target instanceof Element && target.closest(keep) !== null;
}

/**
 * Kein Kontextmenü der Webview, auch nicht nach langem Druck oder mit der Seitentaste des Stifts.
 * Was `keep` trifft, behält es für Kopieren und Einfügen.
 *
 * @param keep - CSS-Auswahl der Bereiche mit Menü, etwa Eingabefelder.
 */
export function blockContextMenu(root: Document, keep: string): void {
  root.addEventListener("contextmenu", (event) => {
    if (!keeps(event.target, keep)) event.preventDefault();
  });
}

/**
 * Pet und Shop: kein Kontextmenü außerhalb der Felder, und Finger und Stift markieren keinen Text
 * und ziehen keine Bilder. Die Maus markiert und zieht wie bisher.
 *
 * @param keep - Bereiche, die zusätzlich zu den Feldern Menü und Markieren behalten.
 */
export function guardPointers(root: Document, keep?: string): void {
  const kept = keep ? `${EDITABLE}, ${keep}` : EDITABLE;
  blockContextMenu(root, kept);
  let lastType = "mouse";
  root.addEventListener(
    "pointerdown",
    (event) => {
      lastType = event.pointerType || "mouse";
    },
    { capture: true, passive: true },
  );
  for (const type of ["selectstart", "dragstart"] as const) {
    root.addEventListener(type, (event) => {
      if (lastType !== "mouse" && !keeps(event.target, kept)) event.preventDefault();
    });
  }
}

/**
 * Verhalten der Auswahlen direkt am Jelly: schließen per Außenklick oder Escape, Fokus halten.
 *
 * @module
 */

import { useCallback, useEffect, useRef } from "react";

/**
 * Schließt per Außenklick oder Escape und hält den Fokus an der Auswahl.
 *
 * @param focusSelector - Was beim Öffnen den Fokus bekommt, gesucht im Element von `container`.
 * @returns `container` für die Auswahl samt Auslöser, `trigger` für den Auslöser und `close`, das
 *   den Fokus dorthin zurückgibt.
 */
export function useStagePopover(open: boolean, onClose: () => void, focusSelector: string) {
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    onClose();
    trigger.current?.focus({ preventScroll: true });
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    container.current?.querySelector<HTMLElement>(focusSelector)?.focus();
    function outside(event: MouseEvent) {
      if (event.target instanceof Node && container.current?.contains(event.target)) return;
      // Der Klick aufs Jelly schließt nur die Auswahl und stupst nicht. Dock und Fensterknöpfe wirken.
      if (event.target instanceof Element && event.target.closest(".pet-touch")) {
        event.preventDefault();
        event.stopPropagation();
      }
      close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    document.addEventListener("click", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("click", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, close, focusSelector]);

  return { container, trigger, close };
}

/**
 * Schreibt `--u` auf die Bühne: Pixel je Szenen-Einheit bei z 0. Daran hängen alle Größen im DOM,
 * die zur 3D-Szene passen müssen, etwa Kerzen, Flammen und der Runenkreis.
 *
 * @module
 */

import { useLayoutEffect, type RefObject } from "react";

import { unitPx } from "../pet/shopStage";

/** Setzt `--u` für eine Bühne dieser Höhe, auf drei Stellen genau. */
function writeUnit(stage: HTMLElement, height: number) {
  if (height > 0) stage.style.setProperty("--u", `${unitPx(height).toFixed(3)}px`);
}

/**
 * Hält `--u` auf der Bühne aktuell, ohne React-State. Die Ebenen liegen mit `inset: 0` im Innenrand
 * der Bühne, darum zählt dessen Höhe.
 */
export function useStageUnit(stage: RefObject<HTMLElement | null>) {
  // Vor dem ersten Bild, sonst stünden Kerzen und Runenkreis einen Moment in der falschen Größe.
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    writeUnit(element, element.clientHeight);
    const observer = new ResizeObserver(([entry]) => writeUnit(element, entry.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [stage]);
}

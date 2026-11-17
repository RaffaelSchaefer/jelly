/**
 * Lässt die Börse Münze für Münze zählen, statt die neue Zahl einfach hinzustellen. Die Schritte
 * rechnet `pet/purse.ts`, hier laufen die Zeitgeber. Mit reduzierter Bewegung springt sie.
 *
 * @module
 */

import { useEffect, useRef, useState } from "react";

import { coinSteps, PURSE_STEP_MS, purseTrend, type PurseTrend } from "../pet/purse";

/** Was die Börse gerade zeigt. */
export interface PurseCount {
  /** Die Zahl auf der Börse. */
  shown: number;
  /** Wohin sie zuletzt gezählt hat, `null` vor dem ersten Schritt. */
  trend: PurseTrend | null;
  /** Um wie viel der letzte Schritt sie geändert hat. */
  delta: number;
}

/** Ob gerade nichts zählen soll: reduzierte Bewegung, oder niemand sieht das Fenster. */
function jumps() {
  return document.documentElement.hasAttribute("data-reduced-motion") || document.hidden;
}

/**
 * Zählt die Börse auf `target` zu. Ändert sich das Ziel mitten im Zählen, zählt sie von der Zahl
 * aus weiter, die gerade dasteht. Der erste Schritt kommt sofort, die weiteren im Takt aus
 * {@link PURSE_STEP_MS}.
 */
export function usePurseCount(target: number): PurseCount {
  const [count, setCount] = useState<PurseCount>({ shown: target, trend: null, delta: 0 });
  const shown = useRef(target);

  useEffect(() => {
    const from = shown.current;
    const trend = purseTrend(from, target);
    if (!trend) return;
    if (jumps()) {
      shown.current = target;
      setCount({ shown: target, trend, delta: target - from });
      return;
    }
    const steps = coinSteps(from, target);
    let step = 0;
    let timer: number | undefined;
    const tick = () => {
      const value = steps[step];
      setCount({ shown: value, trend, delta: value - shown.current });
      shown.current = value;
      step += 1;
      if (step < steps.length) timer = window.setTimeout(tick, PURSE_STEP_MS[trend]);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [target]);

  return count;
}

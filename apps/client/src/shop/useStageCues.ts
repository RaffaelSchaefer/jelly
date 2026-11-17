/**
 * Was die Bühne gerade zeigt, wenn der Laden einen Moment spielt: wie der Runenkreis leuchtet, ob
 * der Raum für den Zauber abdunkelt und welcher Moment das Licht der Szene lenkt. Änderungen kommen
 * sofort oder zu ihrer Zeit (`pet/shopRitual.ts`), ein neuer Moment verwirft, was noch aussteht.
 *
 * @module
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { LightCue, LightCueKind } from "../pet/shopLight";
import type { PurchaseTimeline } from "../pet/shopTimeline";

import { RESTING_STAGE, stageAt, type StageChange, type StageLook } from "../pet/shopRitual";

/** Was die Bühne von den Momenten des Ladens zeigt. */
export interface StageCues extends StageLook {
  /** Der laufende Moment fürs Licht der Szene, `null` vor dem ersten. */
  lightCue: LightCue | null;
}

/** Wie Wahl und Siegel die Bühne lenken. Bleibt über alle Bilder dasselbe. */
export interface StageDirector {
  /** Ein Moment fürs Licht: Anprobe, Ladung, Loslassen, Zauber oder Fehlschlag. */
  light: (kind: LightCueKind, timeline?: PurchaseTimeline) => void;
  /** Änderungen an Runenkreis und Raum, ab jetzt. Was davor noch ausstand, entfällt. */
  stage: (changes: readonly StageChange[]) => void;
}

/** Runenkreis, Raum und Licht der Bühne samt dem, der sie lenkt. */
export function useStageCues() {
  const [cues, setCues] = useState<StageCues>({ ...RESTING_STAGE, lightCue: null });
  const pending = useRef<number[]>([]);
  useEffect(() => () => pending.current.forEach((timer) => window.clearTimeout(timer)), []);
  const director = useMemo<StageDirector>(() => {
    const apply = (change: StageChange) =>
      setCues((current) => ({ ...current, ...stageAt(current, [change], change.at) }));
    return {
      light(kind, timeline) {
        const lightCue: LightCue = {
          kind,
          at: performance.now(),
          ...(timeline ? { timeline } : {}),
        };
        setCues((current) => ({ ...current, lightCue }));
      },
      stage(changes) {
        pending.current.forEach((timer) => window.clearTimeout(timer));
        pending.current = [];
        for (const change of changes) {
          if (change.at <= 0) apply(change);
          else pending.current.push(window.setTimeout(() => apply(change), change.at));
        }
      },
    };
  }, []);
  return { cues, director };
}

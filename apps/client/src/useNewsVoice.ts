/**
 * Lässt den Vorleser der Jelly-News Beitrag für Beitrag sprechen, solange die Sendung läuft. Wann,
 * rechnet `nextAnchorStep` bei jedem Blick neu aus der Uhr des Servers, so laufen Pet und Bühne
 * nicht auseinander, auch wenn ein Wecker zu spät kommt. Gespielt wird der Satz in
 * `useJellyVoice.ts`, mit Schalter, Lautstärke und Vorrang der eigenen Sätze.
 *
 * Grenze: Ein Pet, das mitten in einer Sendung startet, kennt sie nicht und schweigt, wie beim Satz
 * und beim Jingle (`useNews.ts`). Solange Karte oder Shop offen sind, spricht er aus dem
 * versteckten Pet-Fenster, falls dessen Wecker dann noch laufen.
 *
 * @module
 */

import { useEffect, useState } from "react";

import { anchorVoice, nextAnchorStep, type AnchorLine, type AnchorPlan } from "./pet";

/**
 * Länger schläft der Vorleser nie am Stück, in Millisekunden. Springt die Uhr, etwa mit einem neuen
 * Abstand zum Server, sieht er so bald wieder nach, statt einen riesigen Wecker zu stellen, der im
 * Browser sofort klingelt.
 */
const LONGEST_SLEEP_MS = 30_000;

/**
 * Der Satz, den der Vorleser gerade beginnt, jeder als neues Objekt, `null` vor dem ersten.
 *
 * @param plan - Die laufende Sendung, `null` ohne.
 * @param ownId - Das eigene Jelly. Liest es vor, spricht es mit eigener Stimme.
 * @param serverNow - Die Uhr des Servers in Millisekunden. Sollte stabil sein.
 */
export function useNewsVoice(
  plan: AnchorPlan | null,
  ownId: number | undefined,
  serverNow: () => number,
) {
  const [line, setLine] = useState<AnchorLine | null>(null);
  useEffect(() => {
    if (!plan || ownId === undefined) return;
    const voice = anchorVoice(plan.show.presenterId, ownId);
    let done: string | null = null;
    let timer: number | undefined;
    const wake = () => {
      const now = serverNow();
      const step = nextAnchorStep(plan, now, done, voice);
      if (step.phrase) {
        done = step.phrase.key;
        setLine({ notes: step.phrase.notes, timbre: voice.timbre, own: voice.own });
      }
      if (step.wakeAt === null) return;
      const sleep = Math.min(LONGEST_SLEEP_MS, Math.max(0, step.wakeAt - now));
      timer = window.setTimeout(wake, sleep);
    };
    wake();
    return () => window.clearTimeout(timer);
  }, [plan, ownId, serverNow]);
  return line;
}

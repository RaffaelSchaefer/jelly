/**
 * Was das Pet von den Jelly-News mitbekommt. Die Sendung läuft auf Bühne und Karte, hier kommt nur
 * ihr Beginn als `gathering.changed` an, und `newsCue` sagt, was das Jelly dazu meint. Jingle und
 * leise Musik spielen die Geräusche der Oberfläche (`news` und `newsBed` in `useUiSounds.ts`),
 * einmal je Sendung, die Musik bis zu ihrem Ende. Das Jelly schweigt zum Jingle und hüpft nur
 * (`pickClip`), danach spricht der Vorleser (`useNewsVoice.ts`).
 *
 * Bekannte Grenzen: Ein Pet, das mitten in einer Sendung startet, verpasst sie, denn sein Stand
 * nennt kein Gathering (`GET /players/me`). Und solange Karte oder Shop offen sind, vertreten sie
 * das Pet: Sein Satz bleibt dann ungesehen, nur der Jingle kommt womöglich aus dem versteckten
 * Fenster. Sperrt die WebView Ton bis zur ersten Geste, bleibt der Jingle davor still und kommt
 * auch nicht nachträglich (`LATE_MS` in `uiSound.ts`).
 *
 * In der Browser-Vorschau beginnen die News mit `/#news`, `/#news-tower`, `/#news-achievement`,
 * `/#news-presenter` oder `/#news-watching` kurz nach dem Laden (`previewNewsEvent`). Zu hören ist
 * der Jingle erst nach einer Geste, darum beginnt die Sendung nach dem ersten Klick oder
 * Tastendruck noch einmal. Der Stupser dieser Geste kommt dabei zuerst, die News lösen ihn ab.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { desktop } from "./backend";
import {
  endsNews,
  newsCue,
  planAnchor,
  previewNewsEvent,
  type AnchorPlan,
  type ServerEvent,
} from "./pet";
import { useServerEvents, type useGameState } from "./useGame";
import { useNewsVoice } from "./useNewsVoice";

/** Der Hash der Vorschau, wenn er die News zeigt. Die App kennt keinen. */
const PREVIEW_HASH = !desktop && location.hash.startsWith("#news") ? location.hash : null;

/** So lange nach dem Laden oder der ersten Geste beginnen die News der Vorschau, in Millisekunden. */
const PREVIEW_DELAY_MS = 1500;

/** Was in der Vorschau als erste Geste zählt, wie für die Stimme in `useJellyVoice.ts`. */
const PREVIEW_GESTURES = ["pointerdown", "keydown"] as const;

/** Lässt die News der Vorschau kurz nach dem Laden und nach der ersten Geste beginnen. */
function usePreviewNews(ownId: number | undefined, onEvent: (event: ServerEvent) => void) {
  useEffect(() => {
    if (PREVIEW_HASH === null || ownId === undefined) return;
    const hash = PREVIEW_HASH;
    const start = () => {
      const event = previewNewsEvent(hash, ownId, Date.now());
      if (event) onEvent(event);
    };
    const timers = [window.setTimeout(start, PREVIEW_DELAY_MS)];
    const again = () => {
      for (const gesture of PREVIEW_GESTURES) window.removeEventListener(gesture, again);
      timers.push(window.setTimeout(start, PREVIEW_DELAY_MS));
    };
    for (const gesture of PREVIEW_GESTURES) window.addEventListener(gesture, again);
    return () => {
      for (const gesture of PREVIEW_GESTURES) window.removeEventListener(gesture, again);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [ownId, onEvent]);
}

/**
 * Lässt das Jelly auf den Beginn der Jelly-News reagieren: Wer vorliest oder genannt wird, hüpft
 * mit seinem Satz, alle anderen sagen ihn nur. Jede Sendung einmal, auch wenn ihr Ereignis noch
 * einmal kommt.
 *
 * @param hop - Hüpfer mit Satz. Sollte stabil sein.
 * @param say - Nur der Satz. Sollte stabil sein.
 * @returns `newsJingle` ist die zuletzt begonnene Sendung mit Jingle, für Jingle und Stimme,
 *   `newsAnchor` der Satz, den ihr Vorleser gerade beginnt, `newsBed` die Musik unter der laufenden
 *   Sendung mit ihrer Restdauer in Sekunden, `null` ohne oder nach einem vorzeitigen Ende.
 */
export function useNews(
  state: ReturnType<typeof useGameState>,
  ready: boolean,
  hop: (message: string) => void,
  say: (message: string) => void,
) {
  const ownId = state.game.me?.id;
  const { offset, catalog } = state;
  // Im Ref statt im Hörer: Der Abstand zur Uhr wackelt mit jedem neuen Stand um Millisekunden, und
  // ein neu angemeldeter Hörer verpasste, was derweil ankommt.
  const known = useRef({ offset, catalog });
  useEffect(() => {
    known.current = { offset, catalog };
  }, [offset, catalog]);
  const serverNow = useCallback(() => Date.now() + known.current.offset, []);
  const shown = useRef<number | null>(null);
  const [newsJingle, setNewsJingle] = useState<{ show: number } | null>(null);
  const [plan, setPlan] = useState<AnchorPlan | null>(null);
  const [newsBed, setNewsBed] = useState<{ show: number; seconds: number } | null>(null);
  const onEvent = useCallback(
    (event: ServerEvent) => {
      if (ownId === undefined) return;
      // Ein vorzeitiges Ende oder ein anderes Gathering: Der Vorleser hört auf.
      if (endsNews(event)) {
        setPlan(null);
        setNewsBed(null);
      }
      const cue = newsCue(event, { id: ownId, now: serverNow(), catalog: known.current.catalog });
      if (!cue || cue.show === shown.current) return;
      shown.current = cue.show;
      // Im selben Render wie der Satz: Nur so schweigt das Jelly, statt in den Jingle zu reden.
      if (cue.jingle) setNewsJingle({ show: cue.show });
      setPlan(cue.anchor ? planAnchor(event) : null);
      setNewsBed(cue.bed ? { show: cue.show, seconds: (cue.show - serverNow()) / 1000 } : null);
      (cue.hops ? hop : say)(cue.message);
    },
    [ownId, hop, say, serverNow],
  );
  useServerEvents(desktop && ready, onEvent);
  usePreviewNews(ready ? ownId : undefined, onEvent);
  const newsAnchor = useNewsVoice(plan, ownId, serverNow);
  return { newsJingle, newsAnchor, newsBed };
}

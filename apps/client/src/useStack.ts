/**
 * Was das Pet vom eigenen Stapel mitbekommt. Geklettert wird auf der Karte, hier kommt nur
 * `stack.changed` an, und `stackChange` sagt, was das Jelly dazu meint.
 *
 * @module
 */

import { useCallback, useRef } from "react";

import { desktop } from "./backend";
import { stackChange, type ServerEvent, type StackPlace } from "./pet";
import { useServerEvents, type useGameState } from "./useGame";

/**
 * Lässt das Jelly auf seinen Stapel reagieren. Klettert es hinauf, hüpft es dabei. Den Platz im
 * Turm merkt es sich nur, solange das Fenster offen ist: `me` nennt keinen Stapel.
 *
 * @param hop - Hüpfer mit Satz. Sollte stabil sein.
 * @param say - Nur der Satz. Sollte stabil sein.
 */
export function useStack(
  state: ReturnType<typeof useGameState>,
  ready: boolean,
  hop: (message: string) => void,
  say: (message: string) => void,
) {
  const ownId = state.game.me?.id;
  const place = useRef<StackPlace | null>(null);
  const onEvent = useCallback(
    (event: ServerEvent) => {
      if (ownId === undefined) return;
      const change = stackChange(place.current, event, ownId);
      place.current = change.place;
      if (change.message) (change.climbed ? hop : say)(change.message);
    },
    [ownId, hop, say],
  );
  useServerEvents(desktop && ready, onEvent);
}

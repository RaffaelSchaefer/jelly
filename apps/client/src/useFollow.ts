/**
 * Was das Pet vom Dazustellen und von Ausflügen mitbekommt. Beides startet auf der Karte, hier
 * kommt es nur als neuer Stand an.
 *
 * @module
 */

import { useEffect, useRef } from "react";

import type { useGameState } from "./useGame";

import { awayMessage } from "./pet";

/** Meldet, was das Jelly zu einem neuen Ziel oder Ausflug sagt. */
function useAwayReaction(
  follow: number | null | undefined,
  tripUntil: number | null | undefined,
  onChanged: (message: string) => void,
) {
  const last = useRef({ follow, tripUntil });
  useEffect(() => {
    const message = awayMessage(last.current, { follow, tripUntil });
    last.current = { follow, tripUntil };
    if (message) onChanged(message);
  }, [follow, tripUntil, onChanged]);
}

/**
 * Lässt das Jelly auf ein neues Ziel oder einen Ausflug reagieren. Enden sie von selbst, meldet der
 * Server das mit `follow.changed` und `trip.changed`, und der Stand kommt wie nach jedem Ereignis
 * neu.
 *
 * @param onChanged - Bekommt nach einem Wechsel, was das Jelly dazu sagt. Sollte stabil sein.
 */
export function useFollow(
  state: ReturnType<typeof useGameState>,
  ready: boolean,
  onChanged: (message: string) => void,
) {
  const me = state.game.me;
  // Vor dem ersten Laden steht hier der Vorschau-Stand, und ein gespeichertes Ziel ist nichts Neues.
  // Ohne Konto auch nicht: Der Einstieg stellt gerade seine Frage, und das Jelly ist nirgends hin.
  const known = ready && me;
  useAwayReaction(
    known ? (me.follow?.player_id ?? null) : undefined,
    known ? (me.trip?.ends_at ?? null) : undefined,
    onChanged,
  );
}

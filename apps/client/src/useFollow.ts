/**
 * Was das Pet vom Dazustellen und von Ausflügen mitbekommt. Beides startet auf der Karte, hier
 * kommt es nur als neuer Stand an.
 *
 * @module
 */

import { useEffect, useRef } from "react";

import type { useGameState } from "./useGame";

import * as backend from "./backend";
import { awayMessage } from "./pet";

/** Etwas nach dem Ende lesen, die Uhren von App und Server gehen nicht genau gleich. */
const AWAY_END_GRACE_MS = 1000;

/**
 * Liest den Stand neu, wenn Folgen oder Ausflug von selbst enden: Dazu kommt kein Ereignis.
 *
 * @param until - Ende als Server-Zeit, `null` oder `undefined`, wenn das Jelly auf seinem Platz
 *   ist.
 * @param offset - Abstand zur Uhr des Servers.
 */
function useAwayEnd(until: number | null | undefined, offset: number, reload: () => void) {
  useEffect(() => {
    if (until === null || until === undefined || !backend.desktop) return;
    const remaining = until - (Date.now() + offset);
    const timer = window.setTimeout(reload, Math.max(0, remaining) + AWAY_END_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [until, offset, reload]);
}

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
 * Lässt das Jelly auf ein neues Ziel oder einen Ausflug reagieren und hält den Stand aktuell.
 *
 * @param onChanged - Bekommt nach einem Wechsel, was das Jelly dazu sagt. Sollte stabil sein.
 */
export function useFollow(
  state: ReturnType<typeof useGameState>,
  ready: boolean,
  onChanged: (message: string) => void,
) {
  const { game, offset, reload } = state;
  const me = game.me;
  const tripUntil = me ? (me.trip?.until ?? null) : undefined;
  // Vor dem ersten Laden steht hier der Vorschau-Stand, und ein gespeichertes Ziel ist nichts Neues.
  useAwayReaction(
    ready ? me?.follow_player_id : undefined,
    ready ? tripUntil : undefined,
    onChanged,
  );
  useAwayEnd(me?.follow_until ?? tripUntil, offset, reload);
}

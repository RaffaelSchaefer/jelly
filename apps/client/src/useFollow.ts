/**
 * Was das Pet vom Dazustellen mitbekommt. Gewählt wird das Ziel auf der Karte, hier kommt es nur
 * als neuer Stand an.
 *
 * @module
 */

import { useEffect, useRef } from "react";

import type { useGameState } from "./useGame";

import * as backend from "./backend";
import { followMessage } from "./pet";

/** Etwas nach dem Ende lesen, die Uhren von App und Server gehen nicht genau gleich. */
const FOLLOW_END_GRACE_MS = 1000;

/**
 * Liest den Stand neu, wenn das Folgen von selbst endet: Dazu kommt kein Ereignis.
 *
 * @param until - Ende als Server-Zeit, `null` oder `undefined` ohne Ziel.
 * @param offset - Abstand zur Uhr des Servers.
 */
function useFollowEnd(until: number | null | undefined, offset: number, reload: () => void) {
  useEffect(() => {
    if (until === null || until === undefined || !backend.desktop) return;
    const remaining = until - (Date.now() + offset);
    const timer = window.setTimeout(reload, Math.max(0, remaining) + FOLLOW_END_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [until, offset, reload]);
}

/** Meldet, was das Jelly zu einem neuen Ziel sagt. */
function useFollowReaction(
  target: number | null | undefined,
  onChanged: (message: string) => void,
) {
  const last = useRef(target);
  useEffect(() => {
    const message = followMessage(last.current, target);
    last.current = target;
    if (message) onChanged(message);
  }, [target, onChanged]);
}

/**
 * Lässt das Jelly auf ein neues Ziel reagieren und hält den Stand aktuell.
 *
 * @param onChanged - Bekommt nach einem Wechsel, was das Jelly dazu sagt. Sollte stabil sein.
 */
export function useFollow(
  state: ReturnType<typeof useGameState>,
  ready: boolean,
  onChanged: (message: string) => void,
) {
  const { game, offset, reload } = state;
  // Vor dem ersten Laden steht hier der Vorschau-Stand, und ein gespeichertes Ziel ist nichts Neues.
  useFollowReaction(ready ? game.me?.follow_player_id : undefined, onChanged);
  useFollowEnd(game.me?.follow_until, offset, reload);
}

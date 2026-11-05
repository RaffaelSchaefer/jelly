/**
 * Das eigene Jelly zu einem anderen stellen und die Liste der Jellies dafür, in der Vorschau ohne
 * Backend.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from "react";

import * as backend from "./backend";
import { followMessage, PREVIEW_PLAYERS, sortStagePlayers, type StagePlayer } from "./pet";
import { inRunningLan, type useBackendCall, type useGameState } from "./useGame";

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

/**
 * Meldet, was das Jelly zu einem neuen Ziel sagt. Als Effekt, nicht in `setFollow`: Auch die Karte
 * im anderen Fenster und der Server ändern das Ziel, hier kommt es nur als neuer Stand an.
 */
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
 * Stellt das Jelly über denselben Aufrufschutz wie die übrigen Aktionen zu einem anderen.
 *
 * @param onChanged - Bekommt nach einem Wechsel, was das Jelly dazu sagt. Sollte stabil sein.
 */
export function useFollow(
  state: ReturnType<typeof useGameState>,
  call: ReturnType<typeof useBackendCall>,
  ready: boolean,
  onChanged: (message: string) => void,
) {
  const { game, patchGame, setGame, offset, reload } = state;
  const { busy, inFlight, run } = call;
  const allowed = inRunningLan(game, ready);
  const ownId = game.me?.id;
  /** `null`, solange die Bühne noch keine Liste geliefert hat. */
  const [players, setPlayers] = useState<StagePlayer[] | null>(null);
  // Vor dem ersten Laden steht hier der Vorschau-Stand, und ein gespeichertes Ziel ist nichts Neues.
  useFollowReaction(ready ? game.me?.follow_player_id : undefined, onChanged);
  useFollowEnd(game.me?.follow_until, offset, reload);

  /**
   * Liest die Liste. Scheitert es, bleibt die letzte stehen und die Fehleranzeige meldet es.
   *
   * Ponytail: nur beim Öffnen des Panels. Live erst, wenn die Liste dort spürbar veraltet.
   */
  const loadPlayers = useCallback(async () => {
    if (!allowed) return;
    const stage = backend.desktop
      ? await run(backend.getStage, false)
      : { players: PREVIEW_PLAYERS };
    if (stage) setPlayers(sortStagePlayers(stage.players, ownId));
  }, [allowed, ownId, run]);

  /**
   * Stellt das Jelly neben `playerId` oder lässt es mit `null` weggehen. `true`, wenn es geklappt
   * hat.
   */
  const setFollow = useCallback(
    async (playerId: number | null) => {
      if (!allowed || inFlight.current) return false;
      if (backend.desktop) {
        const next = await run(() => backend.setFollow(playerId));
        if (!next) return false;
        setGame(next);
      } else {
        patchGame((current) => ({
          ...current,
          me: current.me && { ...current.me, follow_player_id: playerId, follow_until: null },
        }));
      }
      return true;
    },
    [allowed, inFlight, run, setGame, patchGame],
  );

  return {
    players,
    loadPlayers,
    setFollow,
    followAllowed: allowed,
    followDisabled: !allowed || busy,
  };
}

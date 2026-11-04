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
  const { game, patchGame, setGame } = state;
  const { busy, inFlight, run } = call;
  const allowed = inRunningLan(game, ready);
  const ownId = game.me?.id;
  /** `null`, solange die Bühne noch keine Liste geliefert hat. */
  const [players, setPlayers] = useState<StagePlayer[] | null>(null);
  // Vor dem ersten Laden steht hier der Vorschau-Stand, und ein gespeichertes Ziel ist nichts Neues.
  useFollowReaction(ready ? game.me?.follow_player_id : undefined, onChanged);

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
          me: current.me && { ...current.me, follow_player_id: playerId },
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

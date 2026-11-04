/**
 * Das eigene Jelly zu einem anderen stellen und die Liste der Jellies dafür, in der Vorschau ohne
 * Backend.
 *
 * @module
 */

import { useCallback, useState } from "react";

import * as backend from "./backend";
import { PREVIEW_PLAYERS, sortStagePlayers, type StagePlayer } from "./pet";
import { inRunningLan, type useBackendCall, type useGameState } from "./useGame";

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
      onChanged(playerId === null ? "Ich geh wieder meiner Wege." : "Ich stell mich dazu.");
      return true;
    },
    [allowed, inFlight, run, setGame, patchGame, onChanged],
  );

  return {
    players,
    loadPlayers,
    setFollow,
    followAllowed: allowed,
    followDisabled: !allowed || busy,
  };
}

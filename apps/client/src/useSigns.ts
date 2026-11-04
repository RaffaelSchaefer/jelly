/**
 * Das eigene Schild heben und senken, in der Vorschau ohne Backend.
 *
 * @module
 */

import { useCallback } from "react";

import * as backend from "./backend";
import { inRunningLan, type useBackendCall, type useGameState } from "./useGame";

/**
 * Setzt Schilder über denselben Aufrufschutz wie die übrigen Aktionen.
 *
 * @param onChanged - Bekommt nach einem Wechsel, was das Jelly dazu sagt. Sollte stabil sein.
 */
export function useSigns(
  state: ReturnType<typeof useGameState>,
  call: ReturnType<typeof useBackendCall>,
  ready: boolean,
  onChanged: (message: string) => void,
) {
  const { game, patchGame, setGame } = state;
  const { busy, inFlight, run } = call;
  const allowed = inRunningLan(game, ready);

  /** Hebt ein Schild oder senkt es mit `null`. `true`, wenn es geklappt hat. */
  const setSign = useCallback(
    async (key: string | null) => {
      if (!allowed || inFlight.current) return false;
      if (backend.desktop) {
        const next = await run(() => backend.setSign(key));
        if (!next) return false;
        setGame(next);
      } else {
        patchGame((current) => ({ ...current, me: current.me && { ...current.me, sign: key } }));
      }
      onChanged(key ? "Schild ist oben. Die Bühne sieht’s!" : "Schild ist wieder unten.");
      return true;
    },
    [allowed, inFlight, run, setGame, patchGame, onChanged],
  );

  return { setSign, signsAllowed: allowed, signsDisabled: !allowed || busy };
}

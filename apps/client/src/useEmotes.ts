/**
 * Bestätigte Emotes und ihre kurze lokale Darstellung, in der Vorschau ohne Backend.
 *
 * @module
 */

import { emoteSeconds } from "@jelly/scene/partner-emotes";
import { useCallback, useEffect, useState } from "react";

import type { CatalogEntry, PartnerLook } from "./pet";

import * as backend from "./backend";
import { inRunningLan, type useBackendCall, type useGameState } from "./useGame";

/** Angezeigtes Emote mit Beginn auf der monotonen Browser-Uhr in Millisekunden. */
export interface ActiveEmote extends CatalogEntry {
  startedAt: number;
  /** Wer beim Partner-Emote herüberkommt. Ohne Aussehen tanzt das eigene Jelly allein. */
  partner?: PartnerLook | null;
}

/** Sendet Emotes über denselben Aufrufschutz wie die übrigen Aktionen. */
export function useEmotes(
  state: ReturnType<typeof useGameState>,
  call: ReturnType<typeof useBackendCall>,
  ready: boolean,
) {
  const { game, catalog, setGame } = state;
  const { busy, inFlight, run } = call;
  const [activeEmote, setActiveEmote] = useState<ActiveEmote | null>(null);
  const allowed = inRunningLan(game, ready);

  useEffect(() => {
    if (!activeEmote) return;
    const duration = emoteSeconds(activeEmote.key) * 1000;
    const remaining = duration - (performance.now() - activeEmote.startedAt);
    const timer = window.setTimeout(() => setActiveEmote(null), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [activeEmote]);

  /** Zeigt eine Geste nur lokal, etwa ein Partner-Emote, das der Server schon gezählt hat. */
  const showEmote = useCallback(
    (entry: CatalogEntry, partner?: PartnerLook | null) =>
      setActiveEmote({ ...entry, startedAt: performance.now(), partner }),
    [],
  );

  const playEmote = useCallback(
    async (key: string) => {
      const entry = catalog.emotes.find((item) => item.key === key);
      if (!allowed || inFlight.current || !entry) return false;
      if (backend.desktop) {
        const next = await run(() => backend.emote(key));
        if (!next) return false;
        setGame(next);
      }
      setActiveEmote({ ...entry, startedAt: performance.now() });
      return true;
    },
    [allowed, catalog.emotes, inFlight, run, setGame],
  );

  return { activeEmote, playEmote, showEmote, emotesDisabled: !allowed || busy };
}

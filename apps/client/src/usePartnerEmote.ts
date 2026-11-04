/**
 * Partner-Emotes: einen Code für ein anderes Jelly erzeugen oder mit dessen Code beitreten. In der
 * Vorschau ohne Backend.
 *
 * @module
 */

import { useCallback, useEffect, useState } from "react";

import * as backend from "./backend";
import {
  partnerLook,
  PREVIEW_PLAYERS,
  type CatalogEntry,
  type PartnerLook,
  type ServerEvent,
} from "./pet";
import { inRunningLan, useServerEvents, type useBackendCall, type useGameState } from "./useGame";

/** Ein laufendes Angebot: Code und Geste, bis `expiresAt` (Server-Zeit). */
export interface PartnerOffer {
  code: string;
  key: string;
  expiresAt: number;
  /** Gesamte Laufzeit des Codes. Die Uhr ist voll, wenn noch so viel übrig ist. */
  durationMs: number;
}

/** Wie lange ein Code in der Vorschau gilt. Im Betrieb bestimmt das der Server. */
const PREVIEW_CODE_MS = 120_000;

/** Wer in der Vorschau herüberkommt. */
const PREVIEW_PARTNER_ID = 1;

/** Das Angebot der Vorschau, ohne Server. */
function previewOffer(key: string): PartnerOffer {
  const expiresAt = Date.now() + PREVIEW_CODE_MS;
  return { code: "4242", key, expiresAt, durationMs: PREVIEW_CODE_MS };
}

/**
 * Das Angebot aus der Antwort des Servers. Nach einem Start gibt es immer ein Konto mit
 * Server-Zeit.
 */
function offerFrom({ code, key, expiresAt, game }: backend.PartnerOffer): PartnerOffer {
  return { code, key, expiresAt, durationMs: expiresAt - game.me!.server_time };
}

/** Was das Jelly nach einem gelungenen Partner-Emote sagt. */
function partnerMessage(xpGained: number) {
  return xpGained > 0 ? `Zusammen macht’s mehr Spaß: +${xpGained} XP!` : "Nochmal mit dir? Gern!";
}

/**
 * Wie der Partner aussieht. `null`, wenn das nicht zu erfahren ist: Dann tanzt das Jelly allein.
 *
 * Nicht über den Aufrufschutz: Der verwirft Aufrufe, solange ein anderer läuft, und zeigte ein
 * Scheitern als Fehler, obwohl nur der zweite Tänzer fehlt.
 */
function fetchPartnerLook(partnerId: number): Promise<PartnerLook | null> {
  if (!backend.desktop) return Promise.resolve(partnerLook(PREVIEW_PLAYERS, partnerId));
  return backend.getStage().then(
    (stage) => partnerLook(stage.players, partnerId),
    () => null,
  );
}

/** Zeigt die Geste lokal und lässt das Jelly etwas sagen. `partnerId` ist, wer mitmacht. */
type PlayPartner = (
  entry: CatalogEntry | undefined,
  message: string,
  partnerId: number | null,
) => void;

/** Baut {@link PlayPartner} aus der lokalen Geste und der Sprechblase. Stabil, solange beide es sind. */
export function usePlayPartner(
  showEmote: (entry: CatalogEntry, partner: PartnerLook | null) => void,
  say: (text: string) => void,
) {
  return useCallback<PlayPartner>(
    async (entry, text, partnerId) => {
      // Erst das Aussehen, so steht der Partner ab dem ersten Bild da.
      const look = entry && partnerId !== null ? await fetchPartnerLook(partnerId) : null;
      if (entry) showEmote(entry, look);
      say(text);
    },
    [showEmote, say],
  );
}

/**
 * Der eigene Code, bis er abläuft oder jemand beitritt. Ein `partner.emote` aus dem Stream trägt
 * die Geste, die XP kommen als eigenes `xp.gained` hinterher.
 */
function useOffer(state: ReturnType<typeof useGameState>, ready: boolean, onPlay: PlayPartner) {
  const { catalog, offset } = state;
  const [offer, setOffer] = useState<PartnerOffer | null>(null);

  // Ein abgelaufener Code verschwindet von selbst, gegen die Uhr des Servers.
  useEffect(() => {
    if (!offer) return;
    const remaining = offer.expiresAt - (Date.now() + offset);
    const timer = window.setTimeout(() => setOffer(null), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [offer, offset]);

  const onEvent = useCallback(
    (event: ServerEvent) => {
      if (event.type !== "partner.emote") return;
      const key = String(event.payload?.key);
      onPlay(
        catalog.partner_emotes.find((item) => item.key === key),
        "Jemand macht mit!",
        event.player_id,
      );
      setOffer(null);
    },
    [catalog.partner_emotes, onPlay],
  );
  useServerEvents(backend.desktop && ready, onEvent);

  return [offer, setOffer] as const;
}

/**
 * Startet und betritt Partner-Emotes über denselben Aufrufschutz wie die übrigen Aktionen.
 *
 * @param onPlay - Zeigt die Geste lokal, denn vom Server kommt dafür kein eigenes Emote-Ereignis.
 *   Sollte stabil sein.
 */
export function usePartnerEmote(
  state: ReturnType<typeof useGameState>,
  call: ReturnType<typeof useBackendCall>,
  ready: boolean,
  onPlay: PlayPartner,
) {
  const { game, catalog, setGame } = state;
  const { busy, inFlight, run } = call;
  const allowed = inRunningLan(game, ready);
  const [offer, setOffer] = useOffer(state, ready, onPlay);

  /** Erzeugt einen Code für `key`. Ein neuer Code ersetzt den alten. `true`, wenn es geklappt hat. */
  const startPartner = useCallback(
    async (key: string) => {
      if (!allowed || inFlight.current) return false;
      if (!backend.desktop) {
        setOffer(previewOffer(key));
        return true;
      }
      const next = await run(() => backend.startPartnerEmote(key));
      if (!next) return false;
      setGame(next.game);
      setOffer(offerFrom(next));
      return true;
    },
    [allowed, inFlight, run, setGame],
  );

  /** Tritt mit `code` bei. `true`, wenn es geklappt hat. */
  const joinPartner = useCallback(
    async (code: string) => {
      if (!allowed || inFlight.current) return false;
      const partnerEmotes = catalog.partner_emotes;
      if (!backend.desktop) {
        // Der Code wählt die Geste, so sind in der Vorschau alle zu sehen.
        const entry = partnerEmotes[Number(code) % partnerEmotes.length];
        onPlay(entry, partnerMessage(2), PREVIEW_PARTNER_ID);
        return true;
      }
      const next = await run(() => backend.joinPartnerEmote(code));
      if (!next) return false;
      setGame(next.game);
      onPlay(
        partnerEmotes.find((item) => item.key === next.key),
        partnerMessage(next.xpGained),
        next.partnerId,
      );
      return true;
    },
    [allowed, inFlight, run, setGame, catalog.partner_emotes, onPlay],
  );

  /** Zurück zur Auswahl. Der Code gilt beim Server weiter, ein Beitritt spielt die Geste trotzdem. */
  const dismissOffer = useCallback(() => setOffer(null), [setOffer]);

  return {
    offer,
    dismissOffer,
    startPartner,
    joinPartner,
    partnerAllowed: allowed,
    partnerDisabled: !allowed || busy,
  };
}

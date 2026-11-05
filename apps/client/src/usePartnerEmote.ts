/**
 * Partner-Emotes im Pet: Aufforderungen anderer Jellies beantworten und das Duett zeigen.
 * Auffordern geht auf der Karte (`map/partner.ts`).
 *
 * Wer auffordert, erfährt die Antwort aus dem Stream. Wer annimmt, hat die Geste aus seiner
 * Antwort.
 *
 * @module
 */

import { useCallback, useEffect, useState } from "react";

import * as backend from "./backend";
import {
  classifyInvite,
  partnerLook,
  type CatalogEntry,
  type InviteChange,
  type PartnerInvite,
  type PartnerLook,
  type ServerEvent,
  type StagePlayer,
} from "./pet";
import { inRunningLan, useServerEvents, type useBackendCall, type useGameState } from "./useGame";

/** Die Aufforderung eines anderen Jellys. */
export interface IncomingInvite {
  invite: PartnerInvite;
  fromName: string;
  /** Anzeigetext der Geste. */
  label: string;
}

/** Name, wenn das Jelly gerade nicht auf der Bühne steht. */
const UNKNOWN_NAME = "Ein Jelly";

/** Was das Jelly nach einem gelungenen Partner-Emote sagt. */
function partnerMessage(xpGained: number) {
  return xpGained > 0 ? `Zusammen macht’s mehr Spaß: +${xpGained} XP!` : "Nochmal mit dir? Gern!";
}

/**
 * Die Jellies der Bühne. Leer, wenn das nicht zu erfahren ist.
 *
 * Nicht über den Aufrufschutz: Der verwirft Aufrufe, solange ein anderer läuft, und zeigte ein
 * Scheitern als Fehler, obwohl nur Name oder zweiter Tänzer fehlen.
 */
function fetchStagePlayers(): Promise<StagePlayer[]> {
  return backend.getStage().then(
    (stage) => stage.players,
    () => [],
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
      // Erst das Aussehen, so steht der Partner ab dem ersten Bild da. Ohne tanzt das Jelly allein.
      const look =
        entry && partnerId !== null ? partnerLook(await fetchStagePlayers(), partnerId) : null;
      if (entry) showEmote(entry, look);
      say(text);
    },
    [showEmote, say],
  );
}

/**
 * Räumt eine Aufforderung beim Ablauf weg: Dazu kommt kein Ereignis, die Uhr läuft gegen den
 * Server.
 */
function useInviteExpiry(expiresAt: number | undefined, offset: number, onExpired: () => void) {
  useEffect(() => {
    if (expiresAt === undefined) return;
    const remaining = expiresAt - (Date.now() + offset);
    const timer = window.setTimeout(onExpired, Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [expiresAt, offset, onExpired]);
}

/** Was {@link usePartnerEmote} zusätzlich braucht. Beides sollte stabil sein. */
export interface PartnerReactions {
  /** Zeigt die Geste lokal, denn vom Server kommt dafür kein eigenes Emote-Ereignis. */
  play: PlayPartner;
  /** Lässt das Jelly etwas sagen. */
  say: (text: string) => void;
}

/** Die offene fremde Aufforderung und wie Ereignisse sie und das Duett ändern. */
function useIncomingInvite(
  state: ReturnType<typeof useGameState>,
  ready: boolean,
  { play, say }: PartnerReactions,
) {
  const { catalog, offset, game } = state;
  const ownId = game.me?.id;
  const [incoming, setIncoming] = useState<IncomingInvite | null>(null);
  const clearIncoming = useCallback(() => setIncoming(null), []);
  useInviteExpiry(incoming?.invite.expires_at, offset, clearIncoming);

  /** Eine Aufforderung hat sich geändert. Nur eine offene fremde zeigt etwas Neues. */
  const applyChange = useCallback(
    async ({ role, invite }: InviteChange) => {
      if (role === "mine") {
        if (invite.state === "declined") say("Gerade passt es wohl nicht.");
        return;
      }
      if (invite.state !== "pending") {
        setIncoming((now) => (now?.invite.id === invite.id ? null : now));
        return;
      }
      const players = await fetchStagePlayers();
      const fromName = players.find((item) => item.id === invite.from_id)?.name ?? UNKNOWN_NAME;
      const entry = catalog.partner_emotes.find((item) => item.key === invite.key);
      setIncoming({ invite, fromName, label: entry?.label ?? invite.key });
    },
    [catalog.partner_emotes, say],
  );

  const onEvent = useCallback(
    (event: ServerEvent) => {
      if (event.type === "partner_emote.updated") {
        const change = classifyInvite(event.payload, ownId);
        if (change) void applyChange(change);
        return;
      }
      if (event.type !== "partner.emote") return;
      const key = String(event.payload?.key);
      const entry = catalog.partner_emotes.find((item) => item.key === key);
      play(entry, "Jemand macht mit!", event.player_id);
    },
    [ownId, applyChange, catalog.partner_emotes, play],
  );
  useServerEvents(backend.desktop && ready, onEvent);

  return [incoming, setIncoming] as const;
}

/**
 * Antwortet über denselben Aufrufschutz wie die übrigen Aktionen.
 *
 * @param react - Was das Jelly dazu tut und sagt.
 */
export function usePartnerEmote(
  state: ReturnType<typeof useGameState>,
  call: ReturnType<typeof useBackendCall>,
  ready: boolean,
  react: PartnerReactions,
) {
  const { catalog, setGame } = state;
  const { busy, inFlight, run } = call;
  const { play } = react;
  const [incoming, setIncoming] = useIncomingInvite(state, ready, react);

  /**
   * Antwortet auf die fremde Aufforderung. Scheitert das Annehmen, etwa weil die Jellies zu weit
   * auseinander stehen, bleibt sie offen und lässt sich noch einmal annehmen.
   */
  const answerInvite = useCallback(
    async (accepted: boolean) => {
      if (!incoming || inFlight.current) return;
      const entry = catalog.partner_emotes.find((item) => item.key === incoming.invite.key);
      const answer = accepted ? "accepted" : "declined";
      const next = await run(() => backend.answerPartner(incoming.invite.id, answer));
      if (!next) return;
      setGame(next.game);
      setIncoming(null);
      if (accepted) play(entry, partnerMessage(next.xpGained), incoming.invite.from_id);
    },
    [incoming, inFlight, catalog.partner_emotes, setIncoming, play, run, setGame],
  );

  return {
    incoming,
    answerInvite,
    partnerDisabled: !inRunningLan(state.game, ready) || busy,
  };
}

/**
 * Partner-Emotes: ein anderes Jelly auffordern und auf Aufforderungen antworten. In der Vorschau
 * ohne Backend.
 *
 * Wer auffordert, erfährt die Antwort aus dem Stream. Wer annimmt, hat die Geste aus seiner
 * Antwort.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from "react";

import * as backend from "./backend";
import {
  classifyInvite,
  partnerLook,
  PREVIEW_PLAYERS,
  type CatalogEntry,
  type InviteChange,
  type PartnerInvite,
  type PartnerLook,
  type ServerEvent,
  type StagePlayer,
} from "./pet";
import { inRunningLan, useServerEvents, type useBackendCall, type useGameState } from "./useGame";

/** Die eigene Aufforderung, bis jemand antwortet oder sie abläuft. */
export interface SentInvite {
  invite: PartnerInvite;
  partnerName: string;
  /** Gesamte Laufzeit. Die Uhr ist voll, wenn noch so viel übrig ist. */
  durationMs: number;
}

/** Die Aufforderung eines anderen Jellys. */
export interface IncomingInvite {
  invite: PartnerInvite;
  fromName: string;
  /** Anzeigetext der Geste. */
  label: string;
}

/** Wie lange eine Aufforderung in der Vorschau gilt. Im Betrieb bestimmt das der Server. */
const PREVIEW_INVITE_MS = 120_000;

/** So lange überlegt das andere Jelly in der Vorschau. */
const PREVIEW_ANSWER_MS = 2000;

/** Das Jelly, das in der Vorschau zurückfragt, statt anzunehmen. So ist das Pop-up zu sehen. */
const PREVIEW_ASKING_ID = 1;

/** Was ein Partner-Emote in der Vorschau einbringt. */
const PREVIEW_XP = 2;

/** Name, wenn das Jelly gerade nicht auf der Bühne steht. */
const UNKNOWN_NAME = "Ein Jelly";

/** Eine Aufforderung der Vorschau, ohne Server. */
function previewInvite(key: string, fromId: number, partnerId: number): PartnerInvite {
  return {
    id: Date.now(),
    key,
    from_id: fromId,
    partner_ids: [partnerId],
    state: "pending",
    expires_at: Date.now() + PREVIEW_INVITE_MS,
  };
}

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
  if (!backend.desktop) return Promise.resolve(PREVIEW_PLAYERS);
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

/** Die Aufforderungen in beide Richtungen und wie Ereignisse sie ändern. */
function useInvites(
  state: ReturnType<typeof useGameState>,
  ready: boolean,
  react: PartnerReactions,
) {
  const { catalog, offset, game } = state;
  const { play, say } = react;
  const ownId = game.me?.id;
  const [sent, setSent] = useState<SentInvite | null>(null);
  const [incoming, setIncoming] = useState<IncomingInvite | null>(null);
  const clearSent = useCallback(() => setSent(null), []);
  const clearIncoming = useCallback(() => setIncoming(null), []);
  useInviteExpiry(sent?.invite.expires_at, offset, clearSent);
  useInviteExpiry(incoming?.invite.expires_at, offset, clearIncoming);

  /** Nimmt eine fremde Aufforderung auf. */
  const receive = useCallback(
    async (invite: PartnerInvite) => {
      const players = await fetchStagePlayers();
      const fromName = players.find((item) => item.id === invite.from_id)?.name ?? UNKNOWN_NAME;
      const entry = catalog.partner_emotes.find((item) => item.key === invite.key);
      setIncoming({ invite, fromName, label: entry?.label ?? invite.key });
    },
    [catalog.partner_emotes],
  );

  /** Eine Aufforderung hat sich geändert. Nur eine offene fremde zeigt etwas Neues. */
  const applyChange = useCallback(
    ({ role, invite }: InviteChange) => {
      if (role === "incoming") {
        if (invite.state === "pending") void receive(invite);
        else setIncoming((now) => (now?.invite.id === invite.id ? null : now));
        return;
      }
      if (invite.state === "pending") return;
      setSent((now) => (now?.invite.id === invite.id ? null : now));
      if (invite.state === "declined") say("Gerade passt es wohl nicht.");
    },
    [receive, say],
  );

  const onEvent = useCallback(
    (event: ServerEvent) => {
      if (event.type === "partner_emote.updated") {
        const change = classifyInvite(event.payload, ownId);
        if (change) applyChange(change);
        return;
      }
      if (event.type !== "partner.emote") return;
      const key = String(event.payload?.key);
      const entry = catalog.partner_emotes.find((item) => item.key === key);
      play(entry, "Jemand macht mit!", event.player_id);
      setSent(null);
    },
    [ownId, applyChange, catalog.partner_emotes, play],
  );
  useServerEvents(backend.desktop && ready, onEvent);

  return { sent, setSent, incoming, setIncoming, receive };
}

/** Was das Auffordern und das Antworten gemeinsam brauchen. */
interface PartnerContext {
  state: ReturnType<typeof useGameState>;
  call: ReturnType<typeof useBackendCall>;
  /** Läuft eine LAN, an der das Jelly teilnimmt? */
  allowed: boolean;
  invites: ReturnType<typeof useInvites>;
  react: PartnerReactions;
}

/** Eigene Aufforderungen: losschicken, zurückziehen und in der Vorschau die Antwort spielen. */
function useSending({ state, call, allowed, invites, react }: PartnerContext) {
  const { game, catalog, setGame } = state;
  const { inFlight, run } = call;
  const { sent, setSent, receive } = invites;
  const { play } = react;
  const previewTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(previewTimer.current), []);

  /** Was das andere Jelly in der Vorschau antwortet. */
  const previewAnswer = useCallback(
    (invite: PartnerInvite, partner: StagePlayer) => {
      previewTimer.current = window.setTimeout(() => {
        setSent(null);
        if (partner.id === PREVIEW_ASKING_ID) {
          void receive(previewInvite(invite.key, partner.id, invite.from_id));
          return;
        }
        const entry = catalog.partner_emotes.find((item) => item.key === invite.key);
        play(entry, partnerMessage(PREVIEW_XP), partner.id);
      }, PREVIEW_ANSWER_MS);
    },
    [setSent, receive, catalog.partner_emotes, play],
  );

  /** Fordert `partner` zu `key` auf. `true`, wenn es geklappt hat. */
  const invite = useCallback(
    async (key: string, partner: StagePlayer) => {
      if (!allowed || inFlight.current) return false;
      if (!backend.desktop) {
        const local = previewInvite(key, game.me?.id ?? 0, partner.id);
        setSent({ invite: local, partnerName: partner.name, durationMs: PREVIEW_INVITE_MS });
        previewAnswer(local, partner);
        return true;
      }
      const next = await run(() => backend.invitePartner(key, partner.id));
      if (!next) return false;
      setGame(next.game);
      const durationMs = next.invite.expires_at - next.game.me!.server_time;
      setSent({ invite: next.invite, partnerName: partner.name, durationMs });
      return true;
    },
    [allowed, inFlight, game.me?.id, previewAnswer, run, setGame, setSent],
  );

  /**
   * Zieht die eigene Aufforderung zurück. Auch nach einem Fehler ist die Uhr weg, sie läuft ohnehin
   * ab.
   */
  const cancelInvite = useCallback(async () => {
    window.clearTimeout(previewTimer.current);
    const id = sent?.invite.id;
    setSent(null);
    if (!backend.desktop || id === undefined) return;
    const next = await run(() => backend.answerPartner(id, "cancelled"));
    if (next) setGame(next.game);
  }, [sent?.invite.id, setSent, run, setGame]);

  return { invite, cancelInvite };
}

/**
 * Antwortet auf die fremde Aufforderung. Scheitert das Annehmen, etwa weil die Jellies zu weit
 * auseinander stehen, bleibt sie offen und lässt sich noch einmal annehmen.
 */
function useAnswering({ state, call, invites, react }: PartnerContext) {
  const { catalog, setGame } = state;
  const { inFlight, run } = call;
  const { incoming, setIncoming } = invites;
  const { play } = react;
  return useCallback(
    async (accepted: boolean) => {
      if (!incoming || inFlight.current) return;
      const entry = catalog.partner_emotes.find((item) => item.key === incoming.invite.key);
      if (!backend.desktop) {
        setIncoming(null);
        if (accepted) play(entry, partnerMessage(PREVIEW_XP), incoming.invite.from_id);
        return;
      }
      const answer = accepted ? "accepted" : "declined";
      const next = await run(() => backend.answerPartner(incoming.invite.id, answer));
      if (!next) return;
      setGame(next.game);
      setIncoming(null);
      if (accepted) play(entry, partnerMessage(next.xpGained), incoming.invite.from_id);
    },
    [incoming, inFlight, catalog.partner_emotes, setIncoming, play, run, setGame],
  );
}

/**
 * Fordert auf und antwortet über denselben Aufrufschutz wie die übrigen Aktionen.
 *
 * @param react - Was das Jelly dazu tut und sagt.
 */
export function usePartnerEmote(
  state: ReturnType<typeof useGameState>,
  call: ReturnType<typeof useBackendCall>,
  ready: boolean,
  react: PartnerReactions,
) {
  const allowed = inRunningLan(state.game, ready);
  const invites = useInvites(state, ready, react);
  const context = { state, call, allowed, invites, react };
  const { invite, cancelInvite } = useSending(context);
  const answerInvite = useAnswering(context);
  return {
    sent: invites.sent,
    incoming: invites.incoming,
    invite,
    cancelInvite,
    answerInvite,
    partnerAllowed: allowed,
    partnerDisabled: !allowed || call.busy,
  };
}

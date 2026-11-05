/**
 * Woher die Karte ihre Daten bekommt: In der Desktop-App kommt alles über Rust, HTTP gibt es in der
 * Oberfläche nicht.
 *
 * @module
 */

import type { StageEvent, StageMove, StageSource, StreamListener } from "@jelly/stage";

import type { CatalogEntry, PartnerInvite } from "../pet";

import * as backend from "../backend";

/** Was die Karte zusätzlich zur Bühne braucht. */
export interface MapSource extends StageSource {
  /** Das eigene Jelly und die Einstellung „Weniger Bewegung“ vom letzten Lesen. */
  readOwn: () => { id: number | null; reducedMotion: boolean };
  /** Stellt das Jelly neben ein anderes oder mit `null` weg. Liefert das neue Ziel. */
  setFollow: (playerId: number | null) => Promise<number | null>;
  /** Die Gesten, die zwei Jellies zusammen machen können. */
  readPartnerEmotes: () => Promise<CatalogEntry[]>;
  /** Fordert ein Jelly zu einem Partner-Emote auf. */
  invitePartner: (key: string, partnerId: number) => Promise<PartnerInvite>;
  /** Zieht die eigene Aufforderung zurück. */
  cancelInvite: (id: number) => Promise<void>;
  /** Hört auf alle Ereignisse der LAN, auch auf solche, die die Bühne nicht kennt. */
  onInviteEvent: (handler: (event: StageEvent) => void) => void;
}

/**
 * Die Daten aus Rust. Erst läuft `listen`, dann wird gelesen: Rust wiederholt keine Ereignisse,
 * also hebt die Quelle auf, was vor `subscribe` ankommt.
 *
 * Ponytail: Der Puffer ist unbegrenzt, er lebt aber nur bis zum ersten geglückten Lesen.
 */
export async function createDesktopSource(): Promise<MapSource> {
  const early: StageEvent[] = [];
  const earlyMoves: StageMove[] = [];
  let listener: StreamListener | null = null;
  let own = { id: null as number | null, reducedMotion: false };
  let onInvite: ((event: StageEvent) => void) | null = null;
  await backend.onStageEvent((event) => {
    onInvite?.(event);
    if (listener) listener.onEvent(event);
    else early.push(event);
  });
  await backend.onStageMove((move) => {
    if (listener) listener.onMove(move);
    else earlyMoves.push(move);
  });
  // Vor dem ersten Lesen gibt es nichts zurückzusetzen: Das Lesen holt ohnehin den neuen Stand.
  await backend.onStreamReset(() => listener?.onReset());
  return {
    readState: async () => {
      const state = await backend.getMapState();
      own = { id: state.ownId, reducedMotion: state.reducedMotion };
      return state.stage;
    },
    readCatalog: backend.getCatalog,
    subscribe: (firstEventId, next) => {
      listener = next;
      for (const event of early.splice(0)) {
        if (event.id > firstEventId) next.onEvent(event);
      }
      for (const move of earlyMoves.splice(0)) next.onMove(move);
    },
    readOwn: () => own,
    setFollow: async (playerId) => {
      const game = await backend.setFollow(playerId);
      return game.me?.follow_player_id ?? null;
    },
    readPartnerEmotes: async () => (await backend.getCatalog()).partner_emotes,
    invitePartner: async (key, partnerId) => (await backend.invitePartner(key, partnerId)).invite,
    cancelInvite: async (id) => {
      await backend.answerPartner(id, "cancelled");
    },
    onInviteEvent: (handler) => {
      onInvite = handler;
    },
  };
}

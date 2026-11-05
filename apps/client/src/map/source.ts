/**
 * Woher die Karte ihre Daten bekommt: In der Desktop-App kommt alles über Rust, HTTP gibt es in der
 * Oberfläche nicht.
 *
 * @module
 */

import type { StageEvent, StageSource, StreamListener } from "@jelly/stage";

import * as backend from "../backend";

/** Was die Karte zusätzlich zur Bühne braucht. */
export interface MapSource extends StageSource {
  /** Das eigene Jelly und die Einstellung „Weniger Bewegung“ vom letzten Lesen. */
  readOwn: () => { id: number | null; reducedMotion: boolean };
  /** Stellt das Jelly neben ein anderes oder mit `null` weg. Liefert das neue Ziel. */
  setFollow: (playerId: number | null) => Promise<number | null>;
}

/**
 * Die Daten aus Rust. Erst läuft `listen`, dann wird gelesen: Rust wiederholt keine Ereignisse,
 * also hebt die Quelle auf, was vor `subscribe` ankommt.
 *
 * Ponytail: Der Puffer ist unbegrenzt, er lebt aber nur bis zum ersten geglückten Lesen.
 */
export async function createDesktopSource(): Promise<MapSource> {
  const early: StageEvent[] = [];
  let listener: StreamListener | null = null;
  let own = { id: null as number | null, reducedMotion: false };
  await backend.onStageEvent((event) => {
    if (listener) listener.onEvent(event);
    else early.push(event);
  });
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
    },
    readOwn: () => own,
    setFollow: async (playerId) => {
      const game = await backend.setFollow(playerId);
      return game.me?.follow_player_id ?? null;
    },
  };
}

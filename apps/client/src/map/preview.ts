/**
 * Daten der Karte für die Browser-Vorschau, ohne Backend: die Halle der Server-Demo mit ein paar
 * Jellies. Die Desktop-App lädt diese Datei nie.
 *
 * @module
 */

import type { StageArea, StagePlayer } from "@jelly/stage";

import { createDemoRoom } from "@jelly/stage/demo-room";

import type { MapSource } from "./source";

import { PREVIEW_CATALOG, PREVIEW_ME } from "../pet";

/**
 * Das eigene Jelly. Nicht 0: Die Bühne liest ein fehlendes Ziel als ID 0, sonst stünden alle bei
 * ihm.
 */
const OWN_ID = 1;
const COLORS = ["mint", "lilac", "peach"];
const SIGN = "cs2";
/** So viele Jellies stehen je Tischreihe, jedes vierte hält ein Schild hoch. */
const PLACES_PER_SEAT = [0.25, 0.75];
const SIGN_EVERY = 4;
const LEVELS = 9;

/** Die Jellies auf den Plätzen der Halle, das erste ist das eigene. */
function listPlayers(areas: StageArea[]): StagePlayer[] {
  const seats = areas.filter((area) => area.kind === "seats");
  const places = seats.flatMap((seat) => PLACES_PER_SEAT.map((share) => ({ seat, share })));
  return places.map(({ seat, share }, index) => ({
    id: OWN_ID + index,
    name: index === 0 ? PREVIEW_ME.name : `Jelly ${index}`,
    color: COLORS[index % COLORS.length],
    cosmetic: null,
    level: 1 + (index % LEVELS),
    sign: index % SIGN_EVERY === 1 ? SIGN : null,
    follow_player_id: null,
    last_seen_at: 0,
    area_id: seat.id,
    home_x: seat.x + seat.width * share,
    home_y: seat.y + seat.height / 2,
  }));
}

/** Eine Bühne, die nur im Speicher lebt. Ereignisse gibt es hier keine. */
export function createPreviewSource(): MapSource {
  const areas = createDemoRoom();
  const players = listPlayers(areas);
  return {
    readState: () => Promise.resolve({ last_event_id: 0, server_time: Date.now(), areas, players }),
    readCatalog: () => Promise.resolve(PREVIEW_CATALOG),
    subscribe: (_firstEventId, listener) => listener.onConnectionChange(true),
    readOwn: () => ({ id: OWN_ID, reducedMotion: false }),
    setFollow: (playerId) => {
      players[0].follow_player_id = playerId;
      return Promise.resolve(playerId);
    },
  };
}

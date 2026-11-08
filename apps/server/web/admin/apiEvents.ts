/**
 * Admin routes for what happens during a LAN: event codes, food events, ceremonies and awards.
 *
 * @module
 */

import { readPublic, sendRequest } from "./api.ts";

/** An event code with how often it was redeemed. */
export interface EventCode {
  id: number;
  lan_id: number;
  title: string;
  code: string;
  xp: number;
  valid_from: number;
  valid_until: number;
  redeemed_count: number;
}

/** What a new event code needs. */
export type NewEventCode = Omit<EventCode, "id" | "redeemed_count">;

/** A food event or a ceremony that is running. */
export interface Gathering {
  kind: string;
  winner_id: number | null;
  ends_at: number;
}

/** What starts a gathering. A ceremony can name its winner. */
export interface NewGathering {
  kind: string;
  seconds: number;
  winner_id: number | null;
}

/** A cosmetic of the catalog and how players get it. */
export interface Cosmetic {
  key: string;
  name: string;
  slot: string;
  unlock: string;
}

/** Lists the event codes of a LAN. */
export function listEventCodes(lanID: number): Promise<EventCode[]> {
  return sendRequest("GET", `/lans/${lanID}/event-codes`);
}

/** Creates an event code. */
export function createEventCode(code: NewEventCode): Promise<unknown> {
  return sendRequest("POST", "/event-codes", code);
}

/** Makes an event code invalid from now on. */
export function endEventCode(codeID: number): Promise<unknown> {
  return sendRequest("POST", `/event-codes/${codeID}/end`);
}

/** Reads the running gathering of a LAN, `null` if there is none. */
export async function loadGathering(lanID: number): Promise<Gathering | null> {
  const answer = await sendRequest<{ gathering: Gathering | null }>(
    "GET",
    `/lans/${lanID}/gathering`,
  );
  return answer.gathering;
}

/** Starts a food event or a ceremony, which replaces a running one. */
export function startGathering(lanID: number, gathering: NewGathering): Promise<unknown> {
  return sendRequest("POST", `/lans/${lanID}/gathering`, gathering);
}

/** Ends the running gathering early. */
export function endGathering(lanID: number): Promise<unknown> {
  return sendRequest("DELETE", `/lans/${lanID}/gathering`);
}

/** Gives a player an award, optionally with a cosmetic. */
export function giveAward(playerID: number, title: string, cosmeticKey: string | null) {
  return sendRequest("POST", "/awards", {
    player_id: playerID,
    title,
    cosmetic_key: cosmeticKey,
  });
}

/** Reads the cosmetics of the catalog. */
export async function loadCosmetics(): Promise<Cosmetic[]> {
  const catalog = await readPublic<{ cosmetics: Cosmetic[] }>("/catalog");
  return catalog.cosmetics;
}

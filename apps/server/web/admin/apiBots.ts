/**
 * Admin routes for bots: accounts of the organizers that play like players.
 *
 * @module
 */

import { sendRequest } from "./api.ts";

/** A bot of a LAN with its XP there. */
export interface Bot {
  id: number;
  name: string;
  xp: number;
}

/** The bots of a LAN and how many of the running LAN play by themselves. */
export interface BotList {
  bots: Bot[];
  auto_count: number;
}

/** Lists the bots of a LAN. */
export function listBots(lanID: number): Promise<BotList> {
  return sendRequest("GET", `/lans/${lanID}/bots`);
}

/** Creates up to 100 bots that join the LAN. */
export function createBots(lanID: number, count: number): Promise<unknown> {
  return sendRequest("POST", `/lans/${lanID}/bots`, { count });
}

/** Sets how many bots play by themselves. 0 stops them. */
export function setAutoBots(count: number): Promise<unknown> {
  return sendRequest("PUT", "/bots/auto", { count });
}

/** Lets one bot act. `xp` only counts for the action `xp`. */
export function runBotAction(botID: number, kind: string, xp: number): Promise<unknown> {
  return sendRequest("POST", `/bots/${botID}/actions`, { kind, xp });
}

/** Deletes all bots and stops the automatic ones. */
export function deleteBots(): Promise<{ deleted: number }> {
  return sendRequest("DELETE", "/bots");
}

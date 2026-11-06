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

/** Lets one bot act. `xp` only counts for the action `xp`, `code` only for `redeem`. */
export function runBotAction(botID: number, kind: string, xp: number, code = ""): Promise<unknown> {
  return sendRequest("POST", `/bots/${botID}/actions`, { kind, xp, code });
}

/** Lets every bot of a LAN redeem a code, one after the other, and counts who managed. */
export async function redeemWithBots(
  lanID: number,
  code: string,
): Promise<[ok: number, all: number]> {
  const { bots } = await listBots(lanID);
  let redeemed = 0;
  for (const bot of bots) {
    // A bot that already redeemed the code is refused like a player, which is fine here.
    const isRedeemed = await runBotAction(bot.id, "redeem", 0, code).then(
      () => true,
      () => false,
    );
    redeemed += isRedeemed ? 1 : 0;
  }
  return [redeemed, bots.length];
}

/** Deletes all bots and stops the automatic ones. */
export function deleteBots(): Promise<{ deleted: number }> {
  return sendRequest("DELETE", "/bots");
}

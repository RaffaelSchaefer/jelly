/**
 * Admin routes for accounts and the log of admin actions.
 *
 * @module
 */

import { sendRequest } from "./api.ts";

/** An account as the admin page lists it. */
export interface PlayerSummary {
  id: number;
  name: string;
  color: string;
  is_bot: boolean;
  hidden: boolean;
  total_xp: number;
  lans: number;
  last_seen_at: number;
  coins: number;
  purchases: PlayerPurchase[];
}

/** A code that gives an account a new secret once. */
export interface RecoveryCode {
  code: string;
  expires_at: number;
}

/** One entry of the admin log. What `target_id` names depends on the action. */
export interface AdminAction {
  id: number;
  action: string;
  target_id: number | null;
  created_at: number;
}

/** Finds accounts by name. An empty search lists the newest ones. */
export function searchPlayers(search: string): Promise<PlayerSummary[]> {
  return sendRequest("GET", `/players?search=${encodeURIComponent(search)}`);
}

/** Creates a recovery code that is valid for 24 hours and replaces an older one. */
export function createRecoveryCode(playerID: number): Promise<RecoveryCode> {
  return sendRequest("POST", `/players/${playerID}/recovery-code`, {});
}

/** Takes a jelly off the stage, or brings it back. */
export function setPlayerHidden(playerID: number, isHidden: boolean): Promise<unknown> {
  return sendRequest("POST", `/players/${playerID}/${isHidden ? "hide" : "show"}`);
}

/** Replaces the name of an account with `Jelly-<number>`. */
export function resetPlayerName(playerID: number): Promise<unknown> {
  return sendRequest("POST", `/players/${playerID}/reset-name`);
}

/** Gives an account XP in its current LAN, as if it had earned it. XP is never taken away. */
export function giveXP(playerID: number, xp: number): Promise<unknown> {
  return sendRequest("POST", `/players/${playerID}/xp`, { xp });
}

/** Gives an account coins in its current LAN, as if it had earned them. */
export function giveCoins(playerID: number, coins: number): Promise<unknown> {
  return sendRequest("POST", `/players/${playerID}/coins`, { coins });
}

/** A purchase an account has made. */
export interface PlayerPurchase {
  cosmetic_key: string;
  price: number;
  lan_id: number | null;
  created_at: number;
}

/** Takes a bought cosmetic back and refunds its price. */
export function refundPurchase(playerID: number, key: string): Promise<unknown> {
  return sendRequest("DELETE", `/players/${playerID}/purchases/${encodeURIComponent(key)}`);
}

/** An achievement of the catalog. */
export interface Achievement {
  key: string;
  title: string;
}

/** Lists every achievement, the secret ones too. */
export function listAchievements(): Promise<Achievement[]> {
  return sendRequest("GET", "/achievements");
}

/** Gives an account an achievement in its current LAN. One it already has stays as it is. */
export function grantAchievement(playerID: number, key: string): Promise<unknown> {
  return sendRequest("POST", `/players/${playerID}/achievements`, { key });
}

/** Deletes an account for good. */
export function deletePlayer(playerID: number): Promise<unknown> {
  return sendRequest("DELETE", `/players/${playerID}`);
}

/** Lists the latest admin actions. */
export function listAdminActions(): Promise<AdminAction[]> {
  return sendRequest("GET", "/actions");
}

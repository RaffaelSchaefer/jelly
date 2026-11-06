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

/** Deletes an account for good. */
export function deletePlayer(playerID: number): Promise<unknown> {
  return sendRequest("DELETE", `/players/${playerID}`);
}

/** Lists the latest admin actions. */
export function listAdminActions(): Promise<AdminAction[]> {
  return sendRequest("GET", "/actions");
}

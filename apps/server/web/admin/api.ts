/**
 * The admin API of the server. The session lives in a cookie that scripts cannot read.
 *
 * @module
 */

const API_PREFIX = "/admin/api";
const REQUEST_TIMEOUT_MS = 10_000;
const CODE_FORBIDDEN = "forbidden";
const CODE_OFFLINE = "offline";
const MESSAGE_OFFLINE = "Der Server antwortet nicht. Prüfe die Verbindung und versuche es erneut.";
const MESSAGE_UNEXPECTED = "Der Server hat unerwartet geantwortet.";

/** An answer of the server that reports a problem, with the text to show. */
export class AdminApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }

  /** Says that nobody is logged in, or that the session has run out. */
  get isForbidden(): boolean {
    return this.code === CODE_FORBIDDEN;
  }
}

/** Sends a request and returns the parsed answer. */
export async function sendRequest<Answer>(
  method: string,
  path: string,
  body?: unknown,
): Promise<Answer> {
  const response = await fetchAnswer(method, path, body);
  const answer: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw readError(answer);
  }
  return answer as Answer;
}

/** Sends the request and turns a broken connection into a text the page can show. */
async function fetchAnswer(method: string, path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(API_PREFIX + path, {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new AdminApiError(CODE_OFFLINE, MESSAGE_OFFLINE);
  }
}

/** Reads the error form of the server, which a proxy in front of it may not use. */
function readError(answer: unknown): AdminApiError {
  const problem = (answer as { error?: { code?: string; message?: string } } | null)?.error;
  return new AdminApiError(problem?.code ?? "", problem?.message ?? MESSAGE_UNEXPECTED);
}

/** Exchanges the admin secret for a session. */
export function logIn(secret: string): Promise<unknown> {
  return sendRequest("POST", "/login", { secret });
}

/** Ends the session in this browser. */
export function logOut(): Promise<unknown> {
  return sendRequest("POST", "/logout");
}

/** The values of a LAN's rules by their name in the API. */
export type GameRules = Record<string, number>;

/** A LAN as the server lists it. */
export interface LANSummary {
  id: number;
  slug: string;
  name: string;
  timezone: string;
  starts_at: number;
  ends_at: number;
  active: boolean;
  /** Empty for older LANs whose code was only stored as a hash, until it is replaced. */
  join_code: string | null;
  rules: GameRules;
}

/** What a new LAN needs. */
export interface NewLAN {
  slug: string;
  name: string;
  timezone: string;
  join_code: string;
  starts_at: number;
  ends_at: number;
}

/** Lists all LANs. */
export function listLANs(): Promise<LANSummary[]> {
  return sendRequest("GET", "/lans");
}

/** Creates a LAN with the default rules. */
export function createLAN(lan: NewLAN): Promise<unknown> {
  return sendRequest("POST", "/lans", lan);
}

/** Changes single rules and returns all of them as they are now. */
export function patchRules(lanID: number, changes: GameRules): Promise<GameRules> {
  return sendRequest("PATCH", `/lans/${lanID}/rules`, changes);
}

/** Replaces the code that players join a LAN with. */
export function updateJoinCode(lanID: number, joinCode: string): Promise<unknown> {
  return sendRequest("PUT", `/lans/${lanID}/join-code`, { join_code: joinCode });
}

/** What an admin can correct about a LAN. Missing fields stay as they are. */
export interface LANChanges {
  name?: string;
  starts_at?: number;
  ends_at?: number;
}

/** Corrects the name or period of a LAN. */
export function updateLAN(lanID: number, changes: LANChanges): Promise<unknown> {
  return sendRequest("PATCH", `/lans/${lanID}`, changes);
}

/** Deletes a LAN that nobody has joined yet. */
export function deleteLAN(lanID: number): Promise<unknown> {
  return sendRequest("DELETE", `/lans/${lanID}`);
}

/** Replaces all rules. Rules that are missing go back to their defaults. */
export function replaceRules(lanID: number, rules: GameRules): Promise<GameRules> {
  return sendRequest("PUT", `/lans/${lanID}/rules`, rules);
}

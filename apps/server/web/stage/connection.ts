/**
 * Talks to the server: reads the state and keeps the event stream open.
 *
 * @module
 */

import type { StageCatalog, StageEvent, StageState } from "./types.ts";

const API_PREFIX = "/v1";
const PATH_STATE = `${API_PREFIX}/stage`;
const PATH_STREAM = `${API_PREFIX}/stage/events`;
const PATH_CATALOG = `${API_PREFIX}/catalog`;
const QUERY_KEY = "key";
const QUERY_SINCE = "since";
const REOPEN_DELAY_MS = 5000;

/** Events that change what the state holds, so it has to be read again. */
const STATE_EVENTS = [
  "player.active",
  "player.updated",
  "player.hidden",
  "player.removed",
  "level.up",
  "sign.changed",
  "follow.changed",
  "stage.changed",
];
/** Events that only trigger animations. */
const ANIMATION_EVENTS = [
  "xp.gained",
  "achievement.earned",
  "award.given",
  "emote",
  "partner.emote",
];

/** Reports a failed request with its HTTP status. */
export class RequestError extends Error {
  readonly status: number;

  constructor(path: string, status: number) {
    super(`${path} answered ${status}`);
    this.status = status;
  }
}

/** Reads JSON and fails on every status other than OK. */
async function fetchJson<Result>(url: string): Promise<Result> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new RequestError(url.split("?")[0] ?? url, response.status);
  }
  return (await response.json()) as Result;
}

/** Reads all jellies and areas. */
export function fetchStageState(stageKey: string): Promise<StageState> {
  const query = new URLSearchParams({ [QUERY_KEY]: stageKey });
  return fetchJson<StageState>(`${PATH_STATE}?${query}`);
}

/** Reads the fixed lists. */
export function fetchCatalog(): Promise<StageCatalog> {
  return fetchJson<StageCatalog>(PATH_CATALOG);
}

/** What the stage wants to hear from the stream. */
export interface StreamListener {
  onEvent: (event: StageEvent, changesState: boolean) => void;
  onConnectionChange: (isOpen: boolean) => void;
}

/**
 * Listens to the stream for the life of the page. The browser reconnects by itself and resumes with
 * `Last-Event-ID`, except after an error status. Only then this code opens a new connection.
 */
export function openEventStream(
  stageKey: string,
  firstEventId: number,
  listener: StreamListener,
): void {
  let lastEventId = firstEventId;
  const handleMessage = (message: MessageEvent<string>, changesState: boolean) => {
    const event = JSON.parse(message.data) as StageEvent;
    lastEventId = event.id;
    listener.onEvent(event, changesState);
  };
  const connect = () => {
    const query = new URLSearchParams({
      [QUERY_KEY]: stageKey,
      [QUERY_SINCE]: String(lastEventId),
    });
    const source = new EventSource(`${PATH_STREAM}?${query}`);
    for (const type of STATE_EVENTS) {
      source.addEventListener(type, (message) => handleMessage(message, true));
    }
    for (const type of ANIMATION_EVENTS) {
      source.addEventListener(type, (message) => handleMessage(message, false));
    }
    source.onopen = () => listener.onConnectionChange(true);
    source.onerror = () => {
      listener.onConnectionChange(false);
      if (source.readyState === EventSource.CLOSED) {
        setTimeout(connect, REOPEN_DELAY_MS);
      }
    };
  };
  connect();
}

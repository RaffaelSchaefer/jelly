/**
 * Talks to the server: reads the state and keeps the event stream open.
 *
 * @module
 */

import {
  ANIMATION_EVENTS,
  STATE_EVENTS,
  type StageCatalog,
  type StageEvent,
  type StageSource,
  type StageState,
  type StreamListener,
} from "@jelly/stage";

const API_PREFIX = "/v1";
const PATH_STATE = `${API_PREFIX}/stage`;
const PATH_STREAM = `${API_PREFIX}/events/stream`;
const PATH_CATALOG = `${API_PREFIX}/catalog`;
const QUERY_KEY = "key";
const QUERY_SINCE = "since";
const REOPEN_DELAY_MS = 5000;
/** The stage reads one state at a time, so a hanging request must not hold up the next ones. */
const READ_TIMEOUT_MS = 10_000;

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
  const response = await fetch(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
  if (!response.ok) {
    throw new RequestError(url.split("?")[0] ?? url, response.status);
  }
  return (await response.json()) as Result;
}

/** Reads all jellies and areas. */
function fetchStageState(stageKey: string): Promise<StageState> {
  const query = new URLSearchParams({ [QUERY_KEY]: stageKey });
  return fetchJson<StageState>(`${PATH_STATE}?${query}`);
}

/** Reads the fixed lists. */
function fetchCatalog(): Promise<StageCatalog> {
  return fetchJson<StageCatalog>(PATH_CATALOG);
}

/**
 * Listens to the stream for the life of the page. The browser reconnects by itself and resumes with
 * `Last-Event-ID`, except after an error status. Only then this code opens a new connection.
 */
function openEventStream(stageKey: string, firstEventId: number, listener: StreamListener): void {
  let lastEventId = firstEventId;
  const handleMessage = (message: MessageEvent<string>) => {
    const event = JSON.parse(message.data) as StageEvent;
    lastEventId = event.id;
    listener.onEvent(event);
  };
  const connect = () => {
    const query = new URLSearchParams({
      [QUERY_KEY]: stageKey,
      [QUERY_SINCE]: String(lastEventId),
    });
    const source = new EventSource(`${PATH_STREAM}?${query}`);
    for (const type of [...STATE_EVENTS, ...ANIMATION_EVENTS]) {
      source.addEventListener(type, handleMessage);
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

/** Returns the stage data of this server, read with the key of the stage. */
export function createServerSource(stageKey: string): StageSource {
  return {
    readState: () => fetchStageState(stageKey),
    readCatalog: fetchCatalog,
    subscribe: (firstEventId, listener) => openEventStream(stageKey, firstEventId, listener),
  };
}

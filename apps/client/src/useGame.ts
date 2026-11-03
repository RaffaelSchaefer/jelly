/**
 * Bausteine für `usePet.ts`: Stand und Katalog halten, Backend-Aufrufe mit Lade- und Fehlerzustand,
 * Ereignisse vom Server und das regelmäßige Lebenszeichen.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from "react";

import * as backend from "./backend";
import { desktop } from "./backend";
import { PREVIEW_CATALOG, PREVIEW_GAME, type Catalog, type Game, type ServerEvent } from "./pet";

/** Abstand der Lebenszeichen. Der Server wartet `presence_window` (90 min), bis er abwesend meldet. */
const PRESENCE_INTERVAL_MS = 5 * 60_000;

/**
 * Hält Stand, Katalog und den Abstand zur Uhr des Servers.
 *
 * `offset` ist `server_time - Date.now()` beim Empfang. `Date.now() + offset` ist also die Uhrzeit
 * des Servers, gegen die alle Countdowns laufen.
 */
export function useGameState() {
  const [game, patchGame] = useState<Game>(PREVIEW_GAME);
  const [catalog, setCatalog] = useState<Catalog>(PREVIEW_CATALOG);
  const [offset, setOffset] = useState(0);

  /** Übernimmt einen neuen Stand aus Rust. */
  const setGame = useCallback((next: Game) => {
    patchGame(next);
    if (next.me) setOffset(next.me.server_time - Date.now());
  }, []);

  /** Liest den Stand still neu, etwa nach einem Ereignis oder einem Fehler. */
  const reload = useCallback(() => {
    if (desktop) void backend.getGame().then(setGame, () => null);
  }, [setGame]);

  return { game, setGame, patchGame, catalog, setCatalog, offset, reload };
}

/**
 * Führt Backend-Aufrufe aus und hält dafür Lade- und Fehlerzustand. Es läuft immer nur ein Aufruf
 * gleichzeitig. Ein zweiter wird verworfen, solange der erste läuft, damit kein älterer Stand einen
 * neueren überschreibt.
 *
 * @param onFailure - Nach einem Fehler. Der Vertrag verlangt, dann den Stand zu lesen statt die
 *   Aktion zu wiederholen, denn sie kann beim Server schon gezählt haben.
 */
export function useBackendCall(onFailure: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  /** Führt `task` aus. Liefert sein Ergebnis, oder `undefined`, wenn nichts übernommen wurde. */
  const run = useCallback(
    async <T>(task: () => Promise<T>, reloadOnError = true): Promise<T | undefined> => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError("");
      try {
        return await task();
      } catch (cause) {
        setError(String(cause));
        if (reloadOnError) onFailure();
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [onFailure],
  );

  /** Fensterknöpfe. Fehler landen in derselben Fehleranzeige. */
  const windowAction = useCallback(async (action: backend.WindowAction) => {
    if (!desktop) return;
    await backend.windowAction(action).catch((cause) => setError(String(cause)));
  }, []);

  return { busy, error, inFlight, run, windowAction };
}

/** Hört auf Ereignisse zum eigenen Jelly, solange `enabled` gilt. */
export function useServerEvents(enabled: boolean, onEvent: (event: ServerEvent) => void) {
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let stop: (() => void) | undefined;
    void backend.onServerEvent(onEvent).then((unlisten) => {
      if (active) stop = unlisten;
      else unlisten();
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [enabled, onEvent]);
}

/** Schickt alle {@link PRESENCE_INTERVAL_MS} ein Lebenszeichen, solange `active` gilt. */
export function usePresence(active: boolean, onGame: (game: Game) => void) {
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(
      () => void backend.presence().then(onGame, () => null),
      PRESENCE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [active, onGame]);
}

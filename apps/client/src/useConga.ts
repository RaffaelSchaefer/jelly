/**
 * Was das Pet von seiner Polonaise mitbekommt. Gebildet wird sie auf der Karte mit „Dazustellen“,
 * hier kommt nur `follow.changed` an: das eigene und das der anderen in derselben Polonaise
 * (`Follows` in `src-tauri/src/events.rs`). Wer wem folgt, liest das Pet danach von der Bühne
 * (`get_stage`), `ownConga` rechnet daraus die eigene Polonaise und `congaChange`, was das Jelly
 * dazu meint. Solange es in einer steht, tanzt es mit (`scene/congaStep.ts`) und hört ganz leise
 * Musik (`useUiSounds.ts`).
 *
 * Bekannte Grenzen: Ob ein Folgender schon angekommen ist, weiß das Pet nicht. Es tanzt, sobald die
 * Polonaise steht, die Bühne erst, wenn die Jellies beieinander sind. Und verpasst es ihr Ende,
 * endet sie hier mit dem letzten `ends_at` darin.
 *
 * In der Browser-Vorschau bildet sich mit `/#conga` kurz nach dem Laden eine Polonaise, sie wächst,
 * schrumpft und läuft nach 40 Sekunden ab (`previewCongaPlayers`). Zu hören ist die Musik nach dem
 * ersten Klick oder Tastendruck.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from "react";

import * as backend from "./backend";
import { desktop } from "./backend";
import {
  congaAfterRead,
  congaChange,
  PREVIEW_CONGA_STEPS_MS,
  previewCongaPlayers,
  sameConga,
  type CongaPlace,
  type CongaReading,
  type Game,
  type ServerEvent,
} from "./pet";
import { inRunningLan, useServerEvents, useStreamReset, type useGameState } from "./useGame";

/** Ob die Vorschau die Polonaise zeigt. Die App kennt keinen Hash. */
const PREVIEW = !desktop && location.hash === "#conga";

/** So lange nach dem Laden beginnt die Polonaise der Vorschau, in Millisekunden. */
const PREVIEW_DELAY_MS = 1500;

/**
 * Wann sie beginnt, auf der Uhr des Geräts. Fest ab dem Laden statt ab dem ersten Lesen: So liegt
 * kein Wecker der Vorschau je vor dem Schritt, den er zeigen soll.
 */
const PREVIEW_STARTS_AT = Date.now() + PREVIEW_DELAY_MS;

/** So lange nach dem letzten `ends_at` liest das Pet nach, ob die Polonaise vorbei ist. */
const EXPIRY_SLACK_MS = 500;

/** Länger wartet kein `setTimeout`, ein größerer Wert liefe sofort ab. */
const LONGEST_TIMER_MS = 2 ** 31 - 1;

/**
 * So lange nach einem Satz zur Polonaise schweigt der Satz zum Dazustellen: Beides folgt aus
 * demselben `follow.changed`, und die Polonaise ist die größere Neuigkeit.
 */
const QUIET_FOLLOW_MS = 1500;

/** Der Stand mit dem Dazustellen, das die Vorschau dem eigenen Jelly gerade gibt. */
function withPreviewFollow(game: Game, players: CongaReading["players"], now: number): Game {
  const own = players.find((player) => player.id === game.me?.id)?.follow ?? null;
  const follow = own && own.ends_at > now ? own : null;
  return { ...game, me: game.me && { ...game.me, follow } };
}

/**
 * Liest, wer wem folgt: in der App von der Bühne, in der Vorschau aus ihrem festen Ablauf. Dort
 * bekommt das eigene Jelly dabei auch sein Dazustellen in den Stand, wie die App es mit dem
 * Ereignis neu läse.
 */
function useFollowReader({ game, patchGame }: ReturnType<typeof useGameState>) {
  const ownId = game.me?.id ?? 0;
  return useCallback(async (): Promise<CongaReading> => {
    if (desktop) {
      const stage = await backend.getStage();
      return { players: stage.players, serverTime: stage.server_time };
    }
    const now = Date.now();
    const players = previewCongaPlayers(ownId, PREVIEW_STARTS_AT, now);
    patchGame((current) => withPreviewFollow(current, players, now));
    return { players, serverTime: now };
  }, [ownId, patchGame]);
}

/** Die Uhr des Servers. Stabil, auch wenn der Abstand zur eigenen Uhr mit jedem Stand wackelt. */
function useServerNow(offset: number) {
  const known = useRef(offset);
  useEffect(() => {
    known.current = offset;
  }, [offset]);
  return useCallback(() => Date.now() + known.current, []);
}

/** So lange nach einer Nachlese, die nichts geändert hat, liest das Pet noch einmal. */
const EXPIRY_RETRY_MS = 5000;

/** Womit {@link useCongaPlace} liest und spricht. Alles außer `active` sollte stabil sein. */
interface CongaSenses {
  ownId: number | undefined;
  /** Ob es gerade eine Polonaise geben kann: mit Konto in einer laufenden LAN. */
  active: boolean;
  read: () => Promise<CongaReading>;
  serverNow: () => number;
  hop: (message: string) => void;
  say: (message: string) => void;
}

/**
 * Hält die eigene Polonaise und liest sie auf Wunsch neu. Das Jelly sagt dabei, was sich geändert
 * hat, außer `silent`: Der erste Stand nach dem Start ist nichts Neues.
 *
 * Scheitert das Lesen, bleibt die Polonaise stehen, bis ihr letztes `ends_at` um ist
 * (`congaAfterRead`). Eine überholte Antwort zählt nicht, auch keine, die erst ankommt, wenn Konto
 * oder LAN schon weg sind: Dann ist die Polonaise vergessen.
 */
function useCongaPlace({ ownId, active, read, serverNow, hop, say }: CongaSenses) {
  const place = useRef<CongaPlace | null>(null);
  const [conga, setConga] = useState<CongaPlace | null>(null);
  const latest = useRef(0);
  const spokeAt = useRef(-Infinity);
  useEffect(() => {
    if (active) return;
    latest.current += 1;
    place.current = null;
    setConga(null);
  }, [active]);

  const refresh = useCallback(
    async (silent = false) => {
      if (ownId === undefined) return;
      const turn = ++latest.current;
      const reading = await read().catch(() => null);
      if (turn !== latest.current) return;
      const before = place.current;
      const after = congaAfterRead(reading, before, ownId, serverNow());
      if (after === undefined) return;
      place.current = after;
      setConga((shown) => (sameConga(shown, after) ? shown : after));
      const { message, hops } = congaChange(before, after);
      if (silent || !message) return;
      spokeAt.current = performance.now();
      (hops ? hop : say)(message);
    },
    [ownId, read, serverNow, hop, say],
  );
  return { conga, refresh, spokeAt };
}

/**
 * Lässt das Jelly auf seine Polonaise reagieren: Neu darin hüpft es, wächst oder schrumpft sie oder
 * ist sie vorbei, sagt es das nur.
 *
 * @param hop - Hüpfer mit Satz. Sollte stabil sein.
 * @param say - Nur der Satz. Sollte stabil sein.
 * @returns `conga` ist die eigene Polonaise, `null` ohne. `saysFollow` ist `hop` für den Satz zum
 *   Dazustellen: Er schweigt, wenn das Jelly gerade etwas zur Polonaise gesagt hat.
 */
export function useConga(
  state: ReturnType<typeof useGameState>,
  ready: boolean,
  hop: (message: string) => void,
  say: (message: string) => void,
) {
  const ownId = state.game.me?.id;
  const active = ownId !== undefined && (PREVIEW ? ready : inRunningLan(state.game, ready));
  const read = useFollowReader(state);
  const serverNow = useServerNow(state.offset);
  const senses = { ownId, active, read, serverNow, hop, say };
  const { conga, refresh, spokeAt } = useCongaPlace(senses);
  const reread = useCallback(() => void refresh(), [refresh]);

  // Wer beim Start schon in einer Polonaise steht, tanzt gleich mit, ohne es zu melden.
  useEffect(() => {
    if (desktop && active) void refresh(true);
  }, [active, refresh]);
  const onEvent = useCallback(
    (event: ServerEvent) => {
      if (event.type === "follow.changed") reread();
    },
    [reread],
  );
  useServerEvents(desktop && active, onEvent);
  useStreamReset(desktop && active, reread);

  useEffect(() => {
    if (!PREVIEW || !active) return;
    const timers = PREVIEW_CONGA_STEPS_MS.map((ms) =>
      window.setTimeout(reread, PREVIEW_DELAY_MS + ms),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [active, reread]);

  // Das Netz unter allem: Auch wenn kein Ereignis das Ende meldet, hört die Polonaise mit dem
  // letzten Dazustellen darin auf, und mit ihr Tanz und Musik. Steht sie nach der Nachlese noch mit
  // demselben Ende da, etwa weil die Uhr des Servers anders ging, liest das Pet wieder.
  const endsAt = active ? conga?.endsAt : undefined;
  const [rereads, setRereads] = useState(0);
  useEffect(() => {
    if (endsAt === undefined) return;
    const left = endsAt - serverNow();
    const wait = left > 0 ? left + EXPIRY_SLACK_MS : EXPIRY_RETRY_MS;
    const timer = window.setTimeout(
      () => {
        reread();
        setRereads((count) => count + 1);
      },
      Math.min(wait, LONGEST_TIMER_MS),
    );
    return () => window.clearTimeout(timer);
  }, [endsAt, rereads, serverNow, reread]);

  const saysFollow = useCallback(
    (message: string) => {
      if (performance.now() - spokeAt.current > QUIET_FOLLOW_MS) hop(message);
    },
    [hop, spokeAt],
  );
  return { conga: active ? conga : null, saysFollow };
}

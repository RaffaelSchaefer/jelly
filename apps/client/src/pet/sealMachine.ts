/**
 * Die Zeremonie des Siegels ohne React: der Stand aus `sealCeremony.ts`, die Zeitgeber zwischen den
 * Phasen und der Auftrag an den Server beim Stempeln. Zeiger und Tasten bindet
 * `shop/useSealCeremony.ts` daran.
 *
 * @module
 */

import type { ShopItem } from "./shop";

import {
  SEAL_IDLE,
  SEAL_TIMING,
  sealClick,
  sealStep,
  type SealEvent,
  type SealMode,
  type SealPhase,
  type SealState,
} from "./sealCeremony";

/** Die Ware, um die es in einer Zeremonie geht, so wie sie beim Drücken oder Stempeln war. */
export interface SealSubject {
  item: ShopItem;
  /** Ob das Jelly sie da trug. */
  worn: boolean;
  mode: SealMode;
}

/** Was die Zeremonie braucht. */
export interface CeremonyOptions {
  /** Die gewählte Ware, ohne Wahl `null`. */
  item: ShopItem | null;
  /** Ob das Jelly sie trägt. */
  worn: boolean;
  /** Wie das Siegel gerade bedient wird. */
  mode: SealMode;
  /** Kauft oder legt an. `true`, wenn der Server zugestimmt hat. */
  commit: (subject: SealSubject) => Promise<boolean>;
  /** Bei jedem Wechsel der Phase, mit der Ware, um die es geht. */
  onPhase: (phase: SealPhase, subject: SealSubject) => void;
  /** Ein Druck auf das gesperrte Siegel. */
  onBlocked: () => void;
}

/** Wie die Zeremonie mit ihrer Oberfläche spricht. */
export interface MachineHost {
  /** Die aktuellen Optionen. */
  options: () => CeremonyOptions;
  /** Zeigt einen neuen Stand. */
  render: (state: SealState, subject: SealSubject | null) => void;
}

/** Was nach einer Phase von selbst geschieht, und wann. */
const PHASE_TIMERS: Partial<
  Record<SealPhase, { ms: (mode: SealMode) => number; next: SealEvent }>
> = {
  holding: { ms: () => SEAL_TIMING.holdMs, next: { type: "held" } },
  armed: { ms: () => SEAL_TIMING.armMs, next: { type: "timeout" } },
  stamping: {
    ms: (mode) => (mode === "tap" ? SEAL_TIMING.tapStampMs : SEAL_TIMING.stampMs),
    next: { type: "stamped" },
  },
  sealed: { ms: () => SEAL_TIMING.sealedMs, next: { type: "timeout" } },
  cracked: { ms: () => SEAL_TIMING.crackMs, next: { type: "timeout" } },
};

/**
 * Phasen, in denen sich die Zeremonie ihre Ware merkt. Ab dem Drücken: Wird die Wahl mitten im
 * Halten aufgehoben, erfährt der Laden noch, worum es ging, und entlädt den Zauber.
 */
const REMEMBERS: ReadonlySet<SealPhase> = new Set(["holding", "armed", "stamping"]);

/** Die Ware der Optionen als Gegenstand einer Zeremonie. */
function subjectOf({ item, worn, mode }: CeremonyOptions): SealSubject | null {
  return item ? { item, worn, mode } : null;
}

/** Schickt den Auftrag los. Ein Fehler zählt wie eine Absage. */
function commit(options: CeremonyOptions, about: SealSubject, send: (event: SealEvent) => void) {
  options.commit(about).then(
    (ok) => send({ type: "settled", ok }),
    () => send({ type: "settled", ok: false }),
  );
}

/** Eine Zeremonie: Stand, Zeitgeber und der Auftrag an den Server. */
export function createSealMachine(host: MachineHost) {
  let state = SEAL_IDLE;
  let subject: SealSubject | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  /** Ob gerade ein eigener Druck läuft, mit Zeiger oder Taste. */
  let pressing = false;
  /** Wann der letzte eigene Druck endete, auf der Uhr von `performance.now()`. */
  let releasedAt = -Infinity;

  function send(event: SealEvent) {
    const before = state;
    state = sealStep(before, event);
    if (state === before) return;
    if (state.hint && !before.hint) {
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => send({ type: "hintEnd" }), SEAL_TIMING.hintMs);
    }
    if (state.phase === before.phase) host.render(state, subject);
    else enter(state.phase);
  }

  /** Beginnt eine Phase: ihr Zeitgeber, beim Stempeln der Auftrag, und die Meldung nach außen. */
  function enter(phase: SealPhase) {
    clearTimeout(timer);
    const options = host.options();
    // Beim Stempeln zählt die Ware, wie sie jetzt ist: Erst der Stempel geht an den Server.
    if (REMEMBERS.has(phase) && (phase === "stamping" || !subject)) subject = subjectOf(options);
    const about = subject ?? subjectOf(options);
    if (phase === "stamping" && about) commit(options, about, send);
    const auto = PHASE_TIMERS[phase];
    if (auto) timer = setTimeout(() => send(auto.next), auto.ms(about?.mode ?? "hold"));
    if (phase === "idle") subject = null;
    host.render(state, subject);
    if (about) options.onPhase(phase, about);
  }

  return {
    send,
    /** Ob gerade ein eigener Druck läuft. */
    pressing: () => pressing,
    /** Ein eigener Druck mit Zeiger oder Taste. */
    press() {
      pressing = true;
      send({ type: "press" });
    },
    /** Loslassen, auch wenn Siegel oder Fenster den Fokus verlieren. */
    release() {
      if (pressing) releasedAt = performance.now();
      pressing = false;
      send({ type: "release" });
    },
    /**
     * Ein Klick, ob von der Maus, von Enter oder von VoiceOver. Solange ein eigener Druck läuft,
     * gehört er zu diesem: Sonst legte ein gehaltenes Enter die eben gekaufte Ware wieder ab.
     */
    click() {
      if (pressing) return;
      const { mode, onBlocked } = host.options();
      const event = sealClick(state.phase, mode, performance.now() - releasedAt);
      if (event?.type === "blocked") onBlocked();
      if (event) send(event);
    },
    /** Hält alle Zeitgeber an, etwa wenn das Siegel verschwindet. */
    stop() {
      clearTimeout(timer);
      clearTimeout(hintTimer);
    },
  };
}

/** Eine Zeremonie. */
export type SealMachine = ReturnType<typeof createSealMachine>;

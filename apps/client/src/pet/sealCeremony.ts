/**
 * Das Siegel des Kaufbriefs als reine Rechnung: Ein Kauf braucht einen Druck von 650 ms, dann fällt
 * der Stempel, und das Wachs trocknet, bis der Server geantwortet hat. Anlegen und Ablegen gehen
 * mit einem Tipp.
 *
 * Wer kein Halten kann, etwa mit VoiceOver, macht das Siegel mit dem ersten Klick scharf und
 * bestätigt mit dem zweiten. Gespielt wird das in `shop/useSealCeremony.ts`, gezeigt in
 * `shop/ShopSeal.tsx`.
 *
 * @module
 */

import type { ShopItem } from "./shop";

import { coinLabel } from "./cosmetics";

/**
 * Der Takt der Zeremonie in Millisekunden, die einzige Quelle dafür. Das CSS bekommt die Werte als
 * Variablen ({@link SEAL_CSS_TIMES}), Ton, Licht und Zauberer folgen den Phasen.
 */
export const SEAL_TIMING = {
  /** So lange hält man das Siegel, bis es kauft. */
  holdMs: 650,
  /** Ab hier zählt das Halten als Absicht: Der Zauberer holt schon aus. */
  lateHoldMs: 250,
  /** Nach so vielen Millisekunden schlägt der Stempel auf. */
  impactMs: 160,
  /** So lange dauert der Stempel beim Kaufen. */
  stampMs: 420,
  /** So lange dauert er beim Anlegen und Ablegen. */
  tapStampMs: 240,
  /** So lange steht das Siegel als „Gesiegelt!“ da. */
  sealedMs: 2600,
  /** So lange bleibt ein gesprungenes Siegel sichtbar. */
  crackMs: 1600,
  /** So lange wartet ein scharf gemachtes Siegel auf die Bestätigung. */
  armMs: 5000,
  /** So lange steht der Hinweis nach einem zu kurzen Druck. */
  hintMs: 1800,
} as const;

/** Dieselben Zeiten als CSS-Variablen, für das `style` des Kaufbriefs. */
export const SEAL_CSS_TIMES: Readonly<Record<string, string>> = {
  "--seal-hold-time": `${SEAL_TIMING.holdMs}ms`,
  "--seal-impact-time": `${SEAL_TIMING.impactMs}ms`,
  "--seal-stamp-time": `${SEAL_TIMING.stampMs}ms`,
  "--seal-tap-time": `${SEAL_TIMING.tapStampMs}ms`,
  "--seal-hint-time": `${SEAL_TIMING.hintMs}ms`,
};

/**
 * Ein Klick so kurz nach einem eigenen Druck oder Loslassen gehört zu diesem. Ein Klick ohne ihn
 * kommt von VoiceOver oder einer Schaltersteuerung.
 */
export const OWN_INPUT_MS = 1000;

/**
 * Die Phasen des Siegels: in Ruhe, scharf gemacht, gehalten, beim Stempeln, beim Trocknen (der
 * Stempel ist durch, der Server hat noch nicht geantwortet), gesiegelt oder gesprungen.
 */
export type SealPhase =
  | "idle"
  | "armed"
  | "holding"
  | "stamping"
  | "setting"
  | "sealed"
  | "cracked";

/** Was am Siegel geschieht. `settled` bringt die Antwort des Servers. */
export type SealEvent =
  | {
      type:
        | "press"
        | "release"
        | "held"
        | "assist"
        | "tap"
        | "blocked"
        | "stamped"
        | "timeout"
        | "reset"
        | "hintEnd";
    }
  | { type: "settled"; ok: boolean };

/** Der Stand des Siegels. */
export interface SealState {
  phase: SealPhase;
  /** Die Antwort des Servers, sobald sie da ist: angenommen (`true`) oder abgelehnt. */
  answer: boolean | null;
  /** Ob gerade der Hinweis zum Siegel zu sehen ist, nach einem zu kurzen oder gesperrten Druck. */
  hint: boolean;
}

/** Das Siegel in Ruhe. */
export const SEAL_IDLE: SealState = { phase: "idle", answer: null, hint: false };

/** Ein Übergang. */
type SealStep = (state: SealState, event: SealEvent) => SealState;

/** Zurück in Ruhe. */
const toIdle: SealStep = () => SEAL_IDLE;
/** Ein zu kurzer Druck: in Ruhe, aber mit Hinweis. */
const tooShort: SealStep = () => ({ ...SEAL_IDLE, hint: true });
/** Eine neue Phase ohne Antwort und Hinweis. */
const enter =
  (phase: SealPhase): SealStep =>
  () => ({ phase, answer: null, hint: false });
/** Ob ein Ereignis eine Zusage des Servers ist. */
const accepted = (event: SealEvent) => event.type === "settled" && event.ok;
/** Die Antwort kam, bevor der Stempel durch ist: merken. */
const store: SealStep = (state, event) => ({ ...state, answer: accepted(event) });
/** Der Stempel ist durch: gesiegelt oder gesprungen, oder ohne Antwort weiter trocknen. */
const afterStamp: SealStep = (state) => {
  if (state.answer === null) return { ...state, phase: "setting" };
  return { ...state, phase: state.answer ? "sealed" : "cracked" };
};
/** Die Antwort kam, während das Wachs trocknet. */
const resolve: SealStep = (state, event) => {
  const ok = accepted(event);
  return { ...state, answer: ok, phase: ok ? "sealed" : "cracked" };
};

/** Die Übergänge je Phase. Was hier fehlt, ändert nichts. */
const TABLE: Readonly<Record<SealPhase, Partial<Record<SealEvent["type"], SealStep>>>> = {
  idle: {
    press: enter("holding"),
    assist: enter("armed"),
    tap: enter("stamping"),
    blocked: (state) => ({ ...state, hint: true }),
    reset: toIdle,
  },
  armed: {
    press: enter("holding"),
    assist: enter("stamping"),
    timeout: toIdle,
    reset: toIdle,
  },
  holding: { release: tooShort, held: enter("stamping"), reset: toIdle },
  stamping: { settled: store, stamped: afterStamp },
  setting: { settled: resolve },
  sealed: { timeout: toIdle, reset: toIdle },
  cracked: { timeout: toIdle, reset: toIdle },
};

/** Der nächste Stand nach `event`. Ändert sich nichts, kommt `state` selbst zurück. */
export function sealStep(state: SealState, event: SealEvent): SealState {
  if (event.type === "hintEnd") return state.hint ? { ...state, hint: false } : state;
  const step = TABLE[state.phase][event.type];
  return step ? step(state, event) : state;
}

/** Wie das Siegel bedient wird: halten zum Kaufen, tippen zum Anlegen, oder gar nicht. */
export type SealMode = "hold" | "tap" | "locked";

/**
 * Was ein Klick auf das Siegel bedeutet: gesperrt, ein Tipp oder die Hilfe für Screenreader. Ein
 * Klick kurz nach dem Ende eines eigenen Drucks gehört zu diesem und bedeutet nichts mehr. Sonst
 * legte ein langes Halten, das schon gekauft hat, die Ware beim Loslassen gleich wieder ab.
 *
 * @param sinceRelease - Millisekunden seit dem Ende des letzten eigenen Drucks.
 */
export function sealClick(
  phase: SealPhase,
  mode: SealMode,
  sinceRelease: number,
): SealEvent | null {
  if (phase !== "idle" && phase !== "armed") return null;
  if (sinceRelease < OWN_INPUT_MS) return null;
  if (mode === "locked") return { type: "blocked" };
  return { type: mode === "tap" ? "tap" : "assist" };
}

/** Die Farbe des Wachses: rot zum Kaufen, grün zum Anlegen, grau zum Ablegen, violett gesperrt. */
export type SealWax = "buy" | "wear" | "off" | "locked";

/** Wie das Siegel aussieht und heißt. */
export interface SealLook {
  mode: SealMode;
  wax: SealWax;
  /** Was groß auf dem Etikett steht. */
  label: string;
  /** Die Münzen neben „Kaufen“, sonst `null`. */
  price: number | null;
  /** Was klein darunter steht. */
  sub: string;
  /** Der Hinweis zum Siegel, zugleich seine Beschreibung für Screenreader. */
  hint: string;
  /** Was Screenreader nach dem Hinweis noch hören: wie es ohne Halten geht. */
  assist?: string;
  /** Der Name des Knopfs für Screenreader. */
  srLabel: string;
  /** Was ein Screenreader sofort ansagt, etwa dass das Siegel auf die Bestätigung wartet. */
  status?: string;
}

/** Wovon das Aussehen abhängt. */
export interface SealInput {
  item: ShopItem;
  /** Ob das Jelly die Ware gerade trägt. */
  worn: boolean;
  /** Ob gerade eine LAN läuft, nur dann wird verkauft. */
  open: boolean;
  phase: SealPhase;
  /** Ob gerade ein anderer Aufruf läuft. Dann wartet das Siegel. */
  busy: boolean;
  /** Münzen je Level-Aufstieg. */
  perLevel: number;
}

/** Eine Ware, die dem Jelly schon gehört: anlegen oder ablegen. */
function ownedLook(worn: boolean): SealLook {
  const action = worn ? "Ablegen" : "Anlegen";
  return {
    mode: "tap",
    wax: worn ? "off" : "wear",
    label: action,
    price: null,
    sub: worn ? "trägst du gerade" : "aus deiner Truhe",
    hint: worn
      ? "Gehört dir. Ablegen bringt sie in die Truhe."
      : "Gehört dir schon. Anlegen kostet nichts.",
    srLabel: action,
  };
}

/** Eine Ware, die noch zu teuer ist. */
function shortLook({ item, perLevel }: SealInput): SealLook {
  const missing = coinLabel(item.missing);
  return {
    mode: "locked",
    wax: "locked",
    label: `Noch ${missing}`,
    price: null,
    sub: "zu wenig Münzen",
    hint:
      perLevel > 0
        ? `Jeder Level-Aufstieg bringt ${coinLabel(perLevel)}.`
        : "Dafür reichen deine Münzen noch nicht.",
    srLabel: `Kaufen, dir fehlen noch ${missing}`,
  };
}

/** Ohne laufende LAN verkauft der Laden nichts. */
const CLOSED_LOOK: SealLook = {
  mode: "locked",
  wax: "locked",
  label: "Laden ruht",
  price: null,
  sub: "nur während einer LAN",
  hint: "Münzen und Käufe gibt es nur während einer LAN.",
  // Der Name enthält, was auf dem Etikett steht: So findet auch die Sprachsteuerung das Siegel.
  srLabel: "Laden ruht, kaufen geht nur während einer LAN",
};

/** Eine Ware, die sich das Jelly leisten kann. */
function buyLook({ item }: SealInput): SealLook {
  const scope = item.perLan ? "Gilt nur für diese LAN." : "Gehört dir danach für immer.";
  return {
    mode: "hold",
    wax: "buy",
    label: "Kaufen",
    price: item.price,
    sub: "gedrückt halten",
    hint: `Halten, bis das Siegel sitzt. ${scope}`,
    assist: "Ohne Halten zweimal drücken: Der zweite Druck bestätigt den Kauf.",
    srLabel: `Kaufen für ${coinLabel(item.price)}`,
  };
}

/** Das Siegel in Ruhe, nur nach der Ware. */
function restingLook(input: SealInput): SealLook {
  if (input.item.state === "owned") return ownedLook(input.worn);
  if (!input.open) return CLOSED_LOOK;
  return input.item.state === "short" ? shortLook(input) : buyLook(input);
}

/** Was nach dem Siegeln klein darunter steht, je nach Wachs. */
const SEALED_SUB: Record<SealWax, string> = {
  buy: "Bezahlt",
  wear: "Angelegt",
  off: "Abgelegt",
  locked: "",
};

/** Was eine Phase am Aussehen ändert. */
const PHASE_LOOK: Partial<Record<SealPhase, (look: SealLook) => Partial<SealLook>>> = {
  armed: (look) => ({
    label: "Kauf bestätigen",
    sub: "noch einmal drücken",
    srLabel: `Kauf bestätigen, ${look.srLabel}`,
    status: "Zum Bestätigen noch einmal drücken.",
  }),
  holding: () => ({ sub: "Halten …" }),
  stamping: () => ({ sub: "Das Wachs trocknet …" }),
  setting: () => ({ sub: "Das Wachs trocknet …" }),
  sealed: (look) => ({
    label: "Gesiegelt!",
    price: null,
    sub: SEALED_SUB[look.wax],
    srLabel: `Gesiegelt, ${SEALED_SUB[look.wax]}`,
  }),
  cracked: (look) => ({
    label: "Gesprungen",
    price: null,
    sub: look.mode === "tap" ? "Nichts geändert" : "Nichts bezahlt",
    srLabel: "Siegel gesprungen",
  }),
};

/**
 * Wie das Siegel aussieht und heißt. Während der Zeremonie zählt die Ware, wie sie beim Stempeln
 * war: Der Kauf macht sie zwar zum Besitz, das Siegel bleibt aber rot, bis es in Ruhe ist.
 */
export function sealLabel(input: SealInput): SealLook {
  const resting = restingLook(input);
  const waiting = input.phase === "idle" || input.phase === "armed";
  const look: SealLook =
    input.busy && waiting && resting.mode !== "locked"
      ? { ...resting, mode: "locked", sub: "einen Moment …" }
      : resting;
  const phase = PHASE_LOOK[input.phase];
  return phase ? { ...look, ...phase(look) } : look;
}

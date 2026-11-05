/**
 * Die Karte im eigenen Fenster: die Bühne aus `@jelly/stage` über das ganze Fenster, dazu das
 * eigene Jelly, Klicks zum Dazustellen und „Weggehen“. Ein Klick aufs eigene Jelly startet ein
 * Partner-Emote (`partner.ts`).
 *
 * Reines TypeScript ohne React: Außer der Canvas gibt es hier nur ein paar Knöpfe und eine
 * Statuszeile.
 *
 * @module
 */

import {
  createStageView,
  type ScreenPoint,
  type StageHighlight,
  type StagePlayer,
  type StageState,
  type StageView,
} from "@jelly/stage";

import { desktop, windowAction } from "../backend";
import { knownPetColor } from "../pet";
import { startGlass, type GlassLayer } from "./glass";
import {
  cancelFlow,
  handleEscape,
  handleInviteEvent,
  handleStageClick,
  openGestures,
  type PartnerFlow,
} from "./partner";
import { createDesktopSource, type MapSource } from "./source";
import "./map.css";

/**
 * Viele Ereignisse führen zu einem Neuladen. Das sind höchstens 32 der 300 Anfragen pro Minute, die
 * der Server einem Spieler erlaubt.
 */
const RELOAD_DELAY_MS = 2000;
/** Die Karte läuft neben Spielen, also ohne die doppelte Auflösung des Beamers. */
const SUPERSAMPLING = 1;
/** Etwas nach dem Ende des Folgens lesen, damit der Server es schon beendet hat. */
const FOLLOW_END_GRACE_MS = 1000;
/** So lange bleibt eine Fehlermeldung zum Dazustellen stehen. Das nächste Neuladen löscht sie nicht. */
const ACTION_PROBLEM_MS = 6000;
const TEXT_NO_LAN = "Gerade läuft keine LAN.";
const TEXT_NO_WEBGL = "Dieses Gerät kann die 3D-Karte nicht zeichnen.";
const TEXT_UNKNOWN_JELLY = "dem Jelly";
const OS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Die Seite und was sich auf ihr ändert. */
interface MapPage {
  source: MapSource;
  canvas: HTMLCanvasElement;
  leave: HTMLButtonElement;
  status: HTMLElement;
  /** `null`, bis die Bühne läuft. */
  view: StageView | null;
  /** `null` ohne WebGL: Dann bleiben Knöpfe und Hinweise einfarbig. */
  glass: GlassLayer | null;
  targetId: number | null;
  /** Wer gerade leuchtet, solange man einen Partner wählt. */
  highlight: StageHighlight | null;
  /** Die Jellies vom letzten Lesen, für den Namen eines Partners. */
  players: StagePlayer[];
  /** Abstand zur Uhr des Servers vom letzten Lesen. */
  clockOffset: number;
  /** Ein Aufruf zum Dazustellen läuft. Sie laufen einzeln, damit keiner einen neueren überholt. */
  following: boolean;
  /** Liest neu, wenn das Folgen von selbst endet. Dazu kommt kein Ereignis. */
  followEnd: ReturnType<typeof setTimeout> | undefined;
  /** Was die Statuszeile zeigt, das Wichtigste zuerst. */
  actionProblem: string;
  readProblem: string;
  note: string;
}

/** Zeigt den wichtigsten Text in der Statuszeile oder blendet sie aus. */
function renderStatus(page: MapPage) {
  const problem = page.actionProblem || page.readProblem;
  page.status.textContent = problem || page.note;
  page.status.hidden = !page.status.textContent;
  page.status.toggleAttribute("data-problem", problem !== "");
}

/** Gibt Ziel und Leuchten an die Bühne. */
function applyMarks(page: MapPage) {
  page.view?.setMarks({
    ownId: page.source.readOwn().id,
    targetId: page.targetId,
    highlight: page.highlight,
  });
}

/** Übernimmt das Ziel für Markierung und „Weggehen“. */
function setTarget(page: MapPage, targetId: number | null) {
  page.targetId = targetId;
  page.leave.hidden = targetId === null;
  applyMarks(page);
}

/**
 * Übernimmt, was ein neuer Stand für die Seite bedeutet. Das Ziel kommt aus dem eigenen Eintrag:
 * Wird ein Ziel gelöscht, fällt es ohne Ereignis weg.
 */
function applyState(page: MapPage, state: StageState) {
  const { id, reducedMotion } = page.source.readOwn();
  const own = state.players.find((player) => player.id === id);
  page.players = state.players;
  page.clockOffset = state.server_time - Date.now();
  setTarget(page, own?.follow_player_id ?? null);
  clearTimeout(page.followEnd);
  if (own?.follow_until) {
    const remaining = Math.max(0, own.follow_until - state.server_time);
    page.followEnd = setTimeout(() => page.view?.reload(), remaining + FOLLOW_END_GRACE_MS);
  }
  const reduced = reducedMotion || OS_REDUCED_MOTION.matches;
  page.view?.setReducedMotion(reduced);
  if (own) page.glass?.setLook(knownPetColor(own.color), reduced);
  page.note = state.areas.length === 0 && state.players.length === 0 ? TEXT_NO_LAN : "";
  page.readProblem = "";
  renderStatus(page);
}

/** Zeigt, warum das Dazustellen nicht geklappt hat, und räumt die Meldung später weg. */
function showActionProblem(page: MapPage, problem: string) {
  page.actionProblem = problem;
  setTimeout(() => {
    if (page.actionProblem !== problem) return;
    page.actionProblem = "";
    renderStatus(page);
  }, ACTION_PROBLEM_MS);
}

/**
 * Stellt das Jelly dazu oder weg. Das Ziel gilt sofort, damit schon der nächste Klick es kennt. Den
 * Weg dorthin plant der Server und schickt ihn im Stream.
 */
async function follow(page: MapPage, playerId: number | null) {
  if (page.following) return;
  page.following = true;
  page.actionProblem = "";
  try {
    setTarget(page, await page.source.setFollow(playerId));
  } catch (cause) {
    showActionProblem(page, String(cause));
  }
  page.following = false;
  renderStatus(page);
  page.view?.reload();
}

/** Baut den Ablauf der Partner-Emotes aus den Elementen von `map.html`. */
function createPartnerFlow(page: MapPage): PartnerFlow {
  return {
    context: {
      source: page.source,
      pickAt: (point) => page.view?.pickAt(point) ?? null,
      findName: (playerId) =>
        page.players.find((player) => player.id === playerId)?.name ?? TEXT_UNKNOWN_JELLY,
      readServerTime: () => Date.now() + page.clockOffset,
      setHighlight: (highlight) => {
        page.highlight = highlight;
        applyMarks(page);
      },
      report: (message) => {
        showActionProblem(page, message);
        renderStatus(page);
      },
    },
    step: { kind: "idle" },
    entries: null,
    menu: document.querySelector<HTMLElement>("#partner-menu")!,
    bar: document.querySelector<HTMLElement>("#partner-bar")!,
    note: document.querySelector<HTMLElement>("#partner-note")!,
    sending: false,
    clock: undefined,
  };
}

/** Wo ein Zeiger-Ereignis auf der Canvas liegt, in CSS-Pixeln wie die Jellies der Bühne. */
function pointOf(event: MouseEvent): ScreenPoint {
  return { x: event.offsetX, y: event.offsetY };
}

/**
 * Hover, Klick auf ein Jelly und der Knopf „Weggehen“. Der laufende Partner-Ablauf hat Vorrang,
 * dann das eigene Jelly, sonst stellt ein Klick dazu.
 */
function listenToInput(page: MapPage, flow: PartnerFlow) {
  page.canvas.addEventListener("pointermove", (event) => page.view?.setPointer(pointOf(event)));
  page.canvas.addEventListener("pointerleave", () => page.view?.setPointer(null));
  page.canvas.addEventListener("click", (event) => {
    // Ein Doppelklick zählt einmal, sonst ginge das Jelly gleich wieder weg.
    if (event.detail > 1) return;
    const point = pointOf(event);
    if (handleStageClick(flow, point)) return;
    if (page.view?.isOwnAt(point)) {
      void openGestures(flow, point);
      return;
    }
    const picked = page.view?.pickAt(point) ?? null;
    if (picked !== null) void follow(page, picked === page.targetId ? null : picked);
  });
  page.leave.addEventListener("click", () => void follow(page, null));
  document.querySelector("#partner-cancel")!.addEventListener("click", () => cancelFlow(flow));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") handleEscape(flow);
  });
  page.source.onInviteEvent((event) => handleInviteEvent(flow, event, page.source.readOwn().id));
}

/** Die Fensterknöpfe. In der Vorschau tut das Browser-Fenster, was es kann. */
function listenToWindowTools() {
  const drag = document.querySelector<HTMLButtonElement>("#drag")!;
  drag.addEventListener("pointerdown", (event) => {
    if (event.button === 0 && desktop) void windowAction("drag");
  });
  document.querySelector("#minimize")!.addEventListener("click", () => {
    if (desktop) void windowAction("minimize");
  });
  document.querySelector("#close")!.addEventListener("click", () => {
    if (desktop) void windowAction("close");
    else window.close();
  });
}

/** Legt das Glas unter die Knöpfe. `data-glass` nimmt ihnen in `map.css` den eigenen Hintergrund. */
function startButtonGlass(page: MapPage) {
  try {
    const canvas = document.querySelector<HTMLCanvasElement>("#glass")!;
    page.glass = startGlass(canvas, document.querySelector<HTMLElement>("#frame")!);
    document.documentElement.toggleAttribute("data-glass", true);
  } catch {
    page.glass = null;
  }
}

/** Startet die Bühne. Ohne WebGL bleibt nur der Hinweis. */
function startView(page: MapPage) {
  try {
    page.view = createStageView({
      canvas: page.canvas,
      source: page.source,
      supersampling: SUPERSAMPLING,
      reloadDelayMs: RELOAD_DELAY_MS,
      onState: (state) => applyState(page, state),
      onError: (cause) => {
        page.readProblem = String(cause);
        renderStatus(page);
      },
    });
  } catch {
    page.readProblem = TEXT_NO_WEBGL;
    renderStatus(page);
  }
}

/** Sucht die Elemente aus `map.html` und startet die Karte. */
async function startMap() {
  const source = desktop
    ? await createDesktopSource()
    : (await import("./preview")).createPreviewSource();
  const page: MapPage = {
    source,
    canvas: document.querySelector<HTMLCanvasElement>("#map")!,
    leave: document.querySelector<HTMLButtonElement>("#leave")!,
    status: document.querySelector<HTMLElement>("#status")!,
    view: null,
    glass: null,
    targetId: null,
    highlight: null,
    players: [],
    clockOffset: 0,
    following: false,
    followEnd: undefined,
    actionProblem: "",
    readProblem: "",
    note: "",
  };
  listenToInput(page, createPartnerFlow(page));
  listenToWindowTools();
  startButtonGlass(page);
  startView(page);
}

// Scheitert schon der Start, bliebe sonst nur ein leeres Fenster.
startMap().catch((cause) => {
  const status = document.querySelector<HTMLElement>("#status")!;
  status.textContent = String(cause);
  status.hidden = false;
  status.toggleAttribute("data-problem", true);
});

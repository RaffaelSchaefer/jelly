/**
 * Die Karte im eigenen Fenster: die Bühne aus `@jelly/stage` über das ganze Fenster, dazu das
 * eigene Jelly und „Weggehen“. Ein Klick aufs eigene Jelly startet ein Partner-Emote
 * (`partner.ts`), einer auf ein fremdes öffnet dessen Fenster (`actions.ts`), einer auf den Boden
 * einen Ausflug. Oben rechts lässt sich ein Jelly per Namen suchen (`search.ts`).
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
  type StagePoint,
  type StageState,
  type StageView,
} from "@jelly/stage";

import { desktop, windowAction } from "../backend";
import { knownPetColor } from "../pet";
import { createJellyMenu, type JellyMenu } from "./actions";
import { startGlass, type GlassLayer } from "./glass";
import {
  cancelFlow,
  handleEscape,
  handleInviteEvent,
  handleStageClick,
  openGestures,
  type PartnerFlow,
} from "./partner";
import { createJellySearch, type JellySearch } from "./search";
import { createDesktopSource, type MapSource } from "./source";
import "./map.css";

/**
 * Viele Ereignisse führen zu einem Neuladen. Das sind höchstens 32 der 300 Anfragen pro Minute, die
 * der Server einem Spieler erlaubt.
 */
const RELOAD_DELAY_MS = 2000;
/** Die Karte läuft neben Spielen, also ohne die doppelte Auflösung des Beamers. */
const SUPERSAMPLING = 1;
/** So lange bleibt eine Fehlermeldung zu einem Klick stehen. Das nächste Neuladen löscht sie nicht. */
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
  /** `null` im optimierten Modus und ohne WebGL: Dann bleiben Knöpfe und Hinweise einfarbig. */
  glass: GlassLayer | null;
  /** Das Gerät kann kein WebGL, ein neuer Versuch ist zwecklos. */
  glassFailed: boolean;
  menu: JellyMenu;
  search: JellySearch;
  targetId: number | null;
  /** Wohin das Jelly auf seinem Ausflug will. */
  destination: StagePoint | null;
  /** Wer gerade leuchtet, solange man einen Partner wählt. */
  highlight: StageHighlight | null;
  /** Die Jellies vom letzten Lesen, für den Namen eines Partners. */
  players: StagePlayer[];
  /** Abstand zur Uhr des Servers vom letzten Lesen. */
  clockOffset: number;
  /** Ein Aufruf läuft. Sie laufen einzeln, damit keiner einen neueren überholt. */
  acting: boolean;
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

/** Gibt Ziel, Leuchten und das Ziel des Ausflugs an die Bühne. */
function applyMarks(page: MapPage) {
  page.view?.setMarks({
    ownId: page.source.readOwn().id,
    targetId: page.targetId,
    highlight: page.highlight,
    destination: page.destination,
  });
}

/** Übernimmt das Ziel für Markierung und „Weggehen“, den es auch für einen Ausflug gibt. */
function setTarget(page: MapPage, targetId: number | null) {
  page.targetId = targetId;
  page.leave.hidden = targetId === null && page.destination === null;
  applyMarks(page);
}

/**
 * Übernimmt Ziel und Ausflug aus dem eigenen Stand. Enden sie von selbst, meldet das der Server mit
 * `follow.changed` und `trip.changed`, und die Bühne liest neu.
 */
function applyAway(page: MapPage, own: StagePlayer | undefined, trip: StagePoint | null) {
  page.destination = trip;
  setTarget(page, own?.follow?.player_id ?? null);
}

/** Legt das Glas unter die Knöpfe. `data-glass` nimmt ihnen in `map.css` den eigenen Hintergrund. */
function startButtonGlass(page: MapPage) {
  try {
    const canvas = document.querySelector<HTMLCanvasElement>("#glass")!;
    page.glass = startGlass(canvas, document.querySelector<HTMLElement>("#frame")!);
  } catch {
    page.glassFailed = true;
    document.documentElement.toggleAttribute("data-glass", false);
  }
}

/** Zeigt Glas oder, im optimierten Modus und ohne WebGL, die festen Knöpfe aus `map.css`. */
function applyButtonLook(page: MapPage, optimized: boolean) {
  if (optimized) {
    page.glass?.stop();
    page.glass = null;
    document.documentElement.toggleAttribute("data-glass", false);
  } else if (!page.glass && !page.glassFailed) {
    document.documentElement.toggleAttribute("data-glass", true);
    startButtonGlass(page);
  }
}

/** Übernimmt, was ein neuer Stand für die Seite bedeutet. */
function applyState(page: MapPage, state: StageState) {
  const { id, reducedMotion, optimizedRendering, frameLimit, trip } = page.source.readOwn();
  const own = state.players.find((player) => player.id === id);
  page.players = state.players;
  page.clockOffset = state.server_time - Date.now();
  applyAway(page, own, trip);
  const reduced = reducedMotion || OS_REDUCED_MOTION.matches;
  page.view?.setReducedMotion(reduced);
  page.view?.setFrameLimit(frameLimit);
  applyButtonLook(page, optimizedRendering);
  page.glass?.setFrameLimit(frameLimit);
  if (own) page.glass?.setLook(knownPetColor(own.color), reduced);
  page.note = state.areas.length === 0 && state.players.length === 0 ? TEXT_NO_LAN : "";
  page.readProblem = "";
  renderStatus(page);
}

/** Zeigt, warum ein Klick nicht geklappt hat, und räumt die Meldung später weg. */
function showActionProblem(page: MapPage, problem: string) {
  page.actionProblem = problem;
  setTimeout(() => {
    if (page.actionProblem !== problem) return;
    page.actionProblem = "";
    renderStatus(page);
  }, ACTION_PROBLEM_MS);
}

/** Schickt einen Aufruf ab und liest danach neu. Den Weg plant der Server und schickt ihn im Stream. */
async function runAction(page: MapPage, action: () => Promise<void>) {
  if (page.acting) return;
  page.acting = true;
  page.actionProblem = "";
  try {
    await action();
  } catch (cause) {
    showActionProblem(page, String(cause));
  }
  page.acting = false;
  renderStatus(page);
  page.view?.reload();
}

/**
 * Stellt das Jelly dazu oder weg. Das beendet einen Ausflug. Das Ziel gilt sofort, damit schon der
 * nächste Klick es kennt.
 */
function follow(page: MapPage, playerId: number | null) {
  return runAction(page, async () => {
    const target = await page.source.setFollow(playerId);
    page.destination = null;
    setTarget(page, target);
  });
}

/**
 * Schickt das Jelly auf einen Ausflug, der ein Dazustellen beendet. Der Zeiger steht sofort. Lehnt
 * der Server ab, räumt ihn das Neuladen danach wieder weg.
 */
function goTo(page: MapPage, point: StagePoint) {
  return runAction(page, () => {
    page.destination = point;
    setTarget(page, null);
    return page.source.goTo(point);
  });
}

/** Lässt ein Jelly aufleuchten. Den Lichtkegel zeichnet die Bühne, sobald das Ereignis ankommt. */
function highlight(page: MapPage, playerId: number) {
  return runAction(page, () => page.source.highlight(playerId));
}

/** Schließt, was gerade über der Karte offen ist. */
function closeWindows(page: MapPage) {
  page.menu.close();
  page.search.close();
}

/** Lässt das eigene Jelly aufleuchten. Vor dem ersten Lesen ist es noch nicht bekannt. */
function highlightOwn(page: MapPage) {
  closeWindows(page);
  const { id } = page.source.readOwn();
  if (id !== null) void highlight(page, id);
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
 * Ein Klick auf die Bühne. Der laufende Partner-Ablauf hat Vorrang, dann schließt er ein offenes
 * Fenster. Sonst entscheidet, was unter dem Zeiger liegt: das eigene Jelly, ein fremdes oder der
 * Boden.
 */
function handleClick(page: MapPage, flow: PartnerFlow, point: ScreenPoint) {
  if (handleStageClick(flow, point) || page.menu.close() || page.search.close()) return;
  if (page.view?.isOwnAt(point)) {
    void openGestures(flow, point);
    return;
  }
  const picked = page.view?.pickAt(point) ?? null;
  if (picked !== null) {
    page.menu.open(picked, point, picked === page.targetId);
    return;
  }
  const floor = page.view?.floorAt(point);
  if (floor) void goTo(page, floor);
}

/** Hover, Klicks und die festen Knöpfe. „Jelly suchen“ verbindet sich selbst. */
function listenToInput(page: MapPage, flow: PartnerFlow) {
  page.canvas.addEventListener("pointermove", (event) => page.view?.setPointer(pointOf(event)));
  page.canvas.addEventListener("pointerleave", () => page.view?.setPointer(null));
  page.canvas.addEventListener("click", (event) => {
    // Ein Doppelklick zählt einmal, sonst schlösse sein zweiter Klick das Fenster gleich wieder.
    if (event.detail <= 1) handleClick(page, flow, pointOf(event));
  });
  page.leave.addEventListener("click", () => {
    closeWindows(page);
    void follow(page, null);
  });
  document.querySelector("#highlight-own")!.addEventListener("click", () => highlightOwn(page));
  document.querySelector("#partner-cancel")!.addEventListener("click", () => cancelFlow(flow));
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    handleEscape(flow);
    closeWindows(page);
  });
  page.source.onInviteEvent((event) => handleInviteEvent(flow, event, page.source.readOwn().id));
  // Ponytail: Eine geänderte Einstellung kommt erst beim Lesen an. Wer aus dem Pet-Fenster zurückkommt,
  // liest neu. Ohne Klick auf die Karte erst beim nächsten Ereignis, sonst bräuchte es eigene Meldungen.
  window.addEventListener("focus", () => page.view?.reload());
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
        applyButtonLook(page, page.source.readOwn().optimizedRendering);
        renderStatus(page);
      },
    });
  } catch {
    page.readProblem = TEXT_NO_WEBGL;
    applyButtonLook(page, false);
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
    glassFailed: false,
    menu: createJellyMenu({
      follow: (playerId) => void follow(page, playerId),
      highlight: (playerId) => void highlight(page, playerId),
    }),
    search: createJellySearch({
      readPlayers: () => page.players,
      readOwnId: () => page.source.readOwn().id,
      onOpen: () => page.menu.close(),
      pick: (playerId) => void highlight(page, playerId),
    }),
    targetId: null,
    destination: null,
    highlight: null,
    players: [],
    clockOffset: 0,
    acting: false,
    actionProblem: "",
    readProblem: "",
    note: "",
  };
  listenToInput(page, createPartnerFlow(page));
  listenToWindowTools();
  // Welcher Modus gilt, sagt erst das erste Lesen. Bis dahin steht nur die Schrift da, wie bisher,
  // bevor das Glas gewachsen ist: So blitzen im normalen Modus keine festen Knöpfe auf.
  document.documentElement.toggleAttribute("data-glass", true);
  startView(page);
}

// Scheitert schon der Start, bliebe sonst nur ein leeres Fenster.
startMap().catch((cause) => {
  const status = document.querySelector<HTMLElement>("#status")!;
  status.textContent = String(cause);
  status.hidden = false;
  status.toggleAttribute("data-problem", true);
});

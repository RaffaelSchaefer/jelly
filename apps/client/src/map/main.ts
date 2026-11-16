/**
 * Die Karte im eigenen Fenster: die Bühne aus `@jelly/stage` über das ganze Fenster, unten eine
 * Leiste mit dem eigenen Jelly, Suche, Hervorheben und Kamera (`dock.ts`, `zoom.ts`). Ein Klick
 * aufs eigene Jelly startet ein Partner-Emote (`partner.ts`), einer auf ein fremdes öffnet dessen
 * Fenster (`actions.ts`), einer auf den Boden einen Ausflug, einer auf einen Hinweis am Rand fliegt
 * hin. Ein Doppelklick zoomt. Beim Öffnen fliegt die Kamera vom eigenen Jelly auf die ganze Halle.
 *
 * Reines TypeScript ohne React: Außer der Canvas gibt es hier nur Knöpfe und eine Statuszeile.
 *
 * @module
 */

import { createStageView, type ScreenPoint, type StageState } from "@jelly/stage";

import { desktop, windowAction } from "../backend";
import { knownPetColor } from "../pet";
import { createJellyMenu } from "./actions";
import { flyToJelly, follow, goTo, highlight } from "./commands";
import { createDock } from "./dock";
import { startGlass } from "./glass";
import { createNotice } from "./notice";
import { applyAway, applyMarks, findName, type MapPage } from "./page";
import {
  cancelFlow,
  handleEscape,
  handleInviteEvent,
  handleStageClick,
  openGestures,
  placeGestures,
  type PartnerFlow,
} from "./partner";
import { createJellySearch } from "./search";
import { createDesktopSource } from "./source";
import { listenToZoom } from "./zoom";
import "./map.css";

/**
 * Viele Ereignisse führen zu einem Neuladen. Das sind höchstens 32 der 300 Anfragen pro Minute, die
 * der Server einem Spieler erlaubt.
 */
const RELOAD_DELAY_MS = 2000;
/** Die Karte läuft neben Spielen, also ohne die doppelte Auflösung des Beamers. */
const SUPERSAMPLING = 1;
/** Oben die Fensterknöpfe, unten die Leiste (`#dock` in `map.css`): Die Halle passt dazwischen. */
const INSETS = { top: 44, bottom: 70 };
/** So lange wartet ein Ausflug, ob der Klick ein Doppelklick wird. */
const DOUBLE_CLICK_MS = 280;
const DOUBLE_CLICK_ZOOM = 2;
const TEXT_NO_LAN = "Gerade läuft keine LAN.";
const TEXT_NO_WEBGL = "Dieses Gerät kann die 3D-Karte nicht zeichnen.";
const OS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

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

/** Blendet die Karte ein. Beim ersten Stand fliegt die Kamera vom eigenen Jelly auf die Halle. */
function showMap(page: MapPage, hasOwn: boolean) {
  if (page.isShown) return;
  page.isShown = true;
  document.querySelector("#frame")!.toggleAttribute("data-ready", true);
  if (hasOwn) page.view?.playIntro();
}

/** Übernimmt, was ein neuer Stand für die Seite bedeutet. */
function applyState(page: MapPage, state: StageState) {
  const { id, reducedMotion, optimizedRendering, frameLimit, trip } = page.source.readOwn();
  const own = state.players.find((player) => player.id === id);
  page.players = state.players;
  page.clockOffset = state.server_time - Date.now();
  applyAway(page, own, trip);
  const reduced = reducedMotion ?? OS_REDUCED_MOTION.matches;
  document.documentElement.toggleAttribute("data-reduced-motion", reduced);
  page.view?.setReducedMotion(reduced);
  page.view?.setFrameLimit(frameLimit);
  applyButtonLook(page, optimizedRendering);
  page.glass?.setFrameLimit(frameLimit);
  if (own) page.glass?.setLook(knownPetColor(own.color), reduced);
  page.notice.setNote(state.areas.length === 0 && state.players.length === 0 ? TEXT_NO_LAN : "");
  page.notice.setReadProblem("");
  showMap(page, own !== undefined);
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
      locate: (playerId) => page.view?.locate(playerId) ?? null,
      flyTo: (playerId) => page.view?.flyTo(playerId),
      findName: (playerId) => findName(page, playerId),
      readServerTime: () => Date.now() + page.clockOffset,
      setHighlight: (highlight) => {
        page.highlight = highlight;
        applyMarks(page);
      },
      report: (message) => page.notice.problem(message),
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
 * Plant einen Ausflug, der kurz wartet: Wird der Klick ein Doppelklick, zoomt die Karte
 * stattdessen.
 */
function planTrip(page: MapPage, point: ScreenPoint) {
  const floor = page.view?.floorAt(point);
  if (!floor) return;
  clearTimeout(page.pendingTrip);
  page.pendingTrip = setTimeout(() => void goTo(page, floor), DOUBLE_CLICK_MS);
}

/**
 * Ein Klick auf die Bühne. Ein Hinweis am Rand fliegt hin. Dann hat der laufende Partner-Ablauf
 * Vorrang, dann schließt er ein offenes Fenster. Sonst entscheidet, was unter dem Zeiger liegt: das
 * eigene Jelly, ein fremdes oder der Boden.
 */
function handleClick(page: MapPage, flow: PartnerFlow, point: ScreenPoint) {
  const hinted = page.view?.hintAt(point) ?? null;
  if (hinted !== null) {
    flyToJelly(page, hinted);
    return;
  }
  if (handleStageClick(flow, point) || page.menu.close() || page.search.close()) return;
  if (page.view?.isOwnAt(point)) {
    void openGestures(flow);
    return;
  }
  const picked = page.view?.pickAt(point) ?? null;
  if (picked !== null) page.menu.open(picked, picked === page.targetId);
  else planTrip(page, point);
}

/** Ein Doppelklick zoomt auf den Punkt und lässt die Kamera dort. Ein geplanter Ausflug entfällt. */
function handleDoubleClick(page: MapPage, point: ScreenPoint) {
  if (!page.view || page.view.hintAt(point) !== null) return;
  clearTimeout(page.pendingTrip);
  page.view.zoomInAt(point, DOUBLE_CLICK_ZOOM);
}

/** Hover, Klicks und Tasten. Leiste, Suche und Kamera verbinden sich selbst. */
function listenToInput(page: MapPage, flow: PartnerFlow) {
  // Vor dem Klick-Hörer unten: Der Zoom schluckt den Klick am Ende eines Ziehens.
  listenToZoom({ canvas: page.canvas, readView: () => page.view });
  page.canvas.addEventListener("pointermove", (event) => page.view?.setPointer(pointOf(event)));
  page.canvas.addEventListener("pointerleave", () => page.view?.setPointer(null));
  page.canvas.addEventListener("click", (event) => {
    // Der zweite Klick eines Doppelklicks gehört dem Zoom.
    if (event.detail <= 1) handleClick(page, flow, pointOf(event));
  });
  page.canvas.addEventListener("dblclick", (event) => handleDoubleClick(page, pointOf(event)));
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

/** Nach jedem Bild: Fenster bleiben an ihrem Jelly, die Leiste zeigt die Kamera. */
function followFrame(page: MapPage, flow: PartnerFlow) {
  if (!page.view) return;
  page.dock.showCamera(page.view.readCamera());
  page.menu.place();
  placeGestures(flow);
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
function startView(page: MapPage, flow: PartnerFlow) {
  try {
    page.view = createStageView({
      canvas: page.canvas,
      source: page.source,
      supersampling: SUPERSAMPLING,
      reloadDelayMs: RELOAD_DELAY_MS,
      insets: INSETS,
      onState: (state) => applyState(page, state),
      onError: (cause) => {
        page.notice.setReadProblem(String(cause));
        applyButtonLook(page, page.source.readOwn().optimizedRendering);
        showMap(page, false);
      },
      onFrame: () => followFrame(page, flow),
    });
  } catch {
    page.notice.setReadProblem(TEXT_NO_WEBGL);
    applyButtonLook(page, false);
  }
}

/** Baut die Seite aus den Elementen von `map.html`. */
function createPage(source: MapPage["source"]): MapPage {
  const page: MapPage = {
    source,
    canvas: document.querySelector<HTMLCanvasElement>("#map")!,
    view: null,
    glass: null,
    glassFailed: false,
    menu: createJellyMenu({
      follow: (playerId) => void follow(page, playerId),
      highlight: (playerId) => void highlight(page, playerId),
      locate: (playerId) => page.view?.locate(playerId) ?? null,
    }),
    search: createJellySearch({
      readPlayers: () => page.players,
      readOwnId: () => page.source.readOwn().id,
      onOpen: () => page.menu.close(),
      pick: (playerId) => void highlight(page, playerId),
    }),
    dock: createDock({
      highlightOwn: () => highlightOwn(page),
      leave: () => {
        closeWindows(page);
        void follow(page, null);
      },
    }),
    notice: createNotice(document.querySelector<HTMLElement>("#status")!),
    targetId: null,
    destination: null,
    highlight: null,
    players: [],
    clockOffset: 0,
    acting: false,
    pendingTrip: undefined,
    isShown: false,
  };
  return page;
}

/** Sucht die Elemente aus `map.html` und startet die Karte. */
async function startMap() {
  const source = desktop
    ? await createDesktopSource()
    : (await import("./preview")).createPreviewSource();
  const page = createPage(source);
  const flow = createPartnerFlow(page);
  listenToInput(page, flow);
  listenToWindowTools();
  // Welcher Modus gilt, sagt erst das erste Lesen. Bis dahin steht nur die Schrift da, wie bisher,
  // bevor das Glas gewachsen ist: So blitzen im normalen Modus keine festen Knöpfe auf.
  document.documentElement.toggleAttribute("data-glass", true);
  startView(page, flow);
}

// Scheitert schon der Start, bliebe sonst nur ein leeres Fenster.
startMap().catch((cause) => {
  const status = document.querySelector<HTMLElement>("#status")!;
  status.textContent = String(cause);
  status.hidden = false;
  status.toggleAttribute("data-problem", true);
});

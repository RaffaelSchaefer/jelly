/**
 * Die Karte im eigenen Fenster: die Bühne aus `@jelly/stage` über das ganze Fenster, dazu das
 * eigene Jelly, Klicks zum Dazustellen und „Weggehen“.
 *
 * Reines TypeScript ohne React: Außer der Canvas gibt es hier nur ein paar Knöpfe und eine
 * Statuszeile.
 *
 * @module
 */

import { createStageView, type ScreenPoint, type StageState, type StageView } from "@jelly/stage";

import { desktop, windowAction } from "../backend";
import { createDesktopSource, type MapSource } from "./source";
import "./map.css";

/**
 * Viele Ereignisse führen zu einem Neuladen. Das sind höchstens 32 der 300 Anfragen pro Minute, die
 * der Server einem Spieler erlaubt.
 */
const RELOAD_DELAY_MS = 2000;
/** Die Karte läuft neben Spielen, also ohne die doppelte Auflösung des Beamers. */
const SUPERSAMPLING = 1;
/** So lange bleibt eine Fehlermeldung zum Dazustellen stehen. Das nächste Neuladen löscht sie nicht. */
const ACTION_PROBLEM_MS = 6000;
const TEXT_NO_LAN = "Gerade läuft keine LAN.";
const TEXT_NO_WEBGL = "Dieses Gerät kann die 3D-Karte nicht zeichnen.";
const OS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Die Seite und was sich auf ihr ändert. */
interface MapPage {
  source: MapSource;
  canvas: HTMLCanvasElement;
  leave: HTMLButtonElement;
  status: HTMLElement;
  /** `null`, bis die Bühne läuft. */
  view: StageView | null;
  targetId: number | null;
  /** Ein Aufruf zum Dazustellen läuft. Sie laufen einzeln, damit keiner einen neueren überholt. */
  following: boolean;
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

/** Übernimmt das Ziel für Markierung und „Weggehen“. */
function setTarget(page: MapPage, targetId: number | null) {
  page.targetId = targetId;
  page.leave.hidden = targetId === null;
  page.view?.setMarks({ ownId: page.source.readOwn().id, targetId });
}

/**
 * Übernimmt, was ein neuer Stand für die Seite bedeutet. Das Ziel kommt aus dem eigenen Eintrag:
 * Wird ein Ziel gelöscht, fällt es ohne Ereignis weg.
 */
function applyState(page: MapPage, state: StageState) {
  const { id, reducedMotion } = page.source.readOwn();
  const own = state.players.find((player) => player.id === id);
  setTarget(page, own?.follow_player_id ?? null);
  page.view?.setReducedMotion(reducedMotion || OS_REDUCED_MOTION.matches);
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
 * Stellt das Jelly dazu oder weg. Das Ziel gilt sofort, damit schon der nächste Klick es kennt, und
 * das Neuladen holt den Weg dorthin.
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

/** Wo ein Zeiger-Ereignis auf der Canvas liegt, in CSS-Pixeln wie die Jellies der Bühne. */
function pointOf(event: MouseEvent): ScreenPoint {
  return { x: event.offsetX, y: event.offsetY };
}

/** Hover, Klick auf ein Jelly und der Knopf „Weggehen“. */
function listenToInput(page: MapPage) {
  page.canvas.addEventListener("pointermove", (event) => page.view?.setPointer(pointOf(event)));
  page.canvas.addEventListener("pointerleave", () => page.view?.setPointer(null));
  page.canvas.addEventListener("click", (event) => {
    // Ein Doppelklick zählt einmal, sonst ginge das Jelly gleich wieder weg.
    if (event.detail > 1) return;
    const picked = page.view?.pickAt(pointOf(event)) ?? null;
    if (picked !== null) void follow(page, picked === page.targetId ? null : picked);
  });
  page.leave.addEventListener("click", () => void follow(page, null));
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
    targetId: null,
    following: false,
    actionProblem: "",
    readProblem: "",
    note: "",
  };
  listenToInput(page);
  listenToWindowTools();
  startView(page);
}

// Scheitert schon der Start, bliebe sonst nur ein leeres Fenster.
startMap().catch((cause) => {
  const status = document.querySelector<HTMLElement>("#status")!;
  status.textContent = String(cause);
  status.hidden = false;
  status.toggleAttribute("data-problem", true);
});

/**
 * Stapel auf der Karte: welcher Knopf an einem Jelly steht, und was er auslöst. Steht der Stapel zu
 * weit weg, läuft das eigene Jelly erst hin und klettert bei der Ankunft. Steht das andere Jelly
 * allein, stellt sich das eigene dazu und beginnt dort seinen eigenen Stapel. Was nach der Ankunft
 * passieren soll, steht als ein Plan in `page.stackPlan`, `watchStackPlan` prüft ihn nach jedem
 * Bild. Jede andere Bewegung des Jellys (`follow` und `goTo` in `commands.ts`) verwirft ihn.
 *
 * @module
 */

import type { StageMove, StageStack } from "@jelly/stage";

import type { StackChoice } from "./actions";

import { runAction } from "./commands";
import { findName, setTarget, type MapPage, type StackWalk } from "./page";

/** Bis dahin muss der neue Weg da sein. Der Server plant ihn etwa eine Sekunde voraus. */
const START_WAIT_MS = 10_000;
/**
 * Länger wartet kein Plan. Bei `walk_speed` 0,4 m/s läuft ein Jelly so weit über 50 m, aber wer
 * einem Jelly folgt, das immer weiterbummelt, kommt vielleicht nie an.
 */
const WALK_LIMIT_MS = 180_000;
/** Die Arten der Wege, auf deren Ende ein Plan wartet. */
const TRIP_MOVE = "trip";
const FOLLOW_MOVE = "follow";

const LABEL_START = "Stapel starten";
const LABEL_DOWN = "Absteigen";
const TEXT_CLIMBED = "Dein Jelly klettert auf den Stapel.";
const TEXT_WALKING = "Dein Jelly läuft zum Stapel.";
const TEXT_STARTED = "Dein Jelly beginnt einen Stapel.";
const TEXT_DOWN = "Dein Jelly steigt vom Stapel.";
const TEXT_TOO_FAR = "Dein Jelly steht noch zu weit weg vom Stapel.";
const TEXT_GONE = "Der Stapel ist schon zerfallen.";
const TEXT_LATE = "Dein Jelly ist nicht rechtzeitig angekommen.";

/** Wie weit der Weg eines Plans ist. */
export type WalkState = "walking" | "arrived" | "late";

/** Der Stapel, auf dem ein Jelly steht. */
export function findStackOf(stacks: StageStack[], playerId: number | null) {
  return playerId === null
    ? undefined
    : stacks.find((stack) => stack.member_ids.includes(playerId));
}

/** Welchen Stapel-Knopf ein fremdes Jelly bekommt. */
export function chooseStack(
  stacks: StageStack[],
  ownId: number | null,
  playerId: number,
): StackChoice {
  const stack = findStackOf(stacks, playerId);
  if (!stack) return { kind: "start" };
  if (ownId !== null && stack.member_ids.includes(ownId)) return null;
  return { kind: "join", stackId: stack.id };
}

/**
 * Ob das Jelly angekommen ist: Sein neuester Weg ist der des Plans, und dessen letzter Punkt ist
 * erreicht. Kommt kein solcher Weg oder dauert alles zu lange, gibt der Plan auf.
 */
export function readWalk(move: StageMove | null, walk: StackWalk, now: number): WalkState {
  if (now - walk.clickedAt > WALK_LIMIT_MS) return "late";
  const isOurs = move !== null && move.kind === walk.moveKind && move.start_at >= walk.since;
  if (!isOurs) return now - walk.clickedAt > START_WAIT_MS ? "late" : "walking";
  const end = move.start_at + (move.points.at(-1)?.t ?? 0);
  return now >= end ? "arrived" : "walking";
}

/** Uhrzeit des Servers jetzt. */
function serverNow(page: MapPage) {
  return Date.now() + page.clockOffset;
}

/** Klettern und Beginnen beenden beim Server Ausflug und Dazustellen. */
function endWalks(page: MapPage) {
  page.destination = null;
  setTarget(page, null);
}

/** Schickt das Jelly auf einen Ausflug zum Stapel und plant das Klettern bei der Ankunft. */
async function walkToStack(page: MapPage, stack: StageStack) {
  const point = { x: stack.x, y: stack.y };
  page.destination = point;
  setTarget(page, null);
  const since = serverNow(page);
  await page.source.goTo(point);
  page.stackPlan = {
    kind: "join",
    stackId: stack.id,
    moveKind: TRIP_MOVE,
    since,
    clickedAt: since,
  };
  return TEXT_WALKING;
}

/** Klettert auf einen Stapel. Ist er zu weit weg, läuft das Jelly hin, wenn es `mayWalk` darf. */
function climb(page: MapPage, stackId: number, mayWalk: boolean) {
  return runAction(page, async () => {
    if (await page.source.joinStack(stackId)) {
      endWalks(page);
      return TEXT_CLIMBED;
    }
    const stack = page.view?.readStacks().find((running) => running.id === stackId);
    if (mayWalk && stack) return walkToStack(page, stack);
    page.notice.problem(TEXT_TOO_FAR);
    return "";
  });
}

/** Beginnt einen Stapel, wo das eigene Jelly steht. */
function startHere(page: MapPage) {
  return runAction(page, async () => {
    await page.source.startStack();
    endWalks(page);
    return TEXT_STARTED;
  });
}

/**
 * Stellt das Jelly zu einem anderen und plant den Stapel bei der Ankunft. Steht es schon dort,
 * schickt der Server keinen neuen Weg, dann zählt der letzte.
 */
function startBeside(page: MapPage, playerId: number) {
  page.view?.flyTo(playerId);
  return runAction(page, async () => {
    const clickedAt = serverNow(page);
    const isThere = page.targetId === playerId;
    const target = isThere ? playerId : await page.source.setFollow(playerId);
    page.destination = null;
    setTarget(page, target);
    if (target !== playerId) return "";
    const since = isThere ? -Infinity : clickedAt;
    page.stackPlan = { kind: "start", moveKind: FOLLOW_MOVE, since, clickedAt };
    return `Dein Jelly geht zu ${findName(page, playerId)} und beginnt dort einen Stapel.`;
  });
}

/** Der Stapel-Knopf am fremden Jelly. Ein neuer Klick verwirft einen älteren Plan. */
export function actOnStack(page: MapPage, playerId: number, choice: StackChoice) {
  page.stackPlan = null;
  if (choice?.kind === "start") return startBeside(page, playerId);
  if (!choice) return;
  page.view?.flyTo(playerId);
  return climb(page, choice.stackId, true);
}

/** Der Stapel-Knopf am eigenen Jelly: absteigen oder hier beginnen. */
export function toggleOwnStack(page: MapPage) {
  page.stackPlan = null;
  const ownId = page.source.readOwn().id;
  if (!findStackOf(page.view?.readStacks() ?? [], ownId)) return startHere(page);
  return runAction(page, async () => {
    await page.source.leaveStack();
    return TEXT_DOWN;
  });
}

/** Beschriftet den Stapel-Knopf am eigenen Jelly, bevor sein Fenster aufgeht. */
export function labelOwnStack(page: MapPage) {
  const button = document.querySelector<HTMLButtonElement>("#own-stack")!;
  const ownId = page.source.readOwn().id;
  const isOn = findStackOf(page.view?.readStacks() ?? [], ownId) !== undefined;
  button.querySelector("span")!.textContent = isOn ? LABEL_DOWN : LABEL_START;
  button.toggleAttribute("data-on-stack", isOn);
}

/** Beendet den Plan mit einer Meldung. */
function givePlanUp(page: MapPage, text: string) {
  page.stackPlan = null;
  page.notice.problem(text);
}

/**
 * Nach jedem Bild: Ist das Jelly angekommen, klettert es oder beginnt seinen Stapel. Läuft gerade
 * ein Aufruf, wartet der Plan, sonst ginge sein eigener verloren.
 */
export function watchStackPlan(page: MapPage) {
  const plan = page.stackPlan;
  const ownId = page.source.readOwn().id;
  if (!plan || !page.view || page.acting || ownId === null) return;
  const now = serverNow(page);
  if (plan.kind === "join") {
    const stack = page.view.readStacks().find((running) => running.id === plan.stackId);
    if (!stack || stack.ends_at <= now) return givePlanUp(page, TEXT_GONE);
  }
  const walk = readWalk(page.view.readMove(ownId), plan, now);
  if (walk === "late") givePlanUp(page, TEXT_LATE);
  if (walk !== "arrived") return;
  page.stackPlan = null;
  void (plan.kind === "join" ? climb(page, plan.stackId, false) : startHere(page));
}

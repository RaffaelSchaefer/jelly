/**
 * „Knöpfe ausblenden“ (`Settings.idleView`): Ist niemand beim Fenster, trägt `<html>` das Attribut
 * `data-idle-view`, `idle.css` blendet danach aus. Beim Fenster ist, wessen Maus oder Stift darüber
 * schwebt, und ein Finger noch einige Sekunden nach dem Heben. Der erste Tipp auf einen
 * ausgeblendeten Knopf blendet nur ein. Wann das alles gilt, rechnet `pet/idleView.ts`.
 *
 * @module
 */

import { useEffect, useState } from "react";

import type { PanelId } from "./PetStage";
import type { PetGame } from "./usePet";

import {
  canHover,
  idleViewNow,
  isPresent,
  nextPresence,
  NOBODY,
  onlyReveals,
  presenceEndsAt,
  type PresenceEvent,
} from "./pet";
import "./idle.css";

/** Das Fenster des Pets. In der Browser-Vorschau ist es kleiner als die Seite. */
const WINDOW = ".pet-window";
/** Das Jelly selbst: Es darf man auch stupsen, während die Knöpfe fehlen. */
const JELLY = ".pet-touch";
/** Darunter gilt ein Knopf als ausgeblendet. So zählt auch, was gerade erst verblasst. */
const HIDDEN_BELOW = 0.5;

/** Ob ein Element im Pet-Fenster liegt. */
function inWindow(target: EventTarget | null) {
  return target instanceof Element && target.closest(WINDOW) !== null;
}

/** Ob ein Ziel gerade unsichtbar ist: Es selbst oder ein Vorfahr im Fenster ist ausgeblendet. */
function isHidden(target: EventTarget | null) {
  if (!document.documentElement.hasAttribute("data-idle-view")) return false;
  let element = target instanceof Element ? target : null;
  for (; element && !element.matches(WINDOW); element = element.parentElement) {
    if (Number(getComputedStyle(element).opacity) < HIDDEN_BELOW) return true;
  }
  return false;
}

/** Was ein Zeiger-Ereignis für die Anwesenheit heißt, oder `null`. */
function presenceOf(event: PointerEvent): PresenceEvent | null {
  const inside = inWindow(event.target);
  const hovers = canHover(event.pointerType);
  switch (event.type) {
    case "pointermove":
      return hovers ? { kind: "point", inside } : null;
    case "pointerdown":
      return hovers ? { kind: "point", inside } : { kind: "touch", inside };
    case "pointerout":
      // Nach dem Tippen auf einem Touchscreen käme sonst gleich das Verlassen.
      return hovers && !inWindow(event.relatedTarget) ? { kind: "leave" } : null;
    default:
      return hovers ? null : { kind: "lift", at: performance.now() };
  }
}

/**
 * Hört auf Zeiger und Fokus im ganzen Dokument. Auf Tauri mit durchsichtigem Fenster kommt das
 * Verlassen nicht immer an: Darum lesen auch Bewegung und Tippen den Stand neu, und verliert das
 * Fenster den Fokus, gilt der Zeiger als draußen. Bis zur nächsten Bewegung bleibt das falsch, im
 * Zweifel also sichtbar.
 *
 * @returns Das Aufräumen.
 */
function listenForPresence(update: (event: PresenceEvent) => void) {
  const read = (event: PointerEvent) => {
    const presence = presenceOf(event);
    if (presence) update(presence);
  };
  const blur = () => update({ kind: "blur", at: performance.now() });
  const types = ["pointermove", "pointerdown", "pointerout", "pointerup", "pointercancel"] as const;
  for (const type of types) document.addEventListener(type, read);
  window.addEventListener("blur", blur);
  return () => {
    for (const type of types) document.removeEventListener(type, read);
    window.removeEventListener("blur", blur);
  };
}

/**
 * Der erste Druck von Finger oder Stift auf einen ausgeblendeten Knopf blendet nur ein: Druck und
 * Klick danach kommen bei niemandem an, auch nicht bei Griff und Geräuschen. Hört deshalb vor allen
 * anderen am Fenster.
 *
 * @returns Das Aufräumen.
 */
function guardFirstTap(update: (event: PresenceEvent) => void) {
  let swallowClick = false;
  const down = (event: PointerEvent) => {
    const onJelly = event.target instanceof Element && event.target.closest(JELLY) !== null;
    swallowClick = onlyReveals(event.pointerType, isHidden(event.target), onJelly);
    if (!swallowClick) return;
    event.stopPropagation();
    event.preventDefault();
    const presence = presenceOf(event);
    if (presence) update(presence);
  };
  const click = (event: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  };
  const key = () => {
    swallowClick = false;
  };
  window.addEventListener("pointerdown", down, true);
  window.addEventListener("click", click, true);
  window.addEventListener("keydown", key, true);
  return () => {
    window.removeEventListener("pointerdown", down, true);
    window.removeEventListener("click", click, true);
    window.removeEventListener("keydown", key, true);
  };
}

/** Ob jemand beim Fenster ist. Ein gehobener Finger wirkt mit einem Zeitgeber nach. */
function usePresence() {
  const [present, setPresent] = useState(
    () => document.querySelector(WINDOW)?.matches(":hover") ?? false,
  );
  useEffect(() => {
    const hovering = document.querySelector(WINDOW)?.matches(":hover") ?? false;
    let presence = { ...NOBODY, hovering };
    let timer = 0;
    const settle = () => {
      const now = performance.now();
      setPresent(isPresent(presence, now));
      window.clearTimeout(timer);
      const ends = presenceEndsAt(presence, now);
      if (ends !== null) timer = window.setTimeout(settle, ends - now);
    };
    const update = (event: PresenceEvent) => {
      presence = nextPresence(presence, event);
      settle();
    };
    const stopListening = listenForPresence(update);
    const stopGuarding = guardFirstTap(update);
    return () => {
      stopListening();
      stopGuarding();
      window.clearTimeout(timer);
    };
  }, []);
  return present;
}

/**
 * Setzt `data-idle-view` auf `<html>`, solange ohne Zeiger etwas ausgeblendet ist. Nie, solange
 * etwas offen ist, das der Mensch braucht. Den Tastaturfokus im Fenster prüft `idle.css` selbst.
 *
 * @param panel - Das offene Panel, ohne die Update-Karte.
 * @param updateCard - Ob die Update-Karte über dem Dock steht.
 */
export function useIdleView(
  { game, hatching, incoming, error }: PetGame,
  panel: PanelId | null,
  joining: boolean,
  updateCard: boolean,
) {
  const present = usePresence();
  const view = idleViewNow(game.settings.idleView, present, {
    panel: panel !== null,
    joining,
    hatching,
    invite: incoming !== null,
    update: updateCard,
    error: error !== "",
  });
  useEffect(() => {
    const root = document.documentElement;
    if (view === "all") delete root.dataset.idleView;
    else root.dataset.idleView = view;
  }, [view]);
}

/**
 * Das Fenster an einem fremden Jelly auf der Karte: dazustellen, weggehen, hervorheben und stapeln.
 * Es bleibt am Jelly, auch wenn die Kamera fährt oder das Jelly läuft.
 *
 * @module
 */

import type { JellyOnScreen } from "@jelly/stage";

import { placeMenu } from "./partner";

const TEXT_FOLLOW = "Dazustellen";
const TEXT_LEAVE = "Weggehen";
const TEXT_JOIN = "Draufklettern";
const TEXT_START = "Stapel starten";

/** Was der Stapel-Knopf tut (`stacks.ts`). `null`: Beide stehen schon auf demselben Stapel. */
export type StackChoice = { kind: "join"; stackId: number } | { kind: "start" } | null;

/** Was die Knöpfe des Fensters auslösen und wo es sein Jelly findet. */
export interface JellyMenuActions {
  /** Stellt das eigene Jelly dazu oder mit `null` weg. */
  follow: (playerId: number | null) => void;
  highlight: (playerId: number) => void;
  /** Welcher Stapel-Knopf zum Jelly gehört. */
  chooseStack: (playerId: number) => StackChoice;
  stack: (playerId: number, choice: StackChoice) => void;
  locate: (playerId: number) => JellyOnScreen | null;
}

/** Was die Seite mit dem Fenster tun kann. */
export interface JellyMenu {
  /** Öffnet es neben dem Jelly. `isTarget` sagt, ob das eigene Jelly schon dort steht. */
  open: (playerId: number, isTarget: boolean) => void;
  /** Schließt es. `true`, wenn es offen war: Dann gehört der Klick dem Schließen. */
  close: () => boolean;
  /** Rückt das offene Fenster an sein Jelly. Ist es nicht mehr zu sehen, geht das Fenster zu. */
  place: () => void;
}

/** Sucht das Fenster aus `map.html` und verbindet seine Knöpfe. */
export function createJellyMenu(actions: JellyMenuActions): JellyMenu {
  const menu = document.querySelector<HTMLElement>("#jelly-menu")!;
  const follow = document.querySelector<HTMLButtonElement>("#jelly-follow")!;
  const highlight = document.querySelector<HTMLButtonElement>("#jelly-highlight")!;
  const stack = document.querySelector<HTMLButtonElement>("#jelly-stack")!;
  let chosen: { playerId: number; isTarget: boolean; stack: StackChoice } = {
    playerId: 0,
    isTarget: false,
    stack: null,
  };

  const close = () => {
    const wasOpen = !menu.hidden;
    menu.hidden = true;
    return wasOpen;
  };
  const place = () => {
    if (!menu.hidden && !placeMenu(menu, actions.locate(chosen.playerId))) close();
  };

  follow.addEventListener("click", () => {
    close();
    actions.follow(chosen.isTarget ? null : chosen.playerId);
  });
  highlight.addEventListener("click", () => {
    close();
    actions.highlight(chosen.playerId);
  });
  stack.addEventListener("click", () => {
    close();
    actions.stack(chosen.playerId, chosen.stack);
  });

  return {
    open: (playerId, isTarget) => {
      chosen = { playerId, isTarget, stack: actions.chooseStack(playerId) };
      const label = isTarget ? TEXT_LEAVE : TEXT_FOLLOW;
      follow.setAttribute("aria-label", label);
      follow.dataset.tip = label;
      follow.toggleAttribute("data-target", isTarget);
      const stackLabel = chosen.stack?.kind === "join" ? TEXT_JOIN : TEXT_START;
      stack.hidden = chosen.stack === null;
      stack.setAttribute("aria-label", stackLabel);
      stack.dataset.tip = stackLabel;
      stack.toggleAttribute("data-join", chosen.stack?.kind === "join");
      menu.hidden = false;
      place();
    },
    close,
    place,
  };
}

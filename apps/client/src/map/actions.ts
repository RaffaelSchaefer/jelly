/**
 * Das Fenster an einem fremden Jelly auf der Karte: dazustellen, weggehen oder hervorheben.
 *
 * @module
 */

import type { ScreenPoint } from "@jelly/stage";

import { placeMenu } from "./partner";

const TEXT_FOLLOW = "Dazustellen";
const TEXT_LEAVE = "Weggehen";

/** Was die Knöpfe des Fensters auslösen. */
export interface JellyMenuActions {
  /** Stellt das eigene Jelly dazu oder mit `null` weg. */
  follow: (playerId: number | null) => void;
  highlight: (playerId: number) => void;
}

/** Was die Seite mit dem Fenster tun kann. */
export interface JellyMenu {
  /** Öffnet es neben dem Klick. `isTarget` sagt, ob das eigene Jelly schon dort steht. */
  open: (playerId: number, at: ScreenPoint, isTarget: boolean) => void;
  /** Schließt es. `true`, wenn es offen war: Dann gehört der Klick dem Schließen. */
  close: () => boolean;
}

/** Sucht das Fenster aus `map.html` und verbindet seine Knöpfe. */
export function createJellyMenu(actions: JellyMenuActions): JellyMenu {
  const menu = document.querySelector<HTMLElement>("#jelly-menu")!;
  const follow = document.querySelector<HTMLButtonElement>("#jelly-follow")!;
  const highlight = document.querySelector<HTMLButtonElement>("#jelly-highlight")!;
  let chosen = { playerId: 0, isTarget: false };

  const close = () => {
    const wasOpen = !menu.hidden;
    menu.hidden = true;
    return wasOpen;
  };

  follow.addEventListener("click", () => {
    close();
    actions.follow(chosen.isTarget ? null : chosen.playerId);
  });
  highlight.addEventListener("click", () => {
    close();
    actions.highlight(chosen.playerId);
  });

  return {
    open: (playerId, at, isTarget) => {
      chosen = { playerId, isTarget };
      follow.textContent = isTarget ? TEXT_LEAVE : TEXT_FOLLOW;
      menu.hidden = false;
      placeMenu(menu, at);
    },
    close,
  };
}

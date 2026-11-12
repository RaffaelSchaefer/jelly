/**
 * Das Fenster an einem fremden Jelly auf der Karte: dazustellen, weggehen oder hervorheben. Es
 * bleibt am Jelly, auch wenn die Kamera fährt oder das Jelly läuft.
 *
 * @module
 */

import type { JellyOnScreen } from "@jelly/stage";

import { placeMenu } from "./partner";

const TEXT_FOLLOW = "Dazustellen";
const TEXT_LEAVE = "Weggehen";

/** Was die Knöpfe des Fensters auslösen und wo es sein Jelly findet. */
export interface JellyMenuActions {
  /** Stellt das eigene Jelly dazu oder mit `null` weg. */
  follow: (playerId: number | null) => void;
  highlight: (playerId: number) => void;
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
  let chosen = { playerId: 0, isTarget: false };

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

  return {
    open: (playerId, isTarget) => {
      chosen = { playerId, isTarget };
      const label = isTarget ? TEXT_LEAVE : TEXT_FOLLOW;
      follow.setAttribute("aria-label", label);
      follow.dataset.tip = label;
      follow.toggleAttribute("data-target", isTarget);
      menu.hidden = false;
      place();
    },
    close,
    place,
  };
}

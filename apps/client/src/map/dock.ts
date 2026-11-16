/**
 * Die Leiste unten: wo das eigene Jelly gerade ist, Suchen und Hervorheben, dann die Kamera. Die
 * Knöpfe zeigen nur Symbole, ihr Tooltip nennt Aktion und Taste. Die Kamera-Knöpfe verbindet
 * `zoom.ts`, die Suche `search.ts`.
 *
 * @module
 */

import type { CameraReading } from "@jelly/stage";

import { knownPetColor, PET_COLORS } from "../pet";

const TEXT_HOME = "Am Platz";
const TEXT_TRIP = "Auf Ausflug";

/** Wo das eigene Jelly gerade ist. */
export interface OwnPlace {
  color: string;
  /** Der Name des Jellys, bei dem es steht, sonst `null`. */
  targetName: string | null;
  isOnTrip: boolean;
}

/** Was die Knöpfe der Leiste auslösen. */
export interface DockActions {
  highlightOwn: () => void;
  /** Beendet Dazustellen oder Ausflug. */
  leave: () => void;
}

/** Was die Seite an der Leiste ändern kann. */
export interface Dock {
  /** Zeigt, wo das eigene Jelly ist, `null`, solange es nicht in der Halle ist. */
  showOwn: (place: OwnPlace | null) => void;
  /** Zeigt Zoom und ob die Kamera folgt. Ändert das DOM nur, wenn sich etwas geändert hat. */
  showCamera: (camera: CameraReading) => void;
}

/** Schreibt einen Zoom wie „2,5×“. */
export function formatZoom(factor: number): string {
  return `${(Math.round(factor * 10) / 10).toLocaleString("de-DE")}×`;
}

/** Was der Zustand des eigenen Jellys sagt. */
function describePlace(place: OwnPlace): string {
  if (place.targetName !== null) return `Bei ${place.targetName}`;
  return place.isOnTrip ? TEXT_TRIP : TEXT_HOME;
}

/** Tasten der Leiste: F öffnet die Suche, H lässt das eigene Jelly leuchten. */
function listenToKeys(actions: DockActions) {
  window.addEventListener("keydown", (event) => {
    const isTyping = event.target instanceof HTMLInputElement;
    if (isTyping || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === "f") {
      event.preventDefault();
      document.querySelector<HTMLButtonElement>("#find-open")!.click();
    } else if (key === "h") actions.highlightOwn();
  });
}

/** Sucht die Leiste aus `map.html` und verbindet ihre Knöpfe. */
export function createDock(actions: DockActions): Dock {
  const state = document.querySelector<HTMLElement>("#own-state")!;
  const dot = document.querySelector<HTMLElement>("#own-dot")!;
  const text = document.querySelector<HTMLElement>("#own-text")!;
  const leave = document.querySelector<HTMLButtonElement>("#leave")!;
  const level = document.querySelector<HTMLOutputElement>("#zoom-level")!;
  const follow = document.querySelector<HTMLButtonElement>("#zoom-own")!;
  leave.addEventListener("click", actions.leave);
  document.querySelector("#highlight-own")!.addEventListener("click", actions.highlightOwn);
  listenToKeys(actions);
  return {
    showOwn: (place) => {
      state.hidden = place === null;
      if (!place) return;
      const palette = PET_COLORS[knownPetColor(place.color)];
      dot.style.setProperty("--dot", palette.hex);
      dot.style.setProperty("--dot-glow", palette.glow);
      text.textContent = describePlace(place);
      leave.hidden = place.targetName === null && !place.isOnTrip;
    },
    showCamera: (camera) => {
      const zoom = formatZoom(camera.factor);
      if (level.value !== zoom) level.value = zoom;
      const pressed = String(camera.followsOwn);
      if (follow.getAttribute("aria-pressed") !== pressed)
        follow.setAttribute("aria-pressed", pressed);
    },
  };
}

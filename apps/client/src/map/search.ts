/**
 * Die Suche auf der Karte: ein Jelly per Namen finden, hervorheben und hinfliegen, auch wenn man es
 * in der Halle noch nicht entdeckt hat. Feld und Treffer liegen auf einer Glasfläche wie die
 * Schilder am Jelly, sie geht über der Leiste auf. Der beste Treffer steht direkt über dem Feld.
 *
 * @module
 */

import type { StagePlayer } from "@jelly/stage";

import { findPlayersByName, knownPetColor, PET_COLORS } from "../pet";

/** So viele Zeilen passen auch ins kleinste Fenster. Wer mehr sucht, tippt weiter. */
const MOST_ROWS = 6;
const TEXT_NOTHING_FOUND = "Kein Jelly gefunden.";

/** Was die Suche von der Seite braucht. */
export interface JellySearchActions {
  /** Die Jellies vom letzten Lesen. */
  readPlayers: () => StagePlayer[];
  readOwnId: () => number | null;
  /** Die Suche geht auf, andere Fenster sollen dann weichen. */
  onOpen: () => void;
  /** Ein Jelly wurde gewählt. */
  pick: (playerId: number) => void;
}

/** Was die Seite mit der Suche tun kann. */
export interface JellySearch {
  /** Schließt die Suche. `true`, wenn sie offen war: Dann gehört der Klick dem Schließen. */
  close: () => boolean;
}

/** Ein Teil einer Zeile mit eigener Klasse in `map.css`. */
function createPart(className: string, text = "") {
  const part = document.createElement("span");
  part.className = className;
  part.textContent = text;
  return part;
}

/** Baut die Zeile eines Treffers: Farbe des Jellys, Name und Level. */
function createRow(player: StagePlayer, onChoose: (playerId: number) => void) {
  const row = document.createElement("button");
  row.type = "button";
  const palette = PET_COLORS[knownPetColor(player.color)];
  const dot = createPart("find-dot");
  dot.style.setProperty("--dot", palette.hex);
  dot.style.setProperty("--dot-glow", palette.glow);
  row.append(
    dot,
    createPart("find-name", player.name),
    createPart("find-level", `Level ${player.level}`),
  );
  row.addEventListener("click", () => onChoose(player.id));
  return row;
}

/** Baut den Hinweis unter den Treffern. */
function createNote(text: string) {
  const note = document.createElement("p");
  note.setAttribute("role", "status");
  note.textContent = text;
  return note;
}

/** Was unter den Treffern steht, leer, wenn alle zu sehen sind. */
function noteAfterRows(matches: number, shown: number) {
  if (matches === 0) return [createNote(TEXT_NOTHING_FOUND)];
  return matches > shown ? [createNote(`und ${matches - shown} weitere, tippe weiter`)] : [];
}

/** Sucht die Elemente aus `map.html` und verbindet Knopf, Feld und Liste. */
export function createJellySearch(actions: JellySearchActions): JellySearch {
  const opener = document.querySelector<HTMLButtonElement>("#find-open")!;
  const panel = document.querySelector<HTMLFormElement>("#find-panel")!;
  const input = document.querySelector<HTMLInputElement>("#find-input")!;
  const list = document.querySelector<HTMLElement>("#find-list")!;

  const findMatches = () =>
    findPlayersByName(actions.readPlayers(), input.value, actions.readOwnId());

  const setOpen = (isOpen: boolean) => {
    panel.hidden = !isOpen;
    opener.setAttribute("aria-expanded", String(isOpen));
  };

  const close = () => {
    const wasOpen = !panel.hidden;
    setOpen(false);
    if (wasOpen) opener.focus();
    return wasOpen;
  };

  const choose = (playerId: number) => {
    close();
    actions.pick(playerId);
  };

  const render = () => {
    const matches = findMatches();
    const rows = matches.slice(0, MOST_ROWS).map((player) => createRow(player, choose));
    list.replaceChildren(...rows, ...noteAfterRows(matches.length, rows.length));
  };

  opener.addEventListener("click", () => {
    // Ein zweiter Klick auf den gedrückten Knopf schließt die Suche wieder.
    if (close()) return;
    actions.onOpen();
    input.value = "";
    render();
    setOpen(true);
    input.focus();
  });
  document.querySelector("#find-close")!.addEventListener("click", () => close());
  input.addEventListener("input", render);
  // Enter im Feld wählt den ersten Treffer, das erledigt das Formular von selbst.
  panel.addEventListener("submit", (event) => {
    event.preventDefault();
    const [first] = findMatches();
    if (first) choose(first.id);
  });

  return { close };
}

/**
 * Schilder: Anzeigetexte, Symbole und die reine Rechnung der Tafel in den Händen des Jellys.
 *
 * @module
 */

import type { IconName } from "../ui/Icon";
import type { Catalog } from "./types";

/** Symbol je Schild. Die Schlüssel kommen aus `GET /v1/catalog`. */
const SIGN_ICONS = new Map<string, IconName>([
  ["any", "users"],
  ["cs2", "target"],
  ["lol", "swords"],
  ["rocket-league", "rocket"],
  ["mario-kart", "flag"],
  ["minecraft", "cube"],
  ["board-game", "dice"],
  ["food", "food"],
]);

/** Symbol eines Schilds. Ein neuerer Server kann Schlüssel liefern, die die App nicht kennt. */
export function signIcon(key: string): IconName {
  return SIGN_ICONS.get(key) ?? "sign";
}

/** Text eines Schilds. `null` ohne Schild und bei einem Schlüssel außerhalb des Katalogs. */
export function signLabel(key: string | null, catalog: Catalog) {
  return catalog.signs.find((entry) => entry.key === key)?.label ?? null;
}

/** Was die Überschrift der Auswahl schon sagt. */
const SEARCH_PREFIX = "Suche ";

/** Text für die Kapsel in der Auswahl. Die Tafel und `aria-label` behalten den vollen Text. */
export function shortSignLabel(label: string) {
  return label.startsWith(SEARCH_PREFIX) ? label.slice(SEARCH_PREFIX.length) : label;
}

/** Platz für den Text auf der Tafel, in Pixeln ihrer Textur. */
const TEXT_WIDTH = 452;

/** Größte Schrift, die je Zeilenzahl noch in die Höhe der Tafel passt. */
const MAX_FONT_SIZE = [68, 54];

/** Die Zeilen eines Schilds und ihre Schriftgröße. */
export interface SignLines {
  lines: string[];
  size: number;
}

/**
 * Eine Zeile und die Möglichkeiten, den Text auf zwei zu verteilen. „Suche“ steht dabei für sich,
 * damit der Name eines Spiels ganz bleibt. Sonst geht jedes Leerzeichen.
 */
function lineBreaks(label: string) {
  if (label.startsWith(SEARCH_PREFIX)) {
    return [[label], [SEARCH_PREFIX.trim(), shortSignLabel(label)]];
  }
  const words = label.split(" ");
  const pairs = words
    .slice(1)
    .map((_, index) => [words.slice(0, index + 1).join(" "), words.slice(index + 1).join(" ")]);
  return [[label], ...pairs];
}

/**
 * Wählt eine oder zwei Zeilen, je nachdem, was die größere Schrift erlaubt.
 *
 * @param widthAt100 - Breite eines Texts in Pixeln bei Schriftgröße 100.
 */
export function fitSignLines(label: string, widthAt100: (text: string) => number): SignLines {
  let best: SignLines = { lines: [label], size: 0 };
  let bestLongest = Infinity;
  for (const lines of lineBreaks(label)) {
    const longest = Math.max(...lines.map(widthAt100));
    const size = Math.min(MAX_FONT_SIZE[lines.length - 1]!, (TEXT_WIDTH * 100) / longest);
    // Bei gleicher Schrift gewinnt die ausgewogenere Teilung.
    if (size > best.size || (size === best.size && longest < bestLongest)) {
      best = { lines, size };
      bestLongest = longest;
    }
  }
  return best;
}

/** Wie weit die Tafel den Händen folgt, in Einheiten des Jellys. So bleibt sie unter dem Gesicht. */
const BOARD_RANGE = { x: 0.2, minY: -0.62, maxY: -0.15, tilt: 0.22 };

/** `value` auf den Bereich von `min` bis `max` begrenzt. */
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Lage der Tafel zwischen beiden Händen. */
export function boardPose(left: { x: number; y: number }, right: { x: number; y: number }) {
  return {
    x: clamp((left.x + right.x) / 2, -BOARD_RANGE.x, BOARD_RANGE.x),
    y: clamp((left.y + right.y) / 2, BOARD_RANGE.minY, BOARD_RANGE.maxY),
    tilt: clamp(
      Math.atan2(right.y - left.y, right.x - left.x),
      -BOARD_RANGE.tilt,
      BOARD_RANGE.tilt,
    ),
  };
}

/** Sekunden, die die Tafel für einen Textwechsel braucht. */
const FLIP_SECONDS = 0.32;

/** Bis zu dieser Höhe ist die Tafel noch so klein, dass ein neuer Text keine Drehung braucht. */
const BARELY_RAISED = 0.05;

/** Längster Zeitschritt, damit nach einer Pause nichts springt. */
const MAX_DELTA = 0.1;

/** Zustand der Tafel zwischen zwei Bildern. */
export interface BoardMotion {
  /** 0 = unten, 1 = oben, kurz darüber beim Federn. */
  raise: number;
  raiseSpeed: number;
  /** Fortschritt der Drehung. 1 heißt: Die Tafel steht. */
  flip: number;
  /** Text auf der Tafel. Er bleibt beim Senken, bis sie weg ist. */
  shown: string | null;
}

/** Eine gesenkte, leere Tafel. */
export function createBoardMotion(): BoardMotion {
  return { raise: 0, raiseSpeed: 0, flip: 1, shown: null };
}

/** Feder mit den Werten von `springHands` in `@jelly/scene`: Tafel und Hände kommen zusammen. */
function springBoard(board: BoardMotion, wanted: number, delta: number) {
  board.raiseSpeed += (wanted - board.raise) * 190 * delta;
  board.raiseSpeed *= Math.exp(-(wanted ? 13 : 20) * delta);
  board.raise += board.raiseSpeed * delta;
}

/** Dreht weiter und wechselt den Text genau dann, wenn die Tafel hochkant steht. */
function turnBoard(board: BoardMotion, label: string | null, delta: number) {
  if (label && label !== board.shown) {
    if (board.raise < BARELY_RAISED) board.shown = label;
    else if (board.flip >= 1) board.flip = 0;
  }
  if (board.flip >= 1) return;
  const before = board.flip;
  board.flip = Math.min(1, before + delta / FLIP_SECONDS);
  // Erst hier: Wer während der Drehung weiterwählt, sieht danach nur die neueste Wahl.
  if (label && before < 0.5 && board.flip >= 0.5) board.shown = label;
}

/**
 * Bewegt die Tafel um ein Bild weiter.
 *
 * @param label - Der Text, den sie zeigen soll. `null` senkt sie.
 */
export function stepBoard(
  board: BoardMotion,
  label: string | null,
  rawDelta: number,
  reducedMotion: boolean,
) {
  if (reducedMotion) {
    board.raise = label ? 1 : 0;
    board.raiseSpeed = 0;
    board.flip = 1;
    board.shown = label ?? board.shown;
    return;
  }
  const delta = Math.min(rawDelta, MAX_DELTA);
  // Erst drehen: Eine Tafel, die gerade erst hochkommt, trägt so von Anfang an den richtigen Text.
  turnBoard(board, label, delta);
  springBoard(board, label ? 1 : 0, delta);
}

/** Winkel um die Hochachse: hinaus bis hochkant, dann von der anderen Seite zurück. */
export function boardAngle(flip: number) {
  if (flip >= 1) return 0;
  const eased = flip < 0.5 ? 2 * flip * flip : 1 - 2 * (1 - flip) * (1 - flip);
  return (eased < 0.5 ? eased : eased - 1) * Math.PI;
}

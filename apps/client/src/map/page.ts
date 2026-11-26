/**
 * Was die Karte über sich weiß und wie es auf der Seite steht: Ziel und Ausflug des eigenen Jellys,
 * die Markierungen der Bühne und der Zustand in der Leiste.
 *
 * @module
 */

import type { StageHighlight, StagePlayer, StagePoint, StageView } from "@jelly/stage";

import type { JellyMenu } from "./actions";
import type { Dock } from "./dock";
import type { GlassLayer } from "./glass";
import type { NewsWatch } from "./newsWatch";
import type { Notice } from "./notice";
import type { JellySearch } from "./search";
import type { MapSource } from "./source";

/** Ein Jelly, dessen Namen die Karte nicht kennt. */
export const TEXT_UNKNOWN_JELLY = "dem Jelly";

/** Auf welchen Weg ein Stapel-Plan wartet (`stacks.ts`). Alle Zeiten in Serverzeit. */
export interface StackWalk {
  /** Die Art des Wegs, `trip` oder `follow`. */
  moveKind: string;
  /** Erst ein Weg ab dann zählt. */
  since: number;
  clickedAt: number;
}

/** Was das eigene Jelly tut, sobald es angekommen ist: klettern oder beginnen. */
export type StackPlan = StackWalk & ({ kind: "join"; stackId: number } | { kind: "start" });

/** Die Seite und was sich auf ihr ändert. */
export interface MapPage {
  source: MapSource;
  canvas: HTMLCanvasElement;
  /** `null`, bis die Bühne läuft. */
  view: StageView | null;
  /** `null` im optimierten Modus und ohne WebGL: Dann bleiben Knöpfe und Hinweise einfarbig. */
  glass: GlassLayer | null;
  /** Das Gerät kann kein WebGL, ein neuer Versuch ist zwecklos. */
  glassFailed: boolean;
  menu: JellyMenu;
  search: JellySearch;
  dock: Dock;
  notice: Notice;
  targetId: number | null;
  /** Wohin das Jelly auf seinem Ausflug will. */
  destination: StagePoint | null;
  /** Wer gerade leuchtet, solange man einen Partner wählt. */
  highlight: StageHighlight | null;
  /** Die Jellies vom letzten Lesen, für Namen. */
  players: StagePlayer[];
  /** Abstand zur Uhr des Servers vom letzten Lesen. */
  clockOffset: number;
  /** Ein Aufruf läuft. Sie laufen einzeln, damit keiner einen neueren überholt. */
  acting: boolean;
  /** Ein Ausflug wartet kurz, ob aus dem Klick ein Doppelklick wird. */
  pendingTrip: ReturnType<typeof setTimeout> | undefined;
  /** Der erste Stand ist da: Die Karte ist eingeblendet und eingeflogen. */
  isShown: boolean;
  /** Was das Jelly am Stapel tun soll, sobald es angekommen ist (`stacks.ts`). */
  stackPlan: StackPlan | null;
  /** Der Knopf „Sendung ansehen“, solange die Jelly-News laufen. */
  news: NewsWatch;
  /**
   * Ein Klick hat eben vom Bild der Sendung zurück zur Karte geführt. Wird er ein Doppelklick,
   * zoomt die Karte nicht: Sein Punkt lag im Bild der News-Kamera.
   */
  leftNewsByClick: boolean;
  /**
   * So viele CSS-Pixel neben einem Jelly trifft der laufende Klick noch: mit dem Finger mehr als
   * mit der Maus (`reachOf` in `pointers.ts`).
   */
  reach: number;
}

/** Der Name eines Jellys vom letzten Lesen. */
export function findName(page: MapPage, playerId: number): string {
  return page.players.find((player) => player.id === playerId)?.name ?? TEXT_UNKNOWN_JELLY;
}

/** Gibt Ziel, Leuchten und das Ziel des Ausflugs an die Bühne. */
export function applyMarks(page: MapPage) {
  page.view?.setMarks({
    ownId: page.source.readOwn().id,
    targetId: page.targetId,
    highlight: page.highlight,
    destination: page.destination,
  });
}

/** Zeigt in der Leiste, wo das eigene Jelly ist. Steht es nicht in der Halle, fehlt der Zustand. */
export function showOwnPlace(page: MapPage) {
  const { id } = page.source.readOwn();
  const own = page.players.find((player) => player.id === id);
  page.dock.showOwn(
    own
      ? {
          color: own.color,
          targetName: page.targetId === null ? null : findName(page, page.targetId),
          isOnTrip: page.destination !== null,
        }
      : null,
  );
}

/** Übernimmt das Ziel für Markierung und Leiste. */
export function setTarget(page: MapPage, targetId: number | null) {
  page.targetId = targetId;
  applyMarks(page);
  showOwnPlace(page);
}

/**
 * Übernimmt Ziel und Ausflug aus dem eigenen Stand. Enden sie von selbst, meldet das der Server mit
 * `follow.changed` und `trip.changed`, und die Bühne liest neu.
 */
export function applyAway(page: MapPage, own: StagePlayer | undefined, trip: StagePoint | null) {
  page.destination = trip;
  setTarget(page, own?.follow?.player_id ?? null);
}

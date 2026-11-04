/**
 * Pet-Studio: Welche Regionen des Jellys anklickbar sind, was dort zur Wahl steht und wie Punkte
 * der 3D-Szene auf der Bühne landen.
 *
 * @module
 */

import type { JellyPalette } from "@jelly/scene/colors";

import type { IconName } from "../ui/Icon";
import type { Catalog, Me } from "./types";

import { PET_COLORS } from "./colors";
import { COSMETICS, isUnlocked, unlockLabel, type Cosmetic } from "./cosmetics";

/** Eine anklickbare Region. */
export type StudioRegionId = "kopf" | "gesicht" | "koerper" | "effekte";

/** Worauf die Kamera fährt, wenn eine Region offen ist. */
export type StudioFocus = "head" | "face" | "body" | "effects";

/** Eine Region des Jellys mit ihrem Blob. */
export interface StudioRegion {
  id: StudioRegionId;
  label: string;
  icon: IconName;
  /** Der Platz der Cosmetics, die hier zur Wahl stehen. Ohne Platz geht es um die Körperfarbe. */
  slot?: Cosmetic["slot"];
  focus: StudioFocus;
  /** In welche Richtung das Popover aus dem Blob wächst. */
  opens: "up" | "down" | "left" | "right";
}

/** Alle Regionen. Die erste bekommt beim Öffnen den Fokus. */
export const REGIONS: StudioRegion[] = [
  { id: "kopf", label: "Kopf", icon: "beanie", slot: "Kopf", focus: "head", opens: "up" },
  {
    id: "gesicht",
    label: "Gesicht",
    icon: "glasses",
    slot: "Gesicht",
    focus: "face",
    opens: "right",
  },
  {
    id: "effekte",
    label: "Effekte",
    icon: "spark",
    slot: "Effekte",
    focus: "effects",
    opens: "down",
  },
  { id: "koerper", label: "Körper", icon: "droplet", focus: "body", opens: "left" },
];

/** Ein Eintrag im Popover einer Region. */
export interface StudioItem {
  /** Cosmetic-ID oder Farbe. `null` heißt: nichts tragen. */
  id: string | null;
  name: string;
  /** Symbol des Eintrags. Farben zeigen stattdessen ein kleines Jelly in `swatch`. */
  icon: IconName | null;
  swatch?: JellyPalette;
  state: "equipped" | "unlocked" | "locked";
  /** Wie man den Eintrag freischaltet, leer wenn er schon frei ist. */
  note: string;
}

/** Zustand eines Cosmetics für `me`. */
function cosmeticState(item: Cosmetic, me: Me): StudioItem["state"] {
  if (me.cosmetic === item.id) return "equipped";
  return isUnlocked(item.id, me) ? "unlocked" : "locked";
}

/** „Nichts“ und die Cosmetics des Platzes. „Nichts“ gilt, solange hier nichts angelegt ist. */
function cosmeticRows(slot: Cosmetic["slot"], me: Me, catalog: Catalog): StudioItem[] {
  const parts = COSMETICS.filter((item) => item.slot === slot);
  const worn = parts.some((item) => item.id === me.cosmetic);
  return [
    { id: null, name: "Nichts", icon: "close", state: worn ? "unlocked" : "equipped", note: "" },
    ...parts.map((item) => {
      const state = cosmeticState(item, me);
      const note = state === "locked" ? unlockLabel(item.id, catalog) : "";
      return { id: item.id, name: item.name, icon: item.icon, state, note };
    }),
  ];
}

/** Die drei Körperfarben. Jede ist frei. */
function colorRows(me: Me): StudioItem[] {
  return Object.entries(PET_COLORS).map(([key, color]) => ({
    id: key,
    name: color.label,
    icon: null,
    swatch: color,
    state: me.color === key ? "equipped" : "unlocked",
    note: "",
  }));
}

/** Was im Popover der Region zur Wahl steht. */
export function regionItems(region: StudioRegion, me: Me, catalog: Catalog): StudioItem[] {
  return region.slot ? cosmeticRows(region.slot, me, catalog) : colorRows(me);
}

/** Die Region, in der gerade ein Cosmetic angelegt ist, falls überhaupt eins. */
export function equippedRegion(me: Me): StudioRegionId | null {
  const worn = COSMETICS.find((item) => item.id === me.cosmetic);
  if (!worn) return null;
  return REGIONS.find((region) => region.slot === worn.slot)?.id ?? null;
}

/** `value` auf den Bereich von `margin` bis `size - margin` begrenzt. */
const clampToStage = (value: number, size: number, margin: number) =>
  Math.min(size - margin, Math.max(margin, value));

/**
 * Rechnet einen Punkt aus den normierten Koordinaten der Kamera (`-1` bis `1`, `y` nach oben) in
 * Pixel auf der Canvas um (`y` nach unten). Der Rand hält Blobs auch bei nahem Zoom erreichbar.
 */
export function projectToStage(
  ndc: { x: number; y: number },
  size: { width: number; height: number },
  margin = 18,
) {
  return {
    x: clampToStage(((ndc.x + 1) / 2) * size.width, size.width, margin),
    y: clampToStage(((1 - ndc.y) / 2) * size.height, size.height, margin),
  };
}

/** Längster Name, den die App annimmt. Das Feld begrenzt die Eingabe genauso. */
export const NAME_MAX_LENGTH = 24;

/** Der Name, der gespeichert werden soll, oder `null`, wenn es nichts zu speichern gibt. */
export function nameToSave(draft: string, current: string) {
  const name = draft.trim();
  if (!name || name.length > NAME_MAX_LENGTH || name === current) return null;
  return name;
}

/** Ein Rechteck auf dem Bildschirm, wie es `getBoundingClientRect` liefert. */
type ScreenRect = Pick<DOMRect, "left" | "top" | "width" | "height">;

/**
 * Lage eines Elements in Pixeln auf der Canvas, als Mitte und halbe Größe.
 *
 * @param canvas - Rechteck der Canvas auf dem Bildschirm.
 * @param width - Breite der Canvas in ihren eigenen Pixeln. Weicht ab, wenn die Vorschau skaliert.
 */
export function shapeOnCanvas(rect: ScreenRect, canvas: ScreenRect, width: number) {
  const scale = width / canvas.width;
  return {
    x: (rect.left + rect.width / 2 - canvas.left) * scale,
    y: (rect.top + rect.height / 2 - canvas.top) * scale,
    halfWidth: (rect.width / 2) * scale,
    halfHeight: (rect.height / 2) * scale,
  };
}

/** Anteil der Einblendung, um den jede Fläche später startet als die davor. */
const GROWTH_STAGGER = 0.06;

/** Wie weit ein Tropfen beim Aufploppen über seine Größe hinausschießt. */
const GROWTH_OVERSHOOT = 1.7;

/**
 * Größe der Fläche Nummer `index` beim Ein- und Ausblenden: 0 bis 1, kurz vor dem Ziel etwas
 * darüber.
 *
 * @param presence - 0 = verschwunden, 1 = ganz da.
 */
export function shapeGrowth(presence: number, index: number) {
  const start = index * GROWTH_STAGGER;
  const left = Math.min(1, Math.max(0, (presence - start) / (1 - start))) - 1;
  return 1 + (GROWTH_OVERSHOOT + 1) * left ** 3 + GROWTH_OVERSHOOT * left ** 2;
}

/**
 * Die Bühne des Zauberladens in Zahlen: die Kamera, wo Zauberer, Kunde, Theke, Kerzen, Kugel und
 * Fenster in der Szene stehen, und wo sie auf der Bühne landen.
 *
 * Alles im DOM, das zur 3D-Szene passen muss, rechnet seine Lage hier aus: Theke, Kerzen, Fenster,
 * Runenkreis, Mondlicht, Sprechblase und die Ziele der Effekte. So steht im CSS keine Prozentzahl
 * der Szene von Hand. Ohne Three.js: Die Seite braucht die Zahlen, bevor die Szene geladen ist.
 *
 * Koordinaten in Szenen-Einheiten: x nach rechts, y nach oben, z zur Kamera hin. Ein Jelly ist vom
 * Boden bis zum Scheitel gut 2,3 Einheiten hoch.
 *
 * @module
 */

import type { CosmeticSlot, Equipped } from "./types";

import { COSMETICS } from "./cosmetics";

/** Ein Punkt der Szene. */
export type Vec3 = readonly [number, number, number];

/** Ein Punkt auf der Bühne, in Prozent ihrer Breite (`left`) und Höhe (`top`). */
export interface StagePoint {
  left: number;
  top: number;
}

/** Ein Rechteck auf der Bühne, alles in Prozent ihrer Breite und Höhe. */
export interface StageRect extends StagePoint {
  width: number;
  height: number;
}

/** Ein Rechteck parallel zum Bild, in Szenen-Einheiten. */
export interface WallRect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** Eine Kamera, die waagerecht nach −z blickt, ohne Drehung. */
export interface ShopView {
  /** Wo sie steht. */
  eye: Vec3;
  /** Senkrechter Bildwinkel in Grad. */
  fov: number;
  /** Breite durch Höhe der Bühne. */
  aspect: number;
}

/**
 * Die Kamera der Bühne. Aus 9,4 Einheiten sieht sie bei z 0 y von −1,5 bis 2,5 und x bis ±4,8: Füße
 * samt Boden davor, Hut und Jubelsprung. Bei 24° bleiben beide Jellies fast frontal, ihre Sticker
 * sind nur von vorn modelliert.
 */
export const SHOP_VIEW: ShopView = { eye: [0, 0.5, 9.4], fov: 24, aspect: 2.4 };

/** Wo der Zauberer steht: 0,12 tiefer als der Kunde, über seine Theke gebeugt. */
export const WIZARD_AT: Vec3 = [-2.3, -0.12, 0];

/** Wo das eigene Jelly zur Anprobe steht. */
export const OWN_AT: Vec3 = [2.3, 0, 0];

/** Der Boden, auf dem das eigene Jelly steht: die Unterkante seines Körpers. */
export const FLOOR_Y = -1.05;

/** Die Rückwand. */
export const WALL_Z = -1.9;

/** Oberkante der Holzvertäfelung an der Rückwand. */
export const WAINSCOT_Y = -0.3;

/**
 * Die Theke vor dem Zauberer, von links außerhalb des Bilds bis knapp über die Mitte. `topY` ist
 * die Oberkante der Platte, `slab` ihre Stärke, `back` und `front` ihre Tiefe. Die Front steht auf
 * dem Boden.
 */
export const COUNTER = {
  left: -5.1,
  right: 0.05,
  topY: -0.44,
  slab: 0.08,
  back: 0.55,
  front: 1.08,
} as const;

/** Die Messingschale auf der Theke, in der die Münzen landen: Mitte ihres Bodens und Radius. */
export const TRAY = { at: [-1.12, -0.44, 1] as Vec3, radius: 0.22 } as const;

/** Eine Kerze: wo ihr Fuß steht, ihr Radius und ihre Höhe bis zum Docht. */
export interface Candle {
  at: Vec3;
  radius: number;
  height: number;
}

/** Die dicke Kerze am rechten Ende der Theke. */
export const CANDLE: Candle = { at: [-0.12, -0.44, 0.85], radius: 0.07, height: 0.36 };

/** Die schlanke Kerze auf ihrem Leuchter am linken Ende der Theke, samt Leuchter. */
export const TAPER: Candle = { at: [-3.75, -0.44, 0.8], radius: 0.06, height: 0.62 };

/** Wie hoch die Mitte einer Flamme über dem Docht steht. Dort sitzt auch ihr Licht. */
export const FLAME_LIFT = 0.08;

/** Die Kristallkugel: Mitte und Radius. Ihr Fuß steht auf der Platte der Theke. */
export const ORB = { at: [-0.62, -0.12, 0.75] as Vec3, radius: 0.21 } as const;

/** Wo Cosmetics am eigenen Jelly sitzen, in seinen Koordinaten. Ziel der Effekte einer Anprobe. */
export const SLOTS: Readonly<Record<CosmeticSlot, Vec3>> = {
  head: [0, 1.18, 0.35],
  face: [0, 0.68, 0.72],
  body: [0, -0.4, 0.75],
  hands: [0, -0.4, 0.95],
  aura: [0, 0.2, 0],
};

/** Der Mund eines Jellys in seinen Koordinaten: 0,165 unter der Kopfmitte auf der Haut (`face.ts`). */
export const MOUTH: Vec3 = [0, 0.495, 0.734];

/** Das Fenster in der Rückwand, ohne Rahmen. Oben schließt es ein Halbkreis über die ganze Breite. */
export const WINDOW: WallRect = { left: -0.35, right: 1.05, bottom: -0.25, top: 1.45 };

/** Wo der Bogen des Fensters ansetzt. Dort liegt auch der Kämpfer, der Querbalken des Kreuzes. */
export const WINDOW_SPRING = WINDOW.top - (WINDOW.right - WINDOW.left) / 2;

/** Wo der Mond im Fenster steht. Er ist weit weg, darum zählt nur, wo er im Fenster erscheint. */
export const MOON: Vec3 = [0.1, 1.05, WALL_Z];

/** In diese Richtung fällt das Mondlicht durchs Fenster: nach unten, nach vorn und nach rechts. */
export const MOON_RAY: Vec3 = [1.18, -1, 1.145];

/** Der Runenkreis im Boden unter dem eigenen Jelly. */
export const RUNE_CIRCLE = { at: [OWN_AT[0], FLOOR_Y, OWN_AT[2]] as Vec3, radius: 1.2 } as const;

/** Wie der Runenkreis leuchtet: in Ruhe, bei der Anprobe, beim Kaufzauber, beim Anlegen. */
export const RUNE_STATES = ["ruhe", "anprobe", "zauber", "anlegen"] as const;

/** Ein Zustand des Runenkreises. */
export type RuneState = (typeof RUNE_STATES)[number];

/** Halbe sichtbare Höhe je Einheit Abstand zur Kamera: tan(fov / 2). */
function halfSpan(view: ShopView) {
  return Math.tan((view.fov * Math.PI) / 360);
}

/**
 * Wo ein Punkt der Szene auf der Bühne landet.
 *
 * @param aspect - Breite durch Höhe der Bühne.
 * @param view - Eine andere Kamera, etwa zum Vergleich mit der ersten Fassung des Ladens.
 */
export function shopProject(point: Vec3, aspect = SHOP_VIEW.aspect, view = SHOP_VIEW): StagePoint {
  const [x, y, z] = point;
  const [eyeX, eyeY, eyeZ] = view.eye;
  const halfHeight = halfSpan(view) * (eyeZ - z);
  return {
    left: 50 + (50 * (x - eyeX)) / (aspect * halfHeight),
    top: 50 - (50 * (y - eyeY)) / halfHeight,
  };
}

/** Pixel je Einheit bei z 0 auf einer Bühne dieser Höhe in Pixeln. Im CSS heißt der Wert `--u`. */
export function unitPx(stageHeight: number, view = SHOP_VIEW) {
  return stageHeight / (2 * halfSpan(view) * view.eye[2]);
}

/** Um wie viel größer etwas in der Tiefe z erscheint als bei z 0. */
export function depthScale(z: number, view = SHOP_VIEW) {
  return view.eye[2] / (view.eye[2] - z);
}

/** Ein Punkt in den Koordinaten des Zauberers, etwa für Teile, die an ihm hängen. */
export function toWizardLocal(point: Vec3): Vec3 {
  return [point[0] - WIZARD_AT[0], point[1] - WIZARD_AT[1], point[2] - WIZARD_AT[2]];
}

/** Ein Punkt, um `by` verschoben. */
function shifted(point: Vec3, by: Vec3): Vec3 {
  return [point[0] + by[0], point[1] + by[1], point[2] + by[2]];
}

/** Wo die Flamme einer Kerze leuchtet. */
export function flameOf({ at, height }: Candle): Vec3 {
  return shifted(at, [0, height + FLAME_LIFT, 0]);
}

/** Die Punkte der Bühne, an denen DOM, Effekte und Klang andocken. */
export type StageSpotName =
  | "wizardMouth"
  | "wizardCentre"
  | "wizardHat"
  | "orb"
  | "tray"
  | "candleFlame"
  | "taperFlame"
  | "feet"
  | "customerCentre"
  | "slotHead"
  | "slotFace"
  | "slotBody"
  | "slotHands"
  | "slotAura"
  | "counterBackTop"
  | "counterRight"
  | "floorLine";

/** Wo die benannten Punkte in der Szene liegen. */
export const STAGE_POINTS: Readonly<Record<StageSpotName, Vec3>> = {
  wizardMouth: shifted(WIZARD_AT, MOUTH),
  wizardCentre: WIZARD_AT,
  // Die Mitte des Huts über dem Hutband, wo er beim Griff an die Krempe funkelt.
  wizardHat: shifted(WIZARD_AT, [0.1, 1.45, 0.3]),
  orb: ORB.at,
  tray: TRAY.at,
  candleFlame: flameOf(CANDLE),
  taperFlame: flameOf(TAPER),
  feet: RUNE_CIRCLE.at,
  customerCentre: OWN_AT,
  slotHead: shifted(OWN_AT, SLOTS.head),
  slotFace: shifted(OWN_AT, SLOTS.face),
  slotBody: shifted(OWN_AT, SLOTS.body),
  slotHands: shifted(OWN_AT, SLOTS.hands),
  slotAura: shifted(OWN_AT, SLOTS.aura),
  counterBackTop: [COUNTER.right, COUNTER.topY, COUNTER.back],
  counterRight: [COUNTER.right, COUNTER.topY, COUNTER.front],
  floorLine: [0, FLOOR_Y, WALL_Z],
};

/** Wo die benannten Punkte auf der Bühne landen. */
export const STAGE_SPOTS = Object.fromEntries(
  Object.entries(STAGE_POINTS).map(([name, point]) => [name, shopProject(point)]),
) as Readonly<Record<StageSpotName, StagePoint>>;

/**
 * Bereiche der Bühne mit fester Aufgabe, in Prozent: Die Szene hält die Sprechblase dunkel und
 * frei, über dem Kunden bleibt Platz für Sprung und Krone, oben links hängt das Schild
 * „Geschlossen“, und über dem Zauberer liegt die Fläche zum Anstupsen.
 */
export const STAGE_ZONES = {
  speech: { left: 32, right: 66, top: 4, bottom: 28 },
  headroom: { left: 66, right: 82, top: 10, bottom: 30 },
  closedSign: { left: 2.5, right: 16, top: 0, bottom: 16 },
  poke: { left: 16, right: 36, top: 12, bottom: 72 },
} as const;

/** Die Sprechblase des Zauberers: links oben in Prozent, Breite in Prozent mit Grenzen in Pixeln. */
export const BUBBLE = { left: 35, top: 5, width: 31, minPx: 150, maxPx: 340 } as const;

/** Wo ein Rechteck parallel zum Bild landet, das in der Tiefe z steht. */
export function projectRect(rect: WallRect, z: number): StageRect {
  const corner = shopProject([rect.left, rect.top, z]);
  const opposite = shopProject([rect.right, rect.bottom, z]);
  return { ...corner, width: opposite.left - corner.left, height: opposite.top - corner.top };
}

/**
 * Der Umriss der Theke auf der Bühne: Hinterkante der Platte, ihr rechtes Ende vorn und hinten,
 * dann der Fuß der Front. Ihr linkes Ende liegt außerhalb des Bilds.
 */
export function counterOutline(): StagePoint[] {
  const { left, right, topY, back, front } = COUNTER;
  const corners: Vec3[] = [
    [left, topY, back],
    [right, topY, back],
    [right, topY, front],
    [right, FLOOR_Y, front],
    [left, FLOOR_Y, front],
  ];
  return corners.map((corner) => shopProject(corner));
}

/**
 * Der Umriss der Scheiben in der Wand: die beiden unteren Ecken, dann der Bogen von rechts nach
 * links.
 *
 * @param steps - In wie viele Stücke der Bogen zerfällt.
 */
export function windowOutline(steps = 12): Vec3[] {
  const { left, right, bottom } = WINDOW;
  const radius = (right - left) / 2;
  const arch = Array.from({ length: steps + 1 }, (_, index): Vec3 => {
    const angle = (Math.PI * index) / steps;
    return [
      left + radius * (1 + Math.cos(angle)),
      WINDOW_SPRING + radius * Math.sin(angle),
      WALL_Z,
    ];
  });
  return [[left, bottom, WALL_Z], [right, bottom, WALL_Z], ...arch];
}

/** Wo der Strahl des Mondlichts durch diesen Punkt den Boden trifft. */
export function moonOnFloor(point: Vec3): Vec3 {
  const steps = (point[1] - FLOOR_Y) / -MOON_RAY[1];
  return [point[0] + steps * MOON_RAY[0], FLOOR_Y, point[2] + steps * MOON_RAY[2]];
}

/** Der Mondfleck auf dem Boden: das Fenster, entlang des Mondlichts auf die Dielen geworfen. */
export function moonPatch(): StagePoint[] {
  return windowOutline().map((point) => shopProject(moonOnFloor(point)));
}

/** Kreuzprodukt von `o → a` und `o → b`. Positiv, wenn es auf der Bühne im Uhrzeigersinn abbiegt. */
function turn(o: StagePoint, a: StagePoint, b: StagePoint) {
  return (a.left - o.left) * (b.top - o.top) - (a.top - o.top) * (b.left - o.left);
}

/** Eine Hälfte der konvexen Hülle über sortierte Punkte. Der letzte Punkt beginnt die andere Hälfte. */
function hullChain(points: StagePoint[]) {
  const chain: StagePoint[] = [];
  for (const point of points) {
    while (
      chain.length >= 2 &&
      turn(chain[chain.length - 2], chain[chain.length - 1], point) <= 0
    ) {
      chain.pop();
    }
    chain.push(point);
  }
  chain.pop();
  return chain;
}

/** Die konvexe Hülle von Punkten der Bühne. */
export function convexHull(points: StagePoint[]): StagePoint[] {
  const sorted = [...points].sort((a, b) => a.left - b.left || a.top - b.top);
  return [...hullChain(sorted), ...hullChain([...sorted].reverse())];
}

/** Der Schacht des Mondlichts vom Fenster bis zum Fleck auf dem Boden. */
export function moonBeam(): StagePoint[] {
  const panes = windowOutline().map((point) => shopProject(point));
  return convexHull([...panes, ...moonPatch()]);
}

/** Eine Zahl als Prozent fürs CSS, auf zwei Stellen gerundet. */
export function cssPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

/** Punkte der Bühne als `points` eines SVG, dessen `viewBox` die Bühne in Prozent abbildet. */
export function svgPoints(points: StagePoint[]) {
  return points.map(({ left, top }) => `${left.toFixed(2)},${top.toFixed(2)}`).join(" ");
}

/** Szenen-Einheiten in hundertstel, so zeichnen SVGs der Szene. Auf eine Stelle gerundet. */
export function sceneUnits(value: number) {
  return Math.round(value * 1000) / 10;
}

/**
 * `viewBox` für ein SVG, das ein Rechteck der Szene in hundertstel Einheiten zeichnet, y nach
 * unten.
 */
export function sceneViewBox({ left, right, bottom, top }: WallRect) {
  const size = `${sceneUnits(right - left)} ${sceneUnits(top - bottom)}`;
  return `${sceneUnits(left)} ${sceneUnits(-top)} ${size}`;
}

/** Wo ein Rechteck in der Tiefe z auf der Bühne liegt, als Lage fürs CSS. */
export function rectStyle(rect: WallRect, z: number) {
  const { left, top, width, height } = projectRect(rect, z);
  return {
    left: cssPercent(left),
    top: cssPercent(top),
    width: cssPercent(width),
    height: cssPercent(height),
  };
}

/** Punkte der Bühne als `polygon()` für `clip-path`. */
export function cssPolygon(points: StagePoint[]) {
  const corners = points.map(({ left, top }) => `${cssPercent(left)} ${cssPercent(top)}`);
  return `polygon(${corners.join(", ")})`;
}

/** Anzeigename eines Cosmetics. Ohne Eintrag steht sein Schlüssel da. */
function cosmeticName(key: string) {
  return COSMETICS.find((item) => item.id === key)?.name ?? key;
}

/**
 * Was das Schildchen „Zur Probe“ sagt, solange das Jelly etwas anderes zeigt, als es trägt, sonst
 * `null`. Ersetzt die Probe ein getragenes Teil, nennt es dieses. Hat das Teil zur Probe noch kein
 * Modell, sagt es „Ohne Abbild“: Am Jelly erscheint dann nichts.
 *
 * @param shown - Was das Jelly zeigt, samt dem Teil zur Probe.
 * @param worn - Was es wirklich trägt.
 * @param modelKeys - Die Cosmetics mit Modell. Ohne Angabe zählt jedes als sichtbar.
 */
export function tryOnLabel(
  shown: Equipped,
  worn: Equipped,
  modelKeys: readonly string[] | null = null,
): string | null {
  const slots = [...new Set([...Object.keys(shown), ...Object.keys(worn)])];
  const slot = slots.find((key) => shown[key]?.key !== worn[key]?.key);
  if (slot === undefined) return null;
  const trying = shown[slot]?.key;
  const unseen = trying !== undefined && modelKeys !== null && !modelKeys.includes(trying);
  const title = unseen ? "Ohne Abbild" : "Zur Probe";
  const replaced = worn[slot]?.key;
  return replaced && trying ? `${title} · statt ${cosmeticName(replaced)}` : title;
}

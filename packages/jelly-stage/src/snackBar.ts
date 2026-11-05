/**
 * The snack bar: a wooden counter with an LED edge and a marquee sign with running lights, a
 * drinks fridge at its end and snacks on top. Visitors wait behind it and peek over the snacks.
 *
 * @module
 */

import { JELLY_COLORS } from "@jelly/scene/colors";
import { BoxGeometry, CylinderGeometry, Group, PlaneGeometry } from "three";

import type { FloorRect } from "./world.ts";

import { createBulbs } from "./bulbs.ts";
import { createCactus } from "./plants.ts";
import {
  CHROME_MATERIAL,
  createBox,
  createGlow,
  createMatte,
  createShiny,
  createZoneShadow,
  FACE_LIFT,
  findMiddle,
  LED_MATERIAL,
  mergeParts,
  placeMesh,
  type PropPart,
} from "./props.ts";
import { createSignMaterial } from "./signs.ts";
import { listSnacks } from "./snacks.ts";
import { COUNTER_HEIGHT } from "./zones.ts";

const COUNTER = { top: 0.08, overhang: 0.08, inset: 0.03, plinth: 0.07 };
const SLAT = { width: 0.26, gap: 0.025, depth: 0.04 };
const LED_EDGE = { height: 0.04, depth: 0.04, below: 0.03 };
const MARQUEE = { width: 2, height: 0.55, share: 0.62, bottom: 0.25, frame: 0.05, depth: 0.05 };
const MARQUEE_BULBS = { radius: 0.034, gap: 0.12, lift: 0.04 };
/** Counters at least this long get a drinks fridge at their right end. */
const FRIDGE_FROM = 3;
const FRIDGE = { width: 0.95, height: 1.85, rounding: 0.06 };
const WINDOW = { inset: 0.11, bottom: 0.34, top: 0.3 };
const HEADER = { height: 0.12, inset: 0.08, depth: 0.03 };
const HANDLE = { width: 0.04, height: 0.5, bottom: 0.72, inset: 0.06 };
const SHELVES = 3;
const BOTTLES_PER_SHELF = 4;
/** A shelf sits `lift` of a shelf height above the bottom of its compartment. */
const SHELF = { lift: 0.12, thickness: 0.015, depth: 0.02 };
/** A bottle narrows to `shoulder` of its radius where the neck starts. */
const BOTTLE = { radius: 0.05, height: 0.17, neck: 0.022, neckHeight: 0.08, shoulder: 0.8 };
const SEGMENTS = { bottle: 12, neck: 10 };
const SNACK_MARGIN = 0.08;

const CORE_MATERIAL = createMatte("#a7774f");
const SLAT_MATERIALS = [createMatte("#e4b17d"), createMatte("#d39c66")];
const TOP_MATERIAL = createMatte("#fff6e8");
const MARQUEE_FRAME_MATERIAL = createMatte("#b9452f");
const FRIDGE_MATERIAL = createMatte("#eef3f8");
const GLASS_MATERIAL = createGlow("#d9f4ff");
const SHELF_MATERIAL = createGlow("#ffffff");
const HEADER_MATERIAL = createGlow(JELLY_COLORS.mint.glow);
const BOTTLE_COLORS = ["#f0a63a", JELLY_COLORS.mint.glow, "#ff7a6b", JELLY_COLORS.lilac.glow];
const BOTTLE_MATERIALS = BOTTLE_COLORS.map((color) => createShiny(color, "#ffffff"));
const MARQUEE_MATERIAL = createSignMaterial({
  text: "SNACKS",
  width: MARQUEE.width,
  height: MARQUEE.height,
  board: "#ed7448",
  ink: "#fff7ea",
  weight: 900,
});

/** Builds the counter: a dark core, wooden slats in front, a light top and an LED edge. */
function createCounter(rect: FloorRect): Group {
  const counter = new Group();
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const middle = findMiddle(rect);
  const bodyHeight = COUNTER_HEIGHT - COUNTER.top;
  const core = {
    width: width - 2 * COUNTER.inset,
    height: bodyHeight,
    depth: depth - 2 * COUNTER.inset,
  };
  const top = {
    width: width + 2 * COUNTER.overhang,
    height: COUNTER.top,
    depth: depth + 2 * COUNTER.overhang,
    rounding: COUNTER.top / 2,
  };
  const edge = { width, height: LED_EDGE.height, depth: LED_EDGE.depth };
  const edgeSpot = { x: middle.x, z: rect.maxZ + COUNTER.overhang - LED_EDGE.depth };
  counter.add(
    createBox(core, CORE_MATERIAL, middle, 0),
    createBox(top, TOP_MATERIAL, middle, bodyHeight),
    createBox(edge, LED_MATERIAL, edgeSpot, bodyHeight - LED_EDGE.below),
  );
  const count = Math.max(1, Math.round(width / SLAT.width));
  const slatHeight = bodyHeight - COUNTER.plinth - LED_EDGE.below;
  const slats: PropPart[][] = [[], []];
  for (let index = 0; index < count; index++) {
    slats[index % 2]?.push({
      geometry: new BoxGeometry(width / count - SLAT.gap, slatHeight, SLAT.depth),
      at: {
        x: rect.minX + ((index + 0.5) * width) / count,
        y: COUNTER.plinth + slatHeight / 2,
        z: rect.maxZ - SLAT.depth / 2,
      },
    });
  }
  slats.forEach((parts, index) =>
    counter.add(mergeParts(parts, SLAT_MATERIALS[index] ?? CORE_MATERIAL)),
  );
  return counter;
}

/** Builds the marquee sign on the front of the counter, framed by running lights. */
function createMarquee(rect: FloorRect): Group {
  const marquee = new Group();
  const middle = findMiddle(rect);
  const scale = Math.min(1, ((rect.maxX - rect.minX) * MARQUEE.share) / MARQUEE.width);
  const width = MARQUEE.width * scale;
  const height = MARQUEE.height * scale;
  const frame = {
    width: width + 2 * MARQUEE.frame,
    height: height + 2 * MARQUEE.frame,
    depth: MARQUEE.depth,
  };
  const front = rect.maxZ + MARQUEE.depth;
  marquee.add(
    createBox(
      frame,
      MARQUEE_FRAME_MATERIAL,
      { x: middle.x, z: rect.maxZ + MARQUEE.depth / 2 },
      MARQUEE.bottom - MARQUEE.frame,
    ),
  );
  const face = placeMesh(new PlaneGeometry(width, height), MARQUEE_MATERIAL, {
    x: middle.x,
    y: MARQUEE.bottom + height / 2,
    z: front + FACE_LIFT,
  });
  marquee.add(face);
  const corners = {
    left: middle.x - width / 2 - MARQUEE.frame / 2,
    right: middle.x + width / 2 + MARQUEE.frame / 2,
    bottom: MARQUEE.bottom - MARQUEE.frame / 2,
    top: MARQUEE.bottom + height + MARQUEE.frame / 2,
  };
  const points = listFramePoints(corners).map((point) => ({
    ...point,
    z: front + MARQUEE_BULBS.lift / 2,
  }));
  const colors = ["#fff1c9", JELLY_COLORS.peach.glow];
  marquee.add(createBulbs(points, { radius: MARQUEE_BULBS.radius, colors, pattern: "chase" }));
  return marquee;
}

/** Returns points around a rectangle, clockwise from the bottom left, one bulb gap apart. */
function listFramePoints(corners: { left: number; right: number; bottom: number; top: number }) {
  const path = [
    [corners.left, corners.bottom],
    [corners.left, corners.top],
    [corners.right, corners.top],
    [corners.right, corners.bottom],
    [corners.left, corners.bottom],
  ];
  return path.slice(1).flatMap(([toX = 0, toY = 0], index) => {
    const [fromX = 0, fromY = 0] = path[index] ?? [];
    const count = Math.max(1, Math.round(Math.hypot(toX - fromX, toY - fromY) / MARQUEE_BULBS.gap));
    return Array.from({ length: count }, (_, step) => ({
      x: fromX + ((toX - fromX) * step) / count,
      y: fromY + ((toY - fromY) * step) / count,
    }));
  });
}

/** Builds the drinks fridge: a white cabinet with a lit window full of bottles. */
function createFridge(rect: FloorRect): Group {
  const fridge = new Group();
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const middle = findMiddle(rect);
  const body = { width, height: FRIDGE.height, depth, rounding: FRIDGE.rounding };
  const windowWidth = width - 2 * WINDOW.inset;
  const windowHeight = FRIDGE.height - WINDOW.bottom - WINDOW.top;
  const glass = placeMesh(new PlaneGeometry(windowWidth, windowHeight), GLASS_MATERIAL, {
    x: middle.x,
    y: WINDOW.bottom + windowHeight / 2,
    z: rect.maxZ + FACE_LIFT,
  });
  const header = { width: width - 2 * HEADER.inset, height: HEADER.height, depth: HEADER.depth };
  const headerBottom = FRIDGE.height - WINDOW.top / 2 - HEADER.height / 2;
  const handle = { width: HANDLE.width, height: HANDLE.height, depth: HANDLE.width };
  const handleSpot = { x: rect.minX + HANDLE.inset, z: rect.maxZ + HANDLE.width };
  fridge.add(
    createBox(body, FRIDGE_MATERIAL, middle, 0),
    glass,
    createBox(header, HEADER_MATERIAL, { x: middle.x, z: rect.maxZ }, headerBottom),
    createBox(handle, CHROME_MATERIAL, handleSpot, HANDLE.bottom),
    ...createBottles(rect, windowWidth, windowHeight),
    createCactus(middle, FRIDGE.height),
  );
  return fridge;
}

/** Builds the shelves of the fridge and the bottles on them, one mesh per bottle color. */
function createBottles(rect: FloorRect, windowWidth: number, windowHeight: number) {
  const middle = findMiddle(rect);
  const bottles: PropPart[][] = BOTTLE_MATERIALS.map(() => []);
  const shelves: PropPart[] = [];
  const z = rect.maxZ + BOTTLE.radius;
  for (let shelf = 0; shelf < SHELVES; shelf++) {
    const floor = WINDOW.bottom + ((shelf + SHELF.lift) * windowHeight) / SHELVES;
    shelves.push({
      geometry: new BoxGeometry(windowWidth, SHELF.thickness, SHELF.depth),
      at: { x: middle.x, y: floor, z: rect.maxZ + SHELF.depth / 2 },
    });
    for (let index = 0; index < BOTTLES_PER_SHELF; index++) {
      const x = middle.x - windowWidth / 2 + ((index + 0.5) * windowWidth) / BOTTLES_PER_SHELF;
      const parts = bottles[(index + shelf) % bottles.length];
      parts?.push(
        {
          geometry: new CylinderGeometry(
            BOTTLE.radius,
            BOTTLE.radius,
            BOTTLE.height,
            SEGMENTS.bottle,
          ),
          at: { x, y: floor + BOTTLE.height / 2, z },
        },
        {
          geometry: new CylinderGeometry(
            BOTTLE.neck,
            BOTTLE.radius * BOTTLE.shoulder,
            BOTTLE.neckHeight,
            SEGMENTS.neck,
          ),
          at: { x, y: floor + BOTTLE.height + BOTTLE.neckHeight / 2, z },
        },
      );
    }
  }
  return [
    mergeParts(shelves, SHELF_MATERIAL),
    ...bottles.map((parts, index) => mergeParts(parts, BOTTLE_MATERIALS[index] ?? SHELF_MATERIAL)),
  ];
}

/** Puts the snacks on the counter, evenly spread. Snacks that do not fit stay away. */
function createSnacks(rect: FloorRect): Group {
  const snacks = new Group();
  const items = listSnacks();
  const length = rect.maxX - rect.minX - 2 * SNACK_MARGIN;
  const measure = () => items.reduce((sum, item) => sum + item.width, 0);
  while (items.length > 0 && measure() > length) items.pop();
  const gap = (length - measure()) / (items.length + 1);
  const z = (rect.minZ + rect.maxZ) / 2;
  let x = rect.minX + SNACK_MARGIN + gap;
  for (const item of items) {
    snacks.add(item.build({ x: x + item.width / 2, z }, COUNTER_HEIGHT));
    x += item.width + gap;
  }
  return snacks;
}

/** Builds a snack bar. */
export function createSnackBar(rect: FloorRect): Group {
  const bar = new Group();
  const hasFridge = rect.maxX - rect.minX >= FRIDGE_FROM;
  const counter = hasFridge ? { ...rect, maxX: rect.maxX - FRIDGE.width } : rect;
  bar.add(
    createCounter(counter),
    createMarquee(counter),
    createSnacks(counter),
    createZoneShadow(rect),
  );
  if (hasFridge) bar.add(createFridge({ ...rect, minX: counter.maxX }));
  return bar;
}

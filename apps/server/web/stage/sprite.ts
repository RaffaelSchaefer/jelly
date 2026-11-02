/**
 * Draws jellies once into small images, so a frame with 70 jellies only copies images. The shapes
 * come from `apps/client/public/pet.svg`, the colors from `apps/client/src/pet/colors.ts`.
 *
 * @module
 */

/** All shapes use the 256 by 256 grid of the app icon. */
const SPRITE_GRID = 256;
/** Height of the lowest body point in the grid. Jellies stand on this line. */
export const SPRITE_FEET = 222;
const SPRITE_PIXELS = 256;
const OUTLINE_WIDTH = 7;
const MOUTH_WIDTH = 4;

interface PetColor {
  body: string;
  glow: string;
  outline: string;
  ink: string;
}

const PET_COLORS: Record<string, PetColor> = {
  mint: { body: "#2059ed", glow: "#23f5dc", outline: "#16248a", ink: "#0b1550" },
  lilac: { body: "#8045df", glow: "#f1a5f3", outline: "#45188a", ink: "#2a0f52" },
  peach: { body: "#ed7448", glow: "#ffdc8a", outline: "#8a3216", ink: "#4f1c0b" },
};
const FALLBACK_COLOR = "mint";

const BODY_SHAPES = [
  "M128 132c-42 0-66 26-66 62v8c0 12 9 20 22 20h88c13 0 22-8 22-20v-8c0-36-24-62-66-62Z",
  "M44 161a15 15 0 1 0 .01 0Z",
  "M212 161a15 15 0 1 0 .01 0Z",
  "M128 40a52 52 0 1 0 .01 0Z",
];
const EYES_SHAPE = "M110 83a6 9 0 1 0 .01 0Z M146 83a6 9 0 1 0 .01 0Z";
const EYE_SHINE_SHAPE = "M108 87a2.2 2.2 0 1 0 .01 0Z M144 87a2.2 2.2 0 1 0 .01 0Z";
const MOUTH_SHAPE = "M120 110q8 7 16 0";
const SHINE_SHAPES = ["M128 48a30 14 0 1 0 .01 0Z", "M128 140a40 10 0 1 0 .01 0Z"];
const SHINE_COLOR = "rgba(255, 255, 255, 0.4)";
const EYE_SHINE_COLOR = "#ffffff";

interface CosmeticShape {
  path: string;
  fill?: string;
  stroke?: string;
}

/** Simple stand-ins until there is real art. Keys match `ListCosmetics` of the server. */
const COSMETIC_SHAPES: Record<string, CosmeticShape[]> = {
  headset: [
    { path: "M76 92a52 52 0 0 1 104 0", stroke: "#20262c" },
    { path: "M64 80h16v30H64Z M176 80h16v30h-16Z", fill: "#e5484d" },
  ],
  beanie: [
    { path: "M76 76a52 52 0 0 1 104 0Z", fill: "#d9443f" },
    { path: "M70 66h116v16H70Z", fill: "#f1f1f1" },
    { path: "M128 10a11 11 0 1 0 .01 0Z", fill: "#f1f1f1" },
  ],
  "party-hat": [
    { path: "M128 0 92 54h72Z", fill: "#f5c542" },
    { path: "M128 0a7 7 0 1 0 .01 0Z", fill: "#e5484d" },
  ],
  "pixel-glasses": [
    { path: "M94 80h28v20H94Z M134 80h28v20h-28Z M122 84h12v6h-12Z", fill: "#111111" },
  ],
  hood: [{ path: "M66 96a62 62 0 0 1 124 0v30H66Z M128 54a40 40 0 1 0 .01 0Z", fill: "#59636e" }],
  crown: [{ path: "M88 52 82 14l24 18 22-28 22 28 24-18-6 38Z", fill: "#f5c542" }],
};

/** Draws a cosmetic above the face. */
function paintCosmetic(context: CanvasRenderingContext2D, cosmetic: string | null): void {
  for (const shape of COSMETIC_SHAPES[cosmetic ?? ""] ?? []) {
    const path = new Path2D(shape.path);
    if (shape.fill) {
      context.fillStyle = shape.fill;
      // The hole in the hood needs this rule, all other shapes do not overlap themselves.
      context.fill(path, "evenodd");
    }
    if (shape.stroke) {
      context.strokeStyle = shape.stroke;
      context.lineWidth = OUTLINE_WIDTH;
      context.stroke(path);
    }
  }
}

/** Draws body and face. */
function paintJelly(context: CanvasRenderingContext2D, color: PetColor): void {
  const gradient = context.createLinearGradient(0, 0, 0, SPRITE_GRID);
  gradient.addColorStop(0, color.body);
  gradient.addColorStop(1, color.glow);
  context.fillStyle = gradient;
  context.strokeStyle = color.outline;
  context.lineWidth = OUTLINE_WIDTH;
  for (const shape of BODY_SHAPES) {
    const path = new Path2D(shape);
    context.stroke(path);
    context.fill(path);
  }
  context.fillStyle = SHINE_COLOR;
  for (const shape of SHINE_SHAPES) {
    context.fill(new Path2D(shape));
  }
  context.fillStyle = color.ink;
  context.fill(new Path2D(EYES_SHAPE));
  context.fillStyle = EYE_SHINE_COLOR;
  context.fill(new Path2D(EYE_SHINE_SHAPE));
  context.strokeStyle = color.ink;
  context.lineWidth = MOUTH_WIDTH;
  context.lineCap = "round";
  context.stroke(new Path2D(MOUTH_SHAPE));
}

/** Returns images per color and cosmetic, each painted once. */
export function createSpriteCache(): (color: string, cosmetic: string | null) => CanvasImageSource {
  const sprites = new Map<string, HTMLCanvasElement>();
  return (color, cosmetic) => {
    const cacheKey = `${color}/${cosmetic}`;
    const known = sprites.get(cacheKey);
    if (known) {
      return known;
    }
    const canvas = document.createElement("canvas");
    canvas.width = SPRITE_PIXELS;
    canvas.height = SPRITE_PIXELS;
    const context = canvas.getContext("2d");
    if (context) {
      context.scale(SPRITE_PIXELS / SPRITE_GRID, SPRITE_PIXELS / SPRITE_GRID);
      paintJelly(context, PET_COLORS[color] ?? PET_COLORS[FALLBACK_COLOR]!);
      paintCosmetic(context, cosmetic);
    }
    sprites.set(cacheKey, canvas);
    return canvas;
  };
}

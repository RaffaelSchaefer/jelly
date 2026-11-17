/**
 * Die Regale an der Rückwand, als SVG mit Tuschelinie: hinter dem Zauberer ein Brett mit Tränken
 * und Büchern, hinter dem Kunden ein Bücherschrank mit Schubladen und Globus.
 *
 * Gezeichnet in hundertstel Szenen-Einheiten (y nach unten), gelegt mit der Kamera aus
 * `pet/shopStage.ts`. Holz und Bücher sind dunkler als die Jellies, damit der Raum zurücktritt. Nur
 * die Tränke leuchten satt. Fenster, Sprechblase und die Ecke oben rechts bleiben frei.
 *
 * @module
 */

import { memo } from "react";

import { rectStyle, sceneViewBox, type WallRect } from "../pet/shopStage";

/** Wie weit die Regale vor der Wand stehen. */
const SHELF_Z = -1.75;

/** Das Tränkeregal hinter dem Zauberer und der Bücherschrank hinter dem Kunden. */
const POTION_SHELF: WallRect = { left: -5.2, right: -1, bottom: 0, top: 1.85 };
const BOOKCASE: WallRect = { left: 1.4, right: 5.32, bottom: -1.05, top: 1.52 };

/** Ein Buch: links, Breite, Höhe, Farbe und Neigung in Grad, alles in hundertstel Einheiten. */
type BookSpec = readonly [x: number, width: number, height: number, color: string, tilt?: number];

/** Ein Trank: Form, Mitte, Größe und Farbe der Flüssigkeit. */
interface Potion {
  kind: "flask" | "bottle" | "cone" | "vial" | "jar";
  x: number;
  size: number;
  color: string;
}

/** Ein Buch auf einem Brett, dessen Oberkante bei `base` liegt. */
function Book({ spec, base }: { spec: BookSpec; base: number }) {
  const [x, width, height, color, tilt = 0] = spec;
  const pivot = tilt < 0 ? x : x + width;
  return (
    <g transform={tilt ? `rotate(${tilt} ${pivot} ${base})` : undefined}>
      <rect
        className="prop-ink"
        x={x}
        y={base - height}
        width={width}
        height={height}
        fill={color}
      />
      <rect x={x} y={base - height * 0.84} width={width} height="2.4" className="prop-band" />
      <rect x={x} y={base - height * 0.22} width={width} height="2" className="prop-band" />
    </g>
  );
}

/** Der Umriss eines Glases, unten in der Mitte bei (0, 0). */
function glassPath({ kind, size: s }: Potion) {
  switch (kind) {
    case "flask":
      return `M${-0.3 * s} ${-1.95 * s}V${-2.5 * s}H${0.3 * s}V${-1.95 * s}A${s} ${s} 0 1 1 ${-0.3 * s} ${-1.95 * s}Z`;
    case "bottle":
      return `M${-0.5 * s} 0V${-1.7 * s}Q${-0.5 * s} ${-2.1 * s} ${-0.2 * s} ${-2.2 * s}V${-2.7 * s}H${0.2 * s}V${-2.2 * s}Q${0.5 * s} ${-2.1 * s} ${0.5 * s} ${-1.7 * s}V0Z`;
    case "cone":
      return `M${-0.75 * s} 0L${-0.22 * s} ${-1.3 * s}V${-1.9 * s}H${0.22 * s}V${-1.3 * s}L${0.75 * s} 0Z`;
    case "vial":
      return `M${-0.32 * s} 0V${-2 * s}H${0.32 * s}V0Z`;
    default:
      return `M${-s} 0V${-1.25 * s}H${s}V0Z`;
  }
}

/** Wie hoch ein Glas ist, als Vielfaches seiner Größe. */
const GLASS_HEIGHT = { flask: 2.5, bottle: 2.7, cone: 1.9, vial: 2, jar: 1.25 } as const;

/** Ein Trank auf einem Brett: Schein dahinter, Glas mit Flüssigkeit, Korken und Glanzlicht. */
function PotionGlass({ potion, base }: { potion: Potion; base: number }) {
  const { kind, x, size, color } = potion;
  const top = -GLASS_HEIGHT[kind] * size;
  return (
    <g transform={`translate(${x} ${base})`}>
      <circle cy={top * 0.45} r={size * 2.4} fill={`url(#stage-glow-${color.slice(1)})`} />
      <path className="prop-ink" d={glassPath(potion)} fill={color} />
      <path d={glassPath(potion)} className="prop-shade" />
      {kind === "jar" ? (
        <>
          <rect
            className="prop-ink prop-brass"
            x={-size * 1.08}
            y={top - 4}
            width={size * 2.16}
            height="5"
          />
          <path
            className="prop-mushroom"
            d={`M${-size * 0.5} ${-size * 0.55}Q0 ${-size * 1.2} ${size * 0.5} ${-size * 0.55}Z`}
          />
        </>
      ) : (
        <rect
          className="prop-ink prop-cork"
          x={-size * 0.26}
          y={top - 4}
          width={size * 0.52}
          height="6"
        />
      )}
      <ellipse
        className="prop-gloss"
        cx={-size * 0.32}
        cy={top * 0.62}
        rx={size * 0.13}
        ry={size * 0.3}
      />
    </g>
  );
}

/** Eine Sanduhr: zwei Gläser zwischen Messingplatten. */
function Hourglass({ x, base }: { x: number; base: number }) {
  return (
    <g transform={`translate(${x} ${base})`}>
      <path className="prop-ink prop-glass" d="M-6 -3L0 -12L6 -3ZM-6 -21L0 -12L6 -21Z" />
      <path className="prop-sand" d="M-4 -4L0 -9L4 -4Z" />
      <rect className="prop-ink prop-brass" x="-8" y="-3" width="16" height="3" />
      <rect className="prop-ink prop-brass" x="-8" y="-24" width="16" height="3" />
    </g>
  );
}

/** Die Leuchtfarben der Tränke. Jede bekommt einen eigenen Schein. */
const GLOWS = ["#ff4fa3", "#3fae6a", "#2ee6c8", "#ffb52e", "#b06cff", "#ff6a3d"];

/** Tränke und Bücher auf dem oberen und unteren Brett. Rechts hinter der Blase bleibt alles klein. */
const UPPER = {
  base: -125,
  potions: [
    { kind: "flask", x: -481, size: 13, color: "#ff4fa3" },
    { kind: "bottle", x: -447, size: 14, color: "#3fae6a" },
    { kind: "flask", x: -262, size: 9, color: "#ffb52e" },
    { kind: "vial", x: -196, size: 9, color: "#ff6a3d" },
    { kind: "jar", x: -127, size: 12, color: "#b06cff" },
  ] as Potion[],
  books: [
    [-428, 10, 38, "#7a2a2a"],
    [-418, 8, 33, "#24346b"],
    [-410, 11, 41, "#a8842a"],
    [-398, 9, 36, "#1f5a5a", 14],
    [-322, 10, 34, "#5a2f5a"],
    [-311, 9, 30, "#6b4426"],
  ] as BookSpec[],
};
const LOWER = {
  base: -25,
  potions: [
    { kind: "cone", x: -488, size: 16, color: "#2ee6c8" },
    { kind: "jar", x: -372, size: 13, color: "#b06cff" },
    { kind: "flask", x: -178, size: 9, color: "#ff6a3d" },
  ] as Potion[],
  books: [
    [-462, 11, 36, "#2f4a3b"],
    [-450, 9, 31, "#7a2a2a"],
    [-440, 12, 40, "#24346b"],
    [-427, 10, 34, "#a8842a", -10],
  ] as BookSpec[],
};

/** Ein Brett mit zwei Konsolen darunter. */
function Board({ base }: { base: number }) {
  return (
    <g className="prop-ink">
      <path className="prop-wood-dark" d={`M-482 ${base + 7}h8v14ZM-152 ${base + 7}h8l-8 14Z`} />
      <rect className="prop-wood" x="-508" y={base} width="402" height="7" />
      <path className="prop-edge" d={`M-506 ${base + 1}H-108`} />
    </g>
  );
}

/** Das Tränkeregal hinter dem Zauberer. */
function PotionShelf() {
  return (
    <svg
      className="stage-props"
      style={rectStyle(POTION_SHELF, SHELF_Z)}
      viewBox={sceneViewBox(POTION_SHELF)}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="stage-potion-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.35" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
        {GLOWS.map((color) => (
          <radialGradient key={color} id={`stage-glow-${color.slice(1)}`}>
            <stop offset="0" stopColor={color} stopOpacity="0.42" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {[UPPER, LOWER].map(({ base, potions, books }) => (
        <g key={base}>
          <Board base={base} />
          {books.map((spec) => (
            <Book key={spec[0]} spec={spec} base={base} />
          ))}
          {potions.map((potion) => (
            <PotionGlass key={potion.x} potion={potion} base={base} />
          ))}
        </g>
      ))}
      <Hourglass x={-160} base={-125} />
      <path className="prop-ink prop-wood" d="M-150 -25h36v-7h-36ZM-146 -32h30v-6h-30Z" />
    </svg>
  );
}

/** Bücher im Schrank: unteres Brett bei y 0, oberes bei 0,72. */
const CASE_BOOKS: { base: number; books: BookSpec[] }[] = [
  {
    base: -6,
    books: [
      [164, 10, 48, "#5e3b22"],
      [175, 12, 52, "#22305f"],
      [384, 11, 50, "#6a2626"],
      [396, 9, 44, "#2b4234"],
      [406, 13, 54, "#8f7328"],
      [420, 10, 40, "#4f2a4f", 12],
      [452, 12, 47, "#1d4f50"],
    ],
  },
  {
    base: -78,
    books: [
      [164, 11, 46, "#8f7328"],
      [372, 10, 44, "#4f2a4f"],
      [383, 12, 52, "#6a2626"],
      [396, 9, 38, "#22305f"],
      [406, 11, 48, "#5e3b22"],
      [418, 10, 41, "#1d4f50", -9],
      [448, 12, 50, "#2b4234"],
    ],
  },
];

/** Die Schubladen im Sockel: zwei Reihen zu vier, mit Schildchen und Messingknauf. */
function Drawers() {
  const cells = Array.from({ length: 8 }, (_, index) => ({
    x: 163 + (index % 4) * 87.5,
    y: 4 + Math.floor(index / 4) * 46,
  }));
  return (
    <g>
      {cells.map(({ x, y }) => (
        <g key={`${x}-${y}`}>
          <rect className="prop-ink prop-wood" x={x} y={y} width="84" height="42" />
          <rect className="prop-label" x={x + 31} y={y + 10} width="22" height="9" />
          <circle className="prop-ink prop-brass" cx={x + 42} cy={y + 29} r="4" />
        </g>
      ))}
    </g>
  );
}

/** Der Bücherschrank hinter dem Kunden. */
function Bookcase() {
  return (
    <svg
      className="stage-props"
      style={rectStyle(BOOKCASE, SHELF_Z)}
      viewBox={sceneViewBox(BOOKCASE)}
      preserveAspectRatio="none"
    >
      <g className="prop-ink">
        <rect className="prop-back" x="150" y="-142" width="372" height="142" />
        <rect className="prop-wood-dark" x="150" y="0" width="372" height="97" />
      </g>
      <Drawers />
      {CASE_BOOKS.map(({ base, books }) => (
        <g key={base}>
          {books.map((spec) => (
            <Book key={spec[0]} spec={spec} base={base} />
          ))}
          <rect className="prop-ink prop-wood" x="150" y={base} width="372" height="6" />
        </g>
      ))}
      <g className="prop-ink">
        <path className="prop-brass" d="M480 -78h24l-4 -5h-16Z" />
        <circle className="prop-globe" cx="492" cy="-100" r="15" />
        <path
          className="prop-meridian"
          d="M492 -115A15 15 0 0 1 492 -85M478 -103Q492 -97 506 -103"
        />
        <rect className="prop-wood" x="148" y="-142" width="12" height="239" />
        <rect className="prop-wood" x="512" y="-142" width="12" height="239" />
        <rect className="prop-wood" x="140" y="-152" width="392" height="10" />
        <rect className="prop-wood-dark" x="144" y="97" width="384" height="8" />
      </g>
      <path className="prop-edge" d="M142 -151H530M152 -77H520M152 -5H520" />
    </svg>
  );
}

/** Beide Regale. Ändern sich nie, darum ohne Neuzeichnen. */
function StageShelves() {
  return (
    <>
      <PotionShelf />
      <Bookcase />
    </>
  );
}

export default memo(StageShelves);

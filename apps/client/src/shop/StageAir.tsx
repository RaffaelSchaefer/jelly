/**
 * Die Luft vor der Canvas: der Schacht aus Mondlicht vom Fenster bis auf den Boden mit Staub darin,
 * der Deckenbalken mit drei Kräuterbündeln und die Vignette, die die Ecken abdunkelt.
 *
 * Das Mondlicht ist eine Fläche mit normaler Deckkraft, kein Mischmodus. Es liegt über dem Kunden
 * und hellt seine linke Seite ein wenig auf. Schacht und Staub rechnet `pet/shopStage.ts` aus
 * Fenster und Richtung des Lichts.
 *
 * @module
 */

import { memo, type CSSProperties } from "react";

import {
  cssPercent,
  cssPolygon,
  moonBeam,
  moonOnFloor,
  shopProject,
  WALL_Z,
  WINDOW,
  WINDOW_SPRING,
  type Vec3,
} from "../pet/shopStage";

/** Der Schacht des Mondlichts als Ausschnitt. */
const BEAM_STYLE: CSSProperties = { clipPath: cssPolygon(moonBeam()) };

/** Radius des Fensterbogens und Mitte des Fensters. */
const ARCH = (WINDOW.right - WINDOW.left) / 2;
const MID = WINDOW.left + ARCH;

/** Bruchteil einer Folge, die die Fläche gleichmäßig füllt, ohne Zufall. */
const spread = (index: number, step: number, offset: number) => (index * step + offset) % 1;

/**
 * Ein Staubkorn im Licht: ein Punkt der Scheiben, ein Stück entlang des Strahls zum Boden. So liegt
 * jedes Korn im Schacht.
 */
function mote(index: number): CSSProperties {
  const x = WINDOW.left + spread(index, 0.618034, 0.13) * 2 * ARCH;
  const archTop = WINDOW_SPRING + Math.sqrt(Math.max(0, ARCH ** 2 - (x - MID) ** 2));
  const y = WINDOW.bottom + spread(index, 0.381966, 0.31) * (archTop - WINDOW.bottom);
  const along = 0.12 + 0.76 * spread(index, 0.754878, 0.05);
  const [toX, toY, toZ] = moonOnFloor([x, y, WALL_Z]);
  const point: Vec3 = [
    x + along * (toX - x),
    y + along * (toY - y),
    WALL_Z + along * (toZ - WALL_Z),
  ];
  const { left, top } = shopProject(point);
  return {
    left: cssPercent(left),
    top: cssPercent(top),
    "--size": `${index % 3 ? 2 : 3}px`,
    "--drift": `${14 + ((index * 7) % 13)}s`,
    "--twinkle": `${3 + ((index * 5) % 5)}s`,
    "--delay": `-${(index * 1.7) % 9}s`,
  } as CSSProperties;
}

/** Die 16 Staubkörner. */
const MOTES = Array.from({ length: 16 }, (_, index) => mote(index));

/** Ein Blatt, das von seinem Stiel nach unten hängt, in Prozent der Bühnenhöhe. */
function leaf(length: number, width: number) {
  return `M0 0Q${width} ${length / 2} 0 ${length}Q${-width} ${length / 2} 0 0Z`;
}

/** Drei Kräuterbündel am Balken, links oben über dem Regal: Stelle und Länge der Blätter. */
const HERBS = [
  { x: 7.2, scale: 0.92 },
  { x: 19.2, scale: 1.08 },
  { x: 31.2, scale: 0.86 },
].map(({ x, scale }) => ({
  x,
  leaves: [
    [-26, 8.2],
    [-13, 10.4],
    [0, 12],
    [12, 10],
    [25, 7.8],
  ].map(([angle, length]) => ({ angle, d: leaf(length * scale, 1.1) })),
}));

/** Die Kräuter an ihren Schnüren. Gezeichnet in Bühnenmaß: x in 2,4 × Prozent, y in Prozent. */
function Herbs() {
  return (
    <svg className="air-herbs" viewBox="0 0 38.4 23" preserveAspectRatio="none">
      {HERBS.map(({ x, leaves }) => (
        <g key={x} transform={`translate(${x} 9.4)`}>
          <path className="herb-string" d="M0 -3.4V0" />
          {leaves.map(({ angle, d }) => (
            <path key={angle} className="herb-leaf" d={d} transform={`rotate(${angle})`} />
          ))}
          <rect className="herb-tie" x="-0.8" y="-0.5" width="1.6" height="1.3" />
        </g>
      ))}
    </svg>
  );
}

/** Mondlicht, Balken, Kräuter und Vignette. Ändern sich nie, darum ohne Neuzeichnen. */
function StageAir() {
  return (
    <div className="stage-air" aria-hidden="true">
      <div className="air-beam" style={BEAM_STYLE}>
        {MOTES.map((style, index) => (
          <span key={index} className="air-mote" style={style} />
        ))}
      </div>
      <div className="air-vignette" />
      <div className="air-ceiling" />
      <Herbs />
    </div>
  );
}

export default memo(StageAir);

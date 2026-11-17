/**
 * Die Rückwand der Bühne hinter der Canvas: der Nachthimmel im Bogenfenster mit Mond, Sternen und
 * Hügeln, die Steinwand, die Vertäfelung, die Dielen mit dem Mondfleck, die Regale und die
 * Lichtflecken der Kerzen. `::after` dunkelt alles beim Kauf und beim Dösen ab.
 *
 * Jede Lage kommt aus `pet/shopStage.ts`. Die Wand steht schon, bevor Three.js geladen ist.
 *
 * @module
 */

import { memo, type CSSProperties } from "react";

import {
  CANDLE,
  cssPercent,
  FLOOR_Y,
  MOON,
  moonOnFloor,
  moonPatch,
  rectStyle,
  sceneUnits,
  sceneViewBox,
  shopProject,
  STAGE_SPOTS,
  svgPoints,
  WAINSCOT_Y,
  WALL_Z,
  WINDOW,
  WINDOW_SPRING,
  type Vec3,
  type WallRect,
} from "../pet/shopStage";
import StageShelves from "./StageShelves";

/** Halbe Breite des Fensters: der Radius seines Bogens. */
const ARCH = (WINDOW.right - WINDOW.left) / 2;

/** Mitte des Fensters in der Breite. */
const MID = WINDOW.left + ARCH;

/** Breite des Rahmens, Überstand und Höhe des Fensterbretts. */
const FRAME = 0.09;
const SILL = { out: 0.1, height: 0.08 };

/** Das Fenster samt Rahmen und Brett. */
const FRAME_RECT: WallRect = {
  left: WINDOW.left - FRAME - SILL.out,
  right: WINDOW.right + FRAME + SILL.out,
  bottom: WINDOW.bottom - FRAME - SILL.height,
  top: WINDOW.top + FRAME,
};

/** Ein SVG-Wert der Szene: hundertstel Einheiten. */
const svg = sceneUnits;

/** Umriss eines Rundbogens: unten gerade, oben ein Halbkreis von rechts nach links. */
function archPath(left: number, right: number, bottom: number) {
  const radius = svg((right - left) / 2);
  return (
    `M${svg(left)} ${svg(-bottom)}H${svg(right)}V${svg(-WINDOW_SPRING)}` +
    `A${radius} ${radius} 0 0 0 ${svg(left)} ${svg(-WINDOW_SPRING)}Z`
  );
}

/** Wie der Bogen ins Rechteck des Himmels fällt, für `border-radius`. */
const SKY_ARCH = cssPercent((100 * ARCH) / (WINDOW.top - WINDOW.bottom));

/** Der Himmel liegt genau hinter den Scheiben, oben rund wie der Bogen. */
const SKY_STYLE: CSSProperties = {
  ...rectStyle(WINDOW, WALL_Z),
  borderRadius: `50% 50% 0 0 / ${SKY_ARCH} ${SKY_ARCH} 0 0`,
};

/** Wo Wand, Vertäfelung, Boden und Lichter liegen, als CSS-Variablen. */
const BACKDROP_VARS = {
  "--wainscot": cssPercent(shopProject([0, WAINSCOT_Y, WALL_Z]).top),
  "--floor": cssPercent(STAGE_SPOTS.floorLine.top),
  "--candle-x": cssPercent(STAGE_SPOTS.candleFlame.left),
  "--candle-y": cssPercent(STAGE_SPOTS.candleFlame.top),
  "--taper-x": cssPercent(STAGE_SPOTS.taperFlame.left),
  "--taper-y": cssPercent(STAGE_SPOTS.taperFlame.top),
  "--window-x": cssPercent(shopProject([MID, WINDOW_SPRING, WALL_Z]).left),
  "--window-y": cssPercent(shopProject([MID, WINDOW_SPRING, WALL_Z]).top),
} as CSSProperties;

/** Punkte auf einem Kreisbogen um `center`, im Bogenmaß von `from` bis `to`. */
function arc(center: [number, number], radius: number, from: number, to: number) {
  return Array.from({ length: 13 }, (_, step) => {
    const angle = from + ((to - from) * step) / 12;
    const x = center[0] + radius * Math.cos(angle);
    const y = center[1] + radius * Math.sin(angle);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
}

/**
 * Die Mondsichel als Vieleck: die Scheibe ohne den Biss einer zweiten, die oben rechts über ihr
 * liegt, so wie `crescent_outline` in `blender/shapes.py`. Abstand und Radius des Bisses sind
 * Anteile des Radius.
 */
function crescent(radius: number) {
  const toward = -0.6;
  const shift = 0.45;
  const bite = 0.85;
  // Die Sehne, auf der sich beide Kreise schneiden, und die Winkel ihrer Enden je Kreis.
  const chord = (1 - bite * bite + shift * shift) / (2 * shift);
  const cut = Math.acos(chord);
  const inner = Math.atan2(Math.sqrt(1 - chord * chord), chord - shift);
  const center: [number, number] = [
    shift * radius * Math.cos(toward),
    shift * radius * Math.sin(toward),
  ];
  return [
    ...arc([0, 0], radius, toward + cut, toward + 2 * Math.PI - cut),
    ...arc(center, bite * radius, toward - inner, toward - 2 * Math.PI + inner),
  ].join(" ");
}

/** Der Mond: Radius und Lage im Himmel. */
const MOON_R = 0.13 * ARCH;
const MOON_AT = { x: svg(MOON[0]), y: svg(-MOON[1]) };

/** Die Sterne im Fenster: links und oben in Prozent des Himmels, Größe in px, Takt in s. */
const STARS: [number, number, number, number, number][] = [
  [24, 18, 2, 3.4, 0],
  [72, 12, 3, 5.2, 1.3],
  [58, 34, 1.5, 2.6, 0.7],
  [86, 44, 2, 4.4, 2.1],
  [20, 52, 2.5, 6.2, 0.4],
  [42, 58, 1.5, 3.8, 1.8],
  [77, 63, 2, 2.9, 2.6],
  [11, 70, 1.5, 5.6, 1.1],
  [64, 74, 2.5, 4.8, 3.2],
];

/** Hügel mit einem Turm, in dessen Fenster noch Licht brennt. */
const HILLS = "M-36 26V6Q-14-6 8 1T52 0Q76-12 106 3V26Z";
const TOWER = "M57 -1V-14L60.5-20L64-14V-1Z";

/** Der Himmel hinter den Scheiben. */
function Sky() {
  return (
    <div className="stage-sky" style={SKY_STYLE}>
      <svg viewBox={sceneViewBox(WINDOW)} preserveAspectRatio="none">
        <defs>
          <radialGradient id="stage-moon-halo">
            <stop offset="0" stopColor="#bcd2ff" stopOpacity="0.25" />
            <stop offset="1" stopColor="#bcd2ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={MOON_AT.x} cy={MOON_AT.y} r={svg(3 * MOON_R)} fill="url(#stage-moon-halo)" />
        <polygon
          className="sky-moon"
          points={crescent(svg(MOON_R))}
          transform={`translate(${MOON_AT.x} ${MOON_AT.y})`}
        />
        <path className="sky-hills" d={HILLS} />
        <path className="sky-hills" d={TOWER} />
        <rect className="sky-lamp" x="59.6" y="-11" width="1.8" height="2.6" />
      </svg>
      {STARS.map(([left, top, size, seconds, delay]) => (
        <span
          key={`${left}-${top}`}
          className="sky-star"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: size,
            height: size,
            animationDuration: `${seconds}s`,
            animationDelay: `-${delay}s`,
          }}
        />
      ))}
      <span className="sky-shoot" />
    </div>
  );
}

/** Das Bogenfenster: Rahmen, Kreuz und Brett, das warmes Licht fängt. */
function Window() {
  const outer = archPath(WINDOW.left - FRAME, WINDOW.right + FRAME, WINDOW.bottom - FRAME);
  const panes = archPath(WINDOW.left, WINDOW.right, WINDOW.bottom);
  const sillTop = WINDOW.bottom - FRAME;
  return (
    <svg
      className="stage-window"
      style={rectStyle(FRAME_RECT, WALL_Z)}
      viewBox={sceneViewBox(FRAME_RECT)}
      preserveAspectRatio="none"
    >
      <path className="window-frame" d={`${outer}${panes}`} fillRule="evenodd" />
      <path className="window-bars" d={`M${svg(MID)} ${svg(-WINDOW.bottom)}V${svg(-WINDOW.top)}`} />
      <path
        className="window-bars"
        d={`M${svg(WINDOW.left)} ${svg(-WINDOW_SPRING)}H${svg(WINDOW.right)}`}
      />
      <path className="window-rim" d={panes} />
      <rect
        className="window-sill"
        x={svg(FRAME_RECT.left)}
        y={svg(-sillTop)}
        width={svg(FRAME_RECT.right - FRAME_RECT.left)}
        height={svg(SILL.height)}
      />
      <path
        className="window-sill-light"
        d={`M${svg(FRAME_RECT.left)} ${svg(-sillTop)}H${svg(FRAME_RECT.right)}`}
      />
      <path className="window-ink" d={outer} />
    </svg>
  );
}

/** Abstand der Dielenfugen und wie weit nach vorn die Dielen reichen. */
const BOARD = 0.45;
const FLOOR_FRONT = 2.4;

/** Eine Linie der Szene als Pfad im Prozent-SVG der Bühne. */
function line(from: Vec3, to: Vec3) {
  return `M${svgPoints([shopProject(from)])}L${svgPoints([shopProject(to)])}`;
}

/** Die Fugen zwischen den Dielen. Sie laufen auf den Fluchtpunkt in der Bühnenmitte zu. */
const SEAMS = Array.from({ length: 29 }, (_, index) => {
  const x = (index - 14) * BOARD;
  return line([x, FLOOR_Y, WALL_Z], [x, FLOOR_Y, FLOOR_FRONT]);
}).join("");

/** Wo die Dielen aneinanderstoßen, je Diele versetzt. */
const JOINTS = Array.from({ length: 28 }, (_, index) => {
  const x = (index - 14) * BOARD;
  const first = WALL_Z + ((index * 0.93 + 0.4) % 2.2);
  return [first, first + 2.2]
    .filter((z) => z < FLOOR_FRONT)
    .map((z) => line([x, FLOOR_Y, z], [x + BOARD, FLOOR_Y, z]))
    .join("");
}).join("");

/** Pfosten und Kämpfer des Fensterkreuzes, jeweils von Ende zu Ende. */
const BARS: [Vec3, Vec3][] = [
  [
    [MID, WINDOW.bottom, WALL_Z],
    [MID, WINDOW.top, WALL_Z],
  ],
  [
    [WINDOW.left, WINDOW_SPRING, WALL_Z],
    [WINDOW.right, WINDOW_SPRING, WALL_Z],
  ],
];

/** Der Schatten des Fensterkreuzes im Mondfleck. */
const CROSS = BARS.map(([from, to]) => line(moonOnFloor(from), moonOnFloor(to))).join("");

/** Wo die Kerze vor der Theke warmes Licht auf die Dielen wirft. */
const FLOOR_POOL = shopProject([CANDLE.at[0] + 0.35, FLOOR_Y, CANDLE.at[2] + 0.6]);

/**
 * Die Dielen von der Wand bis zur Kamera, mit Mondfleck und Kerzenschein, im Prozent-SVG der Bühne.
 * Die Theke zeichnet sie ein zweites Mal vor ihrem Fuß: Der Zauberer steht tiefer als der Boden,
 * und die Dielen vor der Theke liegen näher an der Kamera als er. Ihre Verläufe stehen in
 * {@link Floor}.
 */
export const FLOOR_ART = (
  <>
    <rect
      y={STAGE_SPOTS.floorLine.top}
      width="100"
      height={100 - STAGE_SPOTS.floorLine.top}
      fill="url(#stage-floor-shade)"
    />
    <path className="floor-seams" d={SEAMS} />
    <path className="floor-joints" d={JOINTS} />
    <polygon className="floor-moon" points={svgPoints(moonPatch())} />
    <path className="floor-moon-cross" d={CROSS} />
    <ellipse cx={FLOOR_POOL.left} cy={FLOOR_POOL.top} rx="7" ry="8" fill="url(#stage-floor-pool)" />
  </>
);

/** Der Boden hinter der Szene, samt den Verläufen, die auch die Theke für ihn braucht. */
function Floor() {
  return (
    <svg className="stage-floor" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="stage-floor-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2112" />
          <stop offset="1" stopColor="#120a05" />
        </linearGradient>
        <radialGradient id="stage-floor-pool">
          <stop offset="0" stopColor="#ffb15c" stopOpacity="0.15" />
          <stop offset="1" stopColor="#ffb15c" stopOpacity="0" />
        </radialGradient>
      </defs>
      {FLOOR_ART}
    </svg>
  );
}

/** Eigenschaften von {@link StageBackdrop}. */
export interface StageBackdropProps {
  /** `kauf` dunkelt den Raum ab, während der Kaufzauber wirkt. */
  dim: "kauf" | null;
}

/** Der Raum hinter den beiden Jellies. */
function StageBackdrop({ dim }: StageBackdropProps) {
  return (
    <div
      className="stage-backdrop"
      aria-hidden="true"
      data-dim={dim ?? undefined}
      style={BACKDROP_VARS}
    >
      <div className="stage-wall" />
      <div className="stage-wainscot" />
      <Floor />
      <Sky />
      <Window />
      <StageShelves />
      <div className="stage-pool stage-pool-warm" />
      <div className="stage-pool stage-pool-cool" />
    </div>
  );
}

export default memo(StageBackdrop);

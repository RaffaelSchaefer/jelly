/**
 * Die Theke vor dem Zauberer, über der Canvas: Platte mit Messingkante, dunkle Front mit drei
 * Füllungen und einem Runenstern, darauf die dicke Kerze, die schlanke auf ihrem Leuchter und die
 * Messingschale, in der die Münzen landen.
 *
 * Die Theke verdeckt den Zauberer unterhalb ihrer Hinterkante, so wie es eine echte täte. Ihre
 * Flächen sind Ecken der Szene, mit der Kamera aus `pet/shopStage.ts` auf die Bühne gerechnet. Die
 * Flammen folgen `--flicker`, das das Licht der Szene schreibt.
 *
 * @module
 */

import { memo, type CSSProperties } from "react";

import {
  CANDLE,
  COUNTER,
  counterOutline,
  cssPercent,
  depthScale,
  FLOOR_Y,
  shopProject,
  STAGE_SPOTS,
  svgPoints,
  TAPER,
  TRAY,
  type Candle,
  type Vec3,
  type WallRect,
} from "../pet/shopStage";
import { FLOOR_ART } from "./StageBackdrop";

/** Wo die Front unter der überstehenden Platte steht. */
const BODY_Z = COUNTER.front - 0.04;

/** Unterkante der Platte. */
const SLAB_BOTTOM = COUNTER.topY - COUNTER.slab;

/** Ecken der Szene als `points` im Prozent-SVG der Bühne. */
function corners(points: Vec3[]) {
  return svgPoints(points.map((point) => shopProject(point)));
}

/** Ein Rechteck in der Ebene z. */
function face({ left, right, bottom, top }: WallRect, z: number) {
  return corners([
    [left, top, z],
    [right, top, z],
    [right, bottom, z],
    [left, bottom, z],
  ]);
}

/** Die Platte von oben, vom Hinter- bis zum Vorderrand. */
const TOP = corners([
  [COUNTER.left, COUNTER.topY, COUNTER.back],
  [COUNTER.right, COUNTER.topY, COUNTER.back],
  [COUNTER.right, COUNTER.topY, COUNTER.front],
  [COUNTER.left, COUNTER.topY, COUNTER.front],
]);

/** Vorderkante der Platte und die Front darunter, bis auf den Boden, mit dunklem Sockel. */
const EDGE = face({ ...COUNTER, bottom: SLAB_BOTTOM, top: COUNTER.topY }, COUNTER.front);
const FRONT = face(
  { ...COUNTER, right: COUNTER.right - 0.03, bottom: FLOOR_Y, top: SLAB_BOTTOM },
  BODY_Z,
);
const PLINTH = face({ ...COUNTER, bottom: FLOOR_Y, top: FLOOR_Y + 0.07 }, COUNTER.front);

/**
 * Die Dielen vor dem Fuß der Theke, bis an den unteren Rand. Der Zauberer steht tiefer als der
 * Boden, ohne sie sähe man ihn unter der Theke hervorschauen.
 */
const UNDER = svgPoints([
  shopProject([COUNTER.left, FLOOR_Y, COUNTER.front]),
  shopProject([COUNTER.right, FLOOR_Y, COUNTER.front]),
  { left: shopProject([COUNTER.right, FLOOR_Y, COUNTER.front]).left, top: 101 },
  { left: shopProject([COUNTER.left, FLOOR_Y, COUNTER.front]).left, top: 101 },
]);

/** Die Messingleiste an der Vorderkante der Platte. */
const BRASS = `M${svgPoints([shopProject([COUNTER.left, COUNTER.topY, COUNTER.front])])}L${svgPoints([shopProject([COUNTER.right, COUNTER.topY, COUNTER.front])])}`;

/** Die drei Füllungen der Front: Rahmen und vertiefte Mitte. */
const PANELS = [-3.28, -1.98, -0.68].map((center) => {
  const rect = { left: center - 0.57, right: center + 0.57, bottom: -0.95, top: -0.6 };
  const inset = {
    left: rect.left + 0.06,
    right: rect.right - 0.06,
    bottom: rect.bottom + 0.05,
    top: rect.top - 0.05,
  };
  return { key: center, frame: face(rect, BODY_Z + 0.01), inset: face(inset, BODY_Z + 0.01) };
});

/** Ein Runenstern aus Messing auf der mittleren Füllung, mit acht Zacken. */
const BOSS = corners(
  Array.from({ length: 16 }, (_, index): Vec3 => {
    const angle = (Math.PI * index) / 8 - Math.PI / 2;
    const radius = index % 2 ? 0.05 : 0.11;
    return [-1.98 + radius * Math.cos(angle), -0.775 + radius * Math.sin(angle), BODY_Z + 0.02];
  }),
);

/** Die Theke selbst. */
function CounterBody() {
  return (
    <svg className="counter-body" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="stage-counter-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2414" />
          <stop offset="1" stopColor="#1f120a" />
        </linearGradient>
        <clipPath id="stage-under-counter">
          <polygon points={UNDER} />
        </clipPath>
      </defs>
      <g clipPath="url(#stage-under-counter)">{FLOOR_ART}</g>
      <polygon points={FRONT} fill="url(#stage-counter-front)" />
      {PANELS.map(({ key, frame, inset }) => (
        <g key={key}>
          <polygon className="counter-panel" points={frame} />
          <polygon className="counter-inset" points={inset} />
        </g>
      ))}
      <polygon className="counter-boss" points={BOSS} />
      <polygon className="counter-plinth" points={PLINTH} />
      <polygon className="counter-edge" points={EDGE} />
      <polygon className="counter-top" points={TOP} />
      <path className="counter-brass" d={BRASS} />
      <polygon className="counter-ink" points={svgPoints(counterOutline())} />
    </svg>
  );
}

/**
 * Lage eines Dings auf der Theke: unten in der Mitte bei `at`, Größe in Einheiten, mit der Tiefe
 * skaliert.
 */
function placed(at: Vec3, width: number, height: number): CSSProperties {
  const { left, top } = shopProject(at);
  const scale = depthScale(at[2]);
  return {
    left: cssPercent(left),
    top: cssPercent(top),
    width: `calc(var(--u) * ${(width * scale).toFixed(4)})`,
    height: `calc(var(--u) * ${(height * scale).toFixed(4)})`,
    "--ds": scale.toFixed(4),
  } as CSSProperties;
}

/** Wachs (#efe3c4) mit Licht von vorn links, je Kerze ein eigener Verlauf. */
function Wax({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#c9b892" />
      <stop offset="0.36" stopColor="#fbf4e2" />
      <stop offset="0.62" stopColor="#efe3c4" />
      <stop offset="1" stopColor="#b8a27a" />
    </linearGradient>
  );
}

/** Die dicke Kerze in ihrer Messingschale. */
function FatCandle({ candle }: { candle: Candle }) {
  return (
    <div className="stage-candle" style={placed(candle.at, 0.3, candle.height)}>
      <svg viewBox="-15 -36 30 36" preserveAspectRatio="none">
        <defs>
          <Wax id="stage-wax-fat" />
        </defs>
        <path className="prop-ink candle-dish" d="M-14 -2.4Q-13 0 0 0Q13 0 14 -2.4Z" />
        <ellipse className="prop-ink candle-brass" cx="0" cy="-2.4" rx="14" ry="2.4" />
        <rect
          className="prop-ink"
          x="-7"
          y="-34"
          width="14"
          height="31.6"
          fill="url(#stage-wax-fat)"
        />
        <ellipse className="candle-pool" cx="0" cy="-34" rx="7" ry="1.5" />
        <path
          className="candle-drip"
          d="M3.2 -34.6v7.6a1.5 1.5 0 0 0 3 0v-6.8ZM-6.2 -34v4.2a1.2 1.2 0 0 0 2.4 0v-3.8Z"
        />
        <path className="candle-wick" d="M0 -34.4V-37" />
      </svg>
      <span className="stage-flame" />
    </div>
  );
}

/** Die schlanke Kerze auf ihrem Messingleuchter. */
function Taper({ candle }: { candle: Candle }) {
  return (
    <div className="stage-candle" style={placed(candle.at, 0.24, candle.height)}>
      <svg viewBox="-12 -62 24 62" preserveAspectRatio="none">
        <defs>
          <Wax id="stage-wax-taper" />
        </defs>
        <path className="prop-ink candle-dish" d="M-10 -2Q-9 0 0 0Q9 0 10 -2Z" />
        <ellipse className="prop-ink candle-brass" cx="0" cy="-2" rx="10" ry="2" />
        <rect className="prop-ink candle-brass" x="-1.7" y="-14" width="3.4" height="12" />
        <ellipse className="prop-ink candle-brass" cx="0" cy="-8" rx="3.2" ry="1.9" />
        <ellipse className="prop-ink candle-brass" cx="0" cy="-15" rx="6.4" ry="1.6" />
        <rect
          className="prop-ink"
          x="-4.6"
          y="-60.6"
          width="9.2"
          height="45"
          fill="url(#stage-wax-taper)"
        />
        <ellipse className="candle-pool" cx="0" cy="-60.6" rx="4.6" ry="1.1" />
        <path
          className="candle-drip"
          d="M2 -61v9a1.3 1.3 0 0 0 2.6 0v-8.4ZM-4.6 -60v4a1 1 0 0 0 2 0v-3.6Z"
        />
        <path className="candle-wick" d="M0 -61V-63.6" />
      </svg>
      <span className="stage-flame" />
    </div>
  );
}

/** Lage der Schale: ihre Mitte ist das Ziel der Münzen. */
const TRAY_STYLE: CSSProperties = {
  left: cssPercent(STAGE_SPOTS.tray.left),
  top: cssPercent(STAGE_SPOTS.tray.top),
  width: `calc(var(--u) * ${(2 * TRAY.radius * depthScale(TRAY.at[2]) + 0.06).toFixed(4)})`,
  height: `calc(var(--u) * ${(0.16 * depthScale(TRAY.at[2])).toFixed(4)})`,
};

/** Die Messingschale für die Münzen. */
function Tray() {
  return (
    <div className="stage-tray" style={TRAY_STYLE}>
      <svg viewBox="-25 -8 50 16" preserveAspectRatio="none">
        <ellipse className="prop-ink candle-dish" cx="0" cy="1.6" rx="22.5" ry="5" />
        <ellipse className="prop-ink candle-brass" cx="0" cy="-1" rx="22.5" ry="5.2" />
        <ellipse className="tray-well" cx="0" cy="-0.4" rx="17" ry="3.4" />
        <path className="tray-shine" d="M-15 -3.6Q0 -6.4 15 -3.6" />
      </svg>
    </div>
  );
}

/** Theke, Kerzen und Schale. Ändern sich nie, darum ohne Neuzeichnen. */
function StageCounter() {
  return (
    <div className="stage-counter" aria-hidden="true">
      <CounterBody />
      <Taper candle={TAPER} />
      <Tray />
      <FatCandle candle={CANDLE} />
    </div>
  );
}

export default memo(StageCounter);

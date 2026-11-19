/**
 * Der Runenkreis im Boden unter dem eigenen Jelly, hinter der Canvas. CSS 3D legt ihn flach auf den
 * Boden, mit derselben Perspektive wie die Kamera der Szene: `--u` ist eine Einheit bei z 0, die
 * Kamera steht 9,4 Einheiten davor. Das Jelly verdeckt die hintere Hälfte von selbst.
 *
 * Der Schein ist eine zweite, breitere Linie unter der feinen, kein Filter: WebKit zöge den Kreis
 * sonst flach. Aus demselben Grund trägt das gedrehte Element weder `opacity` noch `overflow`.
 *
 * @module
 */

import { memo, useEffect, useState, type CSSProperties } from "react";

import { desktop } from "../backend";
import { RUNE_CIRCLE, RUNE_STATES, SHOP_VIEW, type RuneState } from "../pet/shopStage";

/** Perspektive und Lage des Kreises in Einheiten, für `stage.css`. */
const FLOOR_VARS = {
  "--eye": SHOP_VIEW.eye[2],
  "--rune-x": RUNE_CIRCLE.at[0] - SHOP_VIEW.eye[0],
  "--rune-y": SHOP_VIEW.eye[1] - RUNE_CIRCLE.at[1],
  "--rune-size": 2 * RUNE_CIRCLE.radius,
} as CSSProperties;

/** Die Strichvorlagen der Runen, in einem Kästchen von 4 × 5 um die Mitte, oben nach außen. */
const GLYPHS = [
  "M0 2.5V-2.5M0 -1.4L1.7 -2.5M0 0.2L1.7 -0.9",
  "M0 2.5V-2.5M0 -0.4L-1.7 -2.3M0 -0.4L1.7 -2.3",
  "M0 -2.5L1.5 -0.8L0 0.9L-1.5 -0.8ZM0 0.9L1.5 2.5M0 0.9L-1.5 2.5",
  "M0 2.5V-2.5M-1.6 -0.9L0 -2.5L1.6 -0.9",
  "M-1.6 -2.5V2.5L1.6 -2.5V2.5L-1.6 -2.5",
  "M-1.3 -2.5L1.3 -0.8L-1.3 0.8L1.3 2.5",
];

/** Welche Vorlage an welcher der 16 Stellen steht. */
const ORDER = [0, 3, 1, 4, 2, 5, 3, 1, 0, 4, 2, 5, 1, 3, 5, 2];

/** Die 16 Runen zwischen den beiden äußeren Ringen, jede nach außen gedreht. */
const RUNES = ORDER.map((glyph, index) => ({
  d: GLYPHS[glyph],
  transform: `rotate(${index * 22.5}) translate(0 -95) scale(1.15)`,
}));

/** Zwei Dreiecke zum Hexagramm, Radius 78. */
const HEXAGRAM = [0, 60]
  .map((start) => {
    const corners = [0, 120, 240].map((step) => {
      const angle = ((start + step - 90) * Math.PI) / 180;
      return `${(78 * Math.cos(angle)).toFixed(1)} ${(78 * Math.sin(angle)).toFixed(1)}`;
    });
    return `M${corners.join("L")}Z`;
  })
  .join("");

/** Acht Punkte um den inneren Ring. */
const DOTS = Array.from({ length: 8 }, (_, index) => {
  const angle = (index * Math.PI) / 4;
  return { cx: (49 * Math.cos(angle)).toFixed(1), cy: (49 * Math.sin(angle)).toFixed(1) };
});

/** Der Stern in der Mitte, fünfzackig wie die Sterne am Hut des Zauberers. */
const STAR = `M${Array.from({ length: 10 }, (_, index) => {
  const angle = (index * Math.PI) / 5 - Math.PI / 2;
  const radius = index % 2 ? 8.6 : 18;
  return `${(radius * Math.cos(angle)).toFixed(1)} ${(radius * Math.sin(angle)).toFixed(1)}`;
}).join("L")}Z`;

/** Die äußeren Ringe mit den Runen. In der leuchtenden Lage gehen die Runen nacheinander an. */
function ringLines(staggered: boolean) {
  return (
    <>
      <circle r="98" />
      <circle r="92" />
      {RUNES.map((rune, index) => (
        <path
          key={rune.transform}
          d={rune.d}
          transform={rune.transform}
          className={staggered ? "rune-glyph" : undefined}
          style={staggered ? ({ "--i": index } as CSSProperties) : undefined}
        />
      ))}
    </>
  );
}

/** Der äußere Ring in drei Lagen: breiter Schein, eingravierte Linie, leuchtende Linie. */
const RING_ART = (
  <svg viewBox="-100 -100 200 200">
    <g className="rune-glow">{ringLines(false)}</g>
    <g className="rune-ink">{ringLines(false)}</g>
    <g className="rune-lit">{ringLines(true)}</g>
  </svg>
);

/** Die Linien der Mitte: Hexagramm, innerer Ring mit Punkten und Stern. */
const CORE_LINES = (
  <>
    <path d={HEXAGRAM} />
    <circle r="42" />
    {DOTS.map((dot) => (
      <circle key={`${dot.cx} ${dot.cy}`} className="rune-dot" r="2.4" {...dot} />
    ))}
    <path d={STAR} />
  </>
);

/** Die Mitte in denselben drei Lagen wie der Ring. */
const CORE_ART = (
  <svg viewBox="-100 -100 200 200">
    <g className="rune-glow">{CORE_LINES}</g>
    <g className="rune-ink">{CORE_LINES}</g>
    <g className="rune-lit">{CORE_LINES}</g>
  </svg>
);

/** Die Vorschau unter `#shop-runen` zeigt alle Zustände nacheinander, je 2 s. */
const PREVIEW_RUNES = !desktop && location.hash === "#shop-runen";

/** Der Zustand, den der Kreis zeigt. In der Vorschau `#shop-runen` wechselt er von selbst. */
function useShownState(state: RuneState) {
  const [cycled, setCycled] = useState<number | null>(PREVIEW_RUNES ? 0 : null);
  useEffect(() => {
    if (!PREVIEW_RUNES) return;
    const timer = window.setInterval(
      () => setCycled((index) => ((index ?? 0) + 1) % RUNE_STATES.length),
      2000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return cycled === null ? state : RUNE_STATES[cycled];
}

/**
 * Zählt, wie oft der Kaufzauber den Kreis schon weitergedreht hat. Der Schwung bleibt stehen und
 * springt nie zurück.
 */
function useSpellTurns(state: RuneState) {
  const [turns, setTurns] = useState(0);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state === "zauber") setTurns(turns + 1);
  }
  return turns;
}

/** Eigenschaften von {@link RuneCircle}. */
export interface RuneCircleProps {
  state: RuneState;
}

/** Der Runenkreis samt seiner Bühne für CSS 3D. */
function RuneCircle({ state }: RuneCircleProps) {
  const shown = useShownState(state);
  const turns = useSpellTurns(shown);
  return (
    <div className="stage-floor3d" aria-hidden="true" style={FLOOR_VARS}>
      <div className="stage-rune" data-state={shown} style={{ "--turns": turns } as CSSProperties}>
        <div className="rune-shadow" />
        <div className="rune-swell">
          <div className="rune-turn">
            <div className="rune-spin rune-spin-outer">
              <div className="rune-boost rune-boost-outer">{RING_ART}</div>
            </div>
            <div className="rune-spin rune-spin-inner">
              <div className="rune-boost rune-boost-inner">{CORE_ART}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(RuneCircle);

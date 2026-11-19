/**
 * Das Bild oben in der Update-Karte: eine Rakete mit dem Jelly im Fenster fliegt durchs All, an
 * Planet, Mond und Sternen vorbei. Reines SVG, Spitze, Flossen und Planet nehmen die Jelly-Farbe
 * (`--accent`). Die Bewegung steht in `update.css`.
 *
 * @module
 */

import type { CSSProperties } from "react";

/** Kontur wie beim Jelly. */
const INK = "#0e2c38";

/** Mischt die Jelly-Farbe mit `other`. */
const accent = (percent: number, other: string) =>
  `color-mix(in srgb, var(--accent) ${percent}%, ${other})`;

/** Feste Sterne aus einem kleinen Zufall mit festem Samen, jeder sechste funkelt. */
const STARS = (() => {
  let seed = 3;
  const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: 54 }, (_, index) => ({
    x: random() * 300,
    y: random() * 72,
    r: 0.4 + random() * 0.9,
    opacity: 0.35 + random() * 0.6,
    twinkle: index % 6 === 0,
  }));
})();

/** Funkelnde Vierecksterne: x, y, Größe. */
const SPARKLES = [
  [58, 46, 0.8],
  [214, 16, 0.65],
  [96, 12, 0.5],
  [192, 62, 0.5],
] as const;

/** Rauchwolken hinter der Rakete: x, y, Radius. */
const PUFFS = [
  [130, 70, 6],
  [121, 75, 7],
  [111, 79, 8],
  [100, 81, 8.5],
] as const;

/** Verläufe. Es gibt immer nur eine Karte, die festen IDs stoßen also nirgends an. */
function Gradients() {
  return (
    <defs>
      <linearGradient id="update-space" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#060a14" />
        <stop offset="1" style={{ stopColor: accent(26, "#121a33") }} />
      </linearGradient>
      <radialGradient id="update-nebula" cx="50%" cy="60%" r="50%">
        <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0.28 }} />
        <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
      </radialGradient>
      <linearGradient id="update-hull" x1="0" x2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.6" stopColor="#eef3f7" />
        <stop offset="1" stopColor="#b9c6d3" />
      </linearGradient>
      <linearGradient id="update-fire" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff6c8" />
        <stop offset="0.4" stopColor="#ffc45c" />
        <stop offset="0.75" stopColor="#ff7a3d" />
        <stop offset="1" stopColor="#ff5a3d" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="update-planet" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style={{ stopColor: accent(60, "white") }} />
        <stop offset="0.55" style={{ stopColor: "var(--accent)" }} />
        <stop offset="1" style={{ stopColor: accent(45, "#0b1530") }} />
      </linearGradient>
      <radialGradient id="update-warm" cx="35%" cy="30%">
        <stop offset="0" stopColor="#ffe6c9" />
        <stop offset="1" stopColor="#f08f6a" />
      </radialGradient>
    </defs>
  );
}

/** Planet mit Ring: Ring hinten, Kugel, vorderer Bogen des Rings. */
function RingedPlanet() {
  const ring = { stroke: accent(45, "white") };
  return (
    <g transform="translate(262 58) rotate(-14)">
      <ellipse rx="43" ry="10" fill="none" style={ring} strokeWidth="3.4" opacity="0.85" />
      <circle r="26" fill="url(#update-planet)" stroke={INK} strokeWidth="1.4" />
      <path
        d="M-14 -9 C-5 -13 8 -12 18 -5"
        style={{ stroke: accent(70, "white") }}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path d="M-43 0 A43 10 0 0 0 43 0" fill="none" style={ring} strokeWidth="3.4" />
    </g>
  );
}

/** Kleiner warmer Planet, Mond und Sterne. */
function Sky() {
  return (
    <>
      {STARS.map((star, index) => (
        <circle
          key={index}
          className={star.twinkle ? "update-twinkle" : undefined}
          cx={star.x.toFixed(1)}
          cy={star.y.toFixed(1)}
          r={star.r.toFixed(2)}
          fill="#fff"
          opacity={star.opacity.toFixed(2)}
          style={{ animationDelay: `${(index % 5) * 0.5}s` }}
        />
      ))}
      {SPARKLES.map(([x, y, size], index) => (
        <path
          key={index}
          className="update-twinkle"
          transform={`translate(${x} ${y}) scale(${size})`}
          d="M0 -5 L1.2 -1.2 L5 0 L1.2 1.2 L0 5 L-1.2 1.2 L-5 0 L-1.2 -1.2 Z"
          style={{ fill: accent(40, "white"), animationDelay: `${index * 0.7}s` } as CSSProperties}
        />
      ))}
      <circle cx="36" cy="22" r="8.5" fill="url(#update-warm)" stroke={INK} strokeWidth="1.3" />
      <circle cx="33.5" cy="19.5" r="1.8" fill="#d9755a" opacity="0.6" />
      <circle cx="78" cy="56" r="4.5" fill="#c9d3de" stroke={INK} strokeWidth="1.1" />
      <circle cx="77" cy="55" r="1" fill="#9aa8b6" />
    </>
  );
}

/** Die Rakete, Spitze nach oben, Mitte bei 0,0. Im Fenster sitzt das Jelly. */
function Rocket() {
  const stroke = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: "round" } as const;
  return (
    <g className="update-rocket">
      <g className="update-fire">
        <path d="M-5.5 21 C-6.5 30 -2 38 0 46 C2 38 6.5 30 5.5 21 Z" fill="url(#update-fire)" />
        <path d="M-3 21 C-3 26 -1 30 0 34 C1 30 3 26 3 21 Z" fill="#fffbe6" />
      </g>
      <path
        d="M-8.6 5 C-14.5 9 -17.5 15.5 -17.5 23.5 L-8.4 19.5 Z"
        style={{ fill: "var(--accent)" }}
        {...stroke}
      />
      <path
        d="M8.6 5 C14.5 9 17.5 15.5 17.5 23.5 L8.4 19.5 Z"
        style={{ fill: accent(70, INK) }}
        {...stroke}
      />
      <rect x="-6" y="19" width="12" height="4" rx="1.4" fill="#8d9cab" {...stroke} />
      <path
        d="M0 -31 C9 -24 11.5 -10 10.2 4 L8.6 20 L-8.6 20 L-10.2 4 C-11.5 -10 -9 -24 0 -31 Z"
        fill="url(#update-hull)"
        {...stroke}
      />
      <path d="M-5.4 -19 C-7.6 -9 -7.8 3 -6.6 15" stroke="#fff" strokeWidth="1.8" fill="none" />
      <path d="M-10.3 7 C-3.5 8.8 3.5 8.8 10.3 7" stroke={INK} strokeWidth="1.2" fill="none" />
      <path
        d="M0 -31 C6 -26.5 8.6 -21 9.7 -15 C3.5 -12.8 -3.5 -12.8 -9.7 -15 C-8.6 -21 -6 -26.5 0 -31 Z"
        style={{ fill: "var(--accent)" }}
        {...stroke}
      />
      <Pilot />
      <rect
        x="-1.5"
        y="9.5"
        width="3"
        height="14"
        rx="1.3"
        style={{ fill: accent(85, "white") }}
        stroke={INK}
        strokeWidth="1.3"
      />
    </g>
  );
}

/** Das Fenster mit dem Jelly darin. */
function Pilot() {
  return (
    <>
      <circle cy="-3" r="6.6" style={{ fill: accent(30, INK) }} stroke={INK} strokeWidth="1.8" />
      <path
        d="M-4.4 2.2 C-4.8 -2.2 -2.7 -5.6 0 -5.6 C2.7 -5.6 4.8 -2.2 4.4 2.2 Z"
        style={{ fill: "var(--accent)" }}
      />
      <circle cx="-1.7" cy="-2.2" r="0.9" fill={INK} />
      <circle cx="1.7" cy="-2.2" r="0.9" fill={INK} />
      <path d="M-0.9 -0.2 Q0 0.6 0.9 -0.2" stroke={INK} strokeWidth="0.6" fill="none" />
      <path
        d="M-4.2 -6.4 A6 6 0 0 1 0.8 -8.6"
        stroke="#fff"
        strokeOpacity="0.75"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

/** Das ganze Bild. Rein zur Zierde. */
export default function UpdateBanner() {
  return (
    <svg className="update-banner" viewBox="0 0 300 72" aria-hidden="true">
      <Gradients />
      <rect width="300" height="72" fill="url(#update-space)" />
      <ellipse cx="150" cy="46" rx="150" ry="42" fill="url(#update-nebula)" />
      <Sky />
      <RingedPlanet />
      <path
        d="M88 86 C106 76 120 70 132 64"
        style={{ stroke: accent(50, "white") }}
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeDasharray="1 6"
        strokeLinecap="round"
        fill="none"
      />
      {PUFFS.map(([x, y, r], index) => (
        <g key={index} className="update-puff" style={{ animationDelay: `${index * -0.6}s` }}>
          <circle cx={x} cy={y} r={r} fill="#fff" opacity="0.18" />
          <circle cx={x - 1} cy={y - 1} r={r * 0.7} fill="#fff" opacity="0.22" />
        </g>
      ))}
      <g transform="translate(152 34) rotate(28) scale(0.86)">
        <Rocket />
      </g>
    </svg>
  );
}

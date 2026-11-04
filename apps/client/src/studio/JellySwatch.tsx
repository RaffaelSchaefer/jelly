/**
 * Das Jelly im Kleinen, als Farbwahl im Körper-Popover. Die Zeichnung stammt aus `public/pet.svg`.
 *
 * @module
 */

import type { JellyPalette } from "@jelly/scene/colors";

/**
 * Ein kleines Jelly in den Farben von `palette`.
 *
 * @param id - Macht den Farbverlauf eindeutig, die Auswahl zeigt mehrere nebeneinander.
 */
export default function JellySwatch({ id, palette }: { id: string; palette: JellyPalette }) {
  const fill = `jelly-swatch-${id}`;
  return (
    <svg className="jelly-swatch" viewBox="56 36 144 190" aria-hidden="true">
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.1" stopColor={palette.hex} />
          <stop offset="1" stopColor={palette.glow} />
        </linearGradient>
      </defs>
      <g fill={`url(#${fill})`} stroke={palette.outline} strokeWidth="7">
        <path d="M128 132c-42 0-66 26-66 62v8c0 12 9 20 22 20h88c13 0 22-8 22-20v-8c0-36-24-62-66-62Z" />
        <circle cx="128" cy="92" r="52" />
      </g>
      <ellipse
        cx="106"
        cy="62"
        rx="20"
        ry="10"
        fill="#fff"
        fillOpacity="0.75"
        transform="rotate(-18 106 62)"
      />
      <ellipse cx="110" cy="92" rx="6" ry="9" fill={palette.ink} />
      <ellipse cx="146" cy="92" rx="6" ry="9" fill={palette.ink} />
      <path
        d="M120 110q8 7 16 0"
        fill="none"
        stroke={palette.ink}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

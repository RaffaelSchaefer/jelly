/**
 * Strich-Icons als Inline-SVG im 24er-Raster. Neue Icons: Namen in {@link IconName} ergänzen und den
 * Pfad in `paths` eintragen.
 *
 * @module
 */

/** Alle verfügbaren Icons. */
export type IconName =
  | "spark"
  | "food"
  | "drink"
  | "event"
  | "palette"
  | "settings"
  | "close"
  | "drag"
  | "minus"
  | "lock"
  | "check"
  | "gamepad"
  | "clock"
  | "droplet"
  | "trophy"
  | "moon"
  | "headset"
  | "beanie"
  | "partyhat"
  | "glasses"
  | "hood"
  | "crown"
  | "aura"
  | "ticket"
  | "send"
  | "sign"
  | "users"
  | "target"
  | "swords"
  | "rocket"
  | "flag"
  | "cube"
  | "dice";

/** SVG-Pfad (`d`) je Icon, 24 × 24, nur Konturen. */
const paths: Record<IconName, string> = {
  spark: "m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z",
  food: "M4 11h16M5 8c0-6 14-6 14 0H5Zm0 7h14M5 18h14M5 18v2h14v-2",
  drink: "M7 6h10l-1 15H8L7 6Zm6 0 2-4h4M8 11h8",
  event: "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 10h14m-10 5 2 2 4-4",
  palette:
    "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a1 1 0 0 1 0-2h3a6 6 0 0 0 6-6c0-3-4-6-9-6ZM7 10h.01M10 6h.01M16 7h.01M6 15h.01",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  close: "m6 6 12 12M6 18 18 6",
  drag: "M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01",
  minus: "M5 12h14",
  lock: "M7 11h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Zm1 0V8a4 4 0 0 1 8 0v3",
  check: "m5 12.5 4.5 4.5L19 7.5",
  gamepad:
    "M7 8h10a4 4 0 0 1 3.9 4.9l-.7 3a2 2 0 0 1-3.4.9L15 15H9l-1.8 1.8a2 2 0 0 1-3.4-.9l-.7-3A4 4 0 0 1 7 8Zm1 2.5v3M6.5 12h3m6-.5h.01m2 1.5h.01",
  clock: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 4v4l3 2",
  droplet: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5v1a3 3 0 0 0 3 3m8-4h3v1a3 3 0 0 1-3 3m-4 3v4m-3 3h6",
  moon: "M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5Z",
  headset:
    "M5 14v-2a7 7 0 0 1 14 0v2M5 13h1a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 6 19H5a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 5 13Zm13 0h1a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 19 19h-1a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 18 13Zm.5 6c0 1.5-2 2-5 2",
  beanie: "M5 16a7 7 0 0 1 14 0H5Zm-1 0h16v3H4v-3Zm8-7V6m0-3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
  partyhat: "M12 3l6 17H6l6-17Zm-3.5 10 6-2.5M7 17.5l8.5-3.5",
  glasses:
    "M4 10h5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Zm11 0h5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Zm-5 2.5h4M3 10l1-3m17 3-1-3",
  hood: "M5 20v-8a7 7 0 0 1 14 0v8M8 20v-7a4 4 0 0 1 8 0v7",
  crown: "M4 8l4 4 4-6 4 6 4-4-2 10H6L4 8Z",
  aura: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
  ticket:
    "M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.5a1.5 1.5 0 0 0 0 3V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.5a1.5 1.5 0 0 0 0-3V8Zm12-2v2m0 3v2m0 3v2",
  send: "M21 3 3 9.5l7.5 4 4 7.5L21 3Zm0 0L10.5 13.5",
  sign: "M5 3h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 14H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 3Zm7 11v8M8 8.5h8",
  users:
    "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20a6 6 0 0 1 12 0m.5-15.3a3.5 3.5 0 0 1 0 6.6m2 3.1A6 6 0 0 1 21 20",
  target: "M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0-3v5.5m0 9V22M2 12h5.5m9 0H22",
  swords: "M4 4l12 12m-3 3 6-6m-3 3 4.5 4.5M20 4l-6.5 6.5M10.5 13.5 8 16m-3-3 6 6m-3-3-4.5 4.5",
  rocket:
    "M12 3c3 2.5 4.5 6 4 11H8c-.5-5 1-8.5 4-11ZM8 11l-3 4v3l3.5-1.5M16 11l3 4v3l-3.5-1.5M10.5 17.5 12 21l1.5-3.5M12 9h.01",
  flag: "M6 21V3.5m0 1c2.5-1.5 4.5-.8 6.5 0s4 1.2 6 .2v9c-2 1-4 .6-6-.2s-4-1.5-6 0",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9",
  dice: "M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2.5 4.5h.01m7 0h.01M12 12h.01m-3.5 3.5h.01m7 0h.01",
};

/** Ein Icon in Textfarbe (`currentColor`). Rein dekorativ, Beschriftung kommt vom Button. */
export default function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

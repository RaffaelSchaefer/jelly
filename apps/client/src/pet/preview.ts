/**
 * Beispieldaten für die Browser-Vorschau, in der es weder Rust noch Server gibt.
 *
 * `PREVIEW_CATALOG` ist ein Auszug aus `GET /v1/catalog`, `PREVIEW_ME` ein Spieler auf Level 3.
 *
 * @module
 */

import { FRAME_RATE } from "./frameRate";
import { PET_SIZE, VOLUME, type Catalog, type Game, type Me, type Rules } from "./types";

/** Die Standardregeln des Servers, soweit die App sie kennt. */
export const PREVIEW_RULES: Rules = { near_distance: 6, xp_per_level: 100 };

/** Auszug aus dem Server-Katalog. */
export const PREVIEW_CATALOG: Catalog = {
  colors: [
    { key: "mint", label: "Aqua" },
    { key: "lilac", label: "Flieder" },
    { key: "peach", label: "Pfirsich" },
  ],
  emotes: [
    { key: "wave", label: "Winken" },
    { key: "dance", label: "Tanzen" },
    { key: "cheer", label: "Jubeln" },
    { key: "laugh", label: "Lachen" },
    { key: "sleep", label: "Schlafen" },
    { key: "love", label: "Herz" },
  ],
  partner_emotes: [
    { key: "hop", label: "Zusammen hüpfen" },
    { key: "spin", label: "Zusammen drehen" },
    { key: "wiggle", label: "Zusammen wackeln" },
  ],
  signs: [
    { key: "any", label: "Suche Mitspieler" },
    { key: "cs2", label: "Suche CS2" },
    { key: "lol", label: "Suche LoL" },
    { key: "rocket-league", label: "Suche Rocket League" },
    { key: "mario-kart", label: "Suche Mario Kart" },
    { key: "minecraft", label: "Suche Minecraft" },
    { key: "board-game", label: "Suche Brettspiel" },
    { key: "food", label: "Wer holt mit Essen?" },
  ],
  cosmetics: [
    {
      key: "headset",
      name: "Headset",
      scope: "permanent",
      slot: "head",
      colorable: false,
      unlock: "level",
      level: 2,
    },
    {
      key: "headset-neutral",
      name: "Headset schlicht",
      scope: "permanent",
      slot: "head",
      colorable: false,
      unlock: "level",
      level: 2,
    },
    {
      key: "beanie",
      name: "Mütze",
      scope: "permanent",
      slot: "head",
      colorable: true,
      unlock: "level",
      level: 3,
    },
    {
      key: "party-hat",
      name: "Party-Hut",
      scope: "permanent",
      slot: "head",
      colorable: false,
      unlock: "event",
    },
    {
      key: "pixel-glasses",
      name: "Pixel-Brille",
      scope: "permanent",
      slot: "face",
      colorable: false,
      unlock: "level",
      level: 5,
    },
    {
      key: "hood",
      name: "Kapuze",
      scope: "permanent",
      slot: "head",
      colorable: true,
      unlock: "level",
      level: 6,
    },
    {
      key: "crown",
      name: "Krone",
      scope: "lan",
      slot: "head",
      colorable: false,
      unlock: "level",
      level: 10,
    },
    {
      key: "golden-cup",
      name: "Goldener Pokal",
      scope: "permanent",
      slot: "hands",
      colorable: false,
      unlock: "award",
    },
  ],
  cosmetic_slots: [
    { key: "head", label: "Kopf" },
    { key: "hands", label: "Hände" },
    { key: "body", label: "Körper" },
    { key: "face", label: "Gesicht" },
    { key: "aura", label: "Aura" },
  ],
  cosmetic_colors: ["#ffffff", "#2b2d42", "#e5534b", "#ff9f43", "#ffd45c"],
  achievements: [
    {
      key: "hatched",
      title: "Frisch geschlüpft",
      description: "Willkommen auf der LAN!",
      scope: "permanent",
      secret: false,
      goal: 1,
    },
    {
      key: "hydrated",
      title: "Gut hydriert",
      description: "10 Getränke geholt.",
      scope: "lan",
      secret: false,
      goal: 10,
    },
    {
      key: "tournament",
      title: "Turnierheld",
      description: "Bei 3 Events mitgemacht.",
      scope: "lan",
      secret: false,
      goal: 3,
    },
    {
      key: "marathon",
      title: "Marathon",
      description: "10 Stunden am Stück aktiv.",
      scope: "lan",
      secret: false,
      goal: 10,
      record_unit: "Stunden",
    },
  ],
};

/** Ein Spieler auf Level 3, mitten in einer laufenden LAN. */
export const PREVIEW_ME: Me = {
  server_time: 0,
  last_event_id: 0,
  id: 0,
  name: "Pixel",
  color: "mint",
  equipped: {},
  hidden: false,
  lan: { slug: "vorschau", name: "Vorschau-LAN", active: true },
  xp: 235,
  level: 3,
  total_xp: 235,
  next_poke_at: 0,
  reports: { food_ready_at: 0, drink_ready_at: 0, reports_left: 8 },
  sign: null,
  follow: null,
  trip: null,
  lans_attended: 1,
  badges: [],
  cosmetics: ["headset", "headset-neutral", "beanie"],
  achievements: [{ key: "hatched", title: "Frisch geschlüpft", lan_slug: null, earned_at: 0 }],
  awards: [],
};

/** Startzustand der Oberfläche, solange Rust noch nichts geliefert hat. */
export const PREVIEW_GAME: Game = {
  settings: {
    reducedMotion: false,
    size: PET_SIZE.default,
    sound: true,
    volume: VOLUME.max,
    optimizedRendering: false,
    frameLimit: FRAME_RATE.default,
  },
  me: PREVIEW_ME,
  lan: {
    server_time: 0,
    current: { slug: "vorschau", name: "Vorschau-LAN", starts_at: 0, ends_at: 0 },
    next: null,
    rules: PREVIEW_RULES,
    joined: true,
  },
  serverUrl: "",
  secretRejected: false,
};

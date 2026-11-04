/**
 * Beispieldaten für die Browser-Vorschau, in der es weder Rust noch Server gibt.
 *
 * `PREVIEW_CATALOG` ist ein Auszug aus `GET /v1/catalog`, `PREVIEW_ME` ein Spieler auf Level 3.
 *
 * @module
 */

import { PET_SIZE, VOLUME, type Catalog, type Game, type Me, type StagePlayer } from "./types";

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
  partner_emotes: [],
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
    { key: "headset", name: "Headset", scope: "permanent", level: 2 },
    { key: "beanie", name: "Mütze", scope: "permanent", level: 3 },
    { key: "party-hat", name: "Party-Hut", scope: "permanent", requires_event: true },
    { key: "pixel-glasses", name: "Pixel-Brille", scope: "permanent", level: 5 },
    { key: "hood", name: "Kapuze", scope: "permanent", level: 6 },
    { key: "crown", name: "Krone", scope: "lan", level: 10 },
  ],
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
  cosmetic: null,
  hidden: false,
  lan: { slug: "vorschau", name: "Vorschau-LAN", active: true },
  xp: 235,
  level: 3,
  total_xp: 235,
  next_poke_at: 0,
  reports: { food_ready_at: 0, drink_ready_at: 0, reports_left: 8 },
  sign: null,
  follow_player_id: null,
  lans_attended: 1,
  badges: [],
  cosmetics: ["headset", "beanie"],
  achievements: [{ key: "hatched", title: "Frisch geschlüpft", lan_slug: null, earned_at: 0 }],
  awards: [],
};

/** Zwei andere Jellies auf der Bühne, damit das Panel „Dabei“ etwas zeigt. */
export const PREVIEW_PLAYERS: StagePlayer[] = [
  {
    id: 2,
    name: "Wabbel",
    color: "peach",
    cosmetic: null,
    level: 4,
    sign: "cs2",
    follow_player_id: null,
    last_seen_at: 0,
  },
  {
    id: 1,
    name: "Glibber",
    color: "lilac",
    cosmetic: "beanie",
    level: 2,
    sign: null,
    follow_player_id: null,
    last_seen_at: 0,
  },
];

/** Startzustand der Oberfläche, solange Rust noch nichts geliefert hat. */
export const PREVIEW_GAME: Game = {
  settings: { reducedMotion: false, size: PET_SIZE.default, sound: true, volume: VOLUME.max },
  me: PREVIEW_ME,
  lan: {
    server_time: 0,
    current: { slug: "vorschau", name: "Vorschau-LAN", starts_at: 0, ends_at: 0 },
    next: null,
    joined: true,
  },
  serverUrl: "",
  tokenRejected: false,
};

/**
 * Beispieldaten für die Browser-Vorschau, in der es weder Rust noch Server gibt.
 *
 * `PREVIEW_CATALOG` ist ein Auszug aus `GET /v1/catalog`, `PREVIEW_ME` ein Spieler auf Level 3 mit
 * drei Münzen. Hashes wie `#join` oder `#shop-pleite` holen andere Zustände in den Browser, die
 * Abfragen `?optimized`, `?ruhig` und `?fps=30` andere Einstellungen.
 *
 * @module
 */

import { FRAME_RATE } from "./frameRate";
import {
  PET_SIZE,
  VOLUME,
  type Catalog,
  type Game,
  type Me,
  type PetColor,
  type Rules,
  type ServerEvent,
  type Settings,
} from "./types";

/** Die Standardregeln des Servers, soweit die App sie kennt. */
export const PREVIEW_RULES: Rules = { near_distance: 6, xp_per_level: 100, coins_per_level: 1 };

/** Auszug aus dem Server-Katalog. */
export const PREVIEW_CATALOG: Catalog = {
  colors: [
    { key: "mint", label: "Aqua" },
    { key: "lilac", label: "Flieder" },
    { key: "peach", label: "Pfirsich" },
    { key: "lime", label: "Hellgrün" },
  ],
  emotes: [
    { key: "wave", label: "Winken" },
    { key: "dance", label: "Tanzen" },
    { key: "cheer", label: "Jubeln" },
    { key: "laugh", label: "Lachen" },
    { key: "sleep", label: "Schlafen" },
    { key: "love", label: "Herz" },
    { key: "shrug", label: "Schulterzucken" },
    { key: "point", label: "Zeigen" },
    { key: "think", label: "Grübeln" },
    { key: "angry", label: "Wütend" },
    { key: "sad", label: "Traurig" },
    { key: "shy", label: "Schüchtern" },
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
      unlock: "shop",
      price: 1,
    },
    {
      key: "headset-neutral",
      name: "Headset schlicht",
      scope: "permanent",
      slot: "head",
      colorable: false,
      unlock: "shop",
      price: 1,
    },
    {
      key: "beanie",
      name: "Mütze",
      scope: "permanent",
      slot: "head",
      colorable: true,
      unlock: "shop",
      price: 2,
    },
    {
      key: "sprout",
      name: "Spross",
      scope: "permanent",
      slot: "head",
      colorable: false,
      unlock: "shop",
      price: 2,
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
      unlock: "shop",
      price: 3,
    },
    {
      key: "hood",
      name: "Kapuze",
      scope: "permanent",
      slot: "head",
      colorable: true,
      unlock: "shop",
      price: 4,
    },
    {
      key: "crown",
      name: "Krone",
      scope: "lan",
      slot: "head",
      colorable: false,
      unlock: "shop",
      price: 6,
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
  coins: 3,
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

/** Die nächste LAN in `#join-nolan`. */
const PREVIEW_NEXT_LAN = {
  slug: "vorschau-2",
  name: "Vorschau-LAN 2",
  starts_at: Date.UTC(2027, 3, 16, 10),
  ends_at: Date.UTC(2027, 3, 18, 10),
};

/** Alle Hashes, mit denen `shop.html` in der Vorschau einen Zustand des Zauberladens zeigt. */
export const PREVIEW_SHOP_HASHES = [
  "#shop-pleite",
  "#shop-reich",
  "#shop-alles",
  "#shop-zu",
  "#shop-leer",
  "#shop-laden",
  "#shop-fehler",
  "#shop-langsam",
  "#shop-muenzen",
  "#shop-nacht",
  "#shop-doesen",
  "#shop-runen",
  "#shop-anprobe",
  "#shop-zauber",
] as const;

/** Ein Hash aus {@link PREVIEW_SHOP_HASHES}. */
export type PreviewShopHash = (typeof PREVIEW_SHOP_HASHES)[number];

/** Alles, was der Shop verkauft. */
const SHOP_KEYS = PREVIEW_CATALOG.cosmetics
  .filter((entry) => entry.unlock === "shop")
  .map((entry) => entry.key);

/** Der Stand mit geändertem Jelly. */
function withMe(game: Game, patch: Partial<Me>): Game {
  return { ...game, me: game.me && { ...game.me, ...patch } };
}

/**
 * Der Stand des Zauberladens je Hash. Uhrzeit, Dösen, Runen und Zauber der übrigen Hashes spielen
 * Zauberer und Bühne selbst, sie starten mit dem normalen Stand.
 */
const SHOP_GAMES: Readonly<Record<string, (game: Game) => Game>> = {
  "#shop-pleite": (game) => withMe(game, { coins: 0 }),
  "#shop-reich": (game) => withMe(game, { coins: 12, cosmetics: [] }),
  "#shop-alles": (game) => withMe(game, { coins: 2, cosmetics: SHOP_KEYS }),
  "#shop-zu": (game) => ({
    ...withMe(game, { coins: 0 }),
    lan: { ...game.lan, current: null, joined: null },
  }),
  "#shop-leer": (game) => ({ ...game, me: null }),
};

/**
 * Der Stand, mit dem die Vorschau startet. Die Zustände des Einstiegs und des Ladens gibt es sonst
 * nur mit Server, ein Hash in der Adresse holt sie in den Browser.
 */
export function previewGame(hash: string): Game {
  const shop = Object.hasOwn(SHOP_GAMES, hash) ? SHOP_GAMES[hash] : undefined;
  if (shop) return shop(PREVIEW_GAME);
  const { lan } = PREVIEW_GAME;
  switch (hash) {
    case "#join":
      return { ...PREVIEW_GAME, me: null, lan: { ...lan, joined: null } };
    case "#join-again":
      return { ...PREVIEW_GAME, lan: { ...lan, joined: false } };
    case "#join-lost":
      return { ...PREVIEW_GAME, me: null, secretRejected: true, lan: { ...lan, joined: null } };
    case "#join-nolan":
      return {
        ...PREVIEW_GAME,
        me: null,
        lan: { ...lan, current: null, next: PREVIEW_NEXT_LAN, joined: null },
      };
    default:
      return PREVIEW_GAME;
  }
}

/**
 * Der Beitritt in der Vorschau, ohne Server: Jeder Code gilt. „falsch“ zeigt die Fehlermeldung, die
 * wie aus Rust als Text kommt, und „offen“ bringt das Konto nicht in die laufende LAN. Ohne Name
 * bleibt das vorhandene Jelly.
 */
export function previewAccess(code: string, name?: string, color?: PetColor) {
  if (code === "falsch") return Promise.reject<never>("Dieser Code gilt nicht.");
  const me = name && color ? { ...PREVIEW_ME, name, color } : PREVIEW_ME;
  const lan = code === "offen" ? { ...PREVIEW_GAME.lan, joined: false } : PREVIEW_GAME.lan;
  return Promise.resolve({ seatAssigned: true, game: { ...PREVIEW_GAME, me, lan } });
}

/** Wie sich der Zauberladen in der Vorschau verhält, wo kein Server antwortet. */
export interface PreviewShop {
  /** Ob der Laden fertig lädt. Sonst bleibt das Gerüst stehen. */
  ready: boolean;
  /** Nach so vielen Millisekunden antwortet ein Kauf. */
  purchaseMs: number;
  /** Die Meldung, mit der jeder Kauf scheitert, sonst `null`. */
  purchaseError: string | null;
  /** Nach so vielen Millisekunden kommen eine Münze und ein Level dazu, `null` nie. */
  giftMs: number | null;
}

/** So verhält sich der Laden ohne Hash: Ein Kauf braucht eine Viertelsekunde. */
const PREVIEW_SHOP: PreviewShop = {
  ready: true,
  purchaseMs: 250,
  purchaseError: null,
  giftMs: null,
};

/** Was ein Hash daran ändert. */
const SHOP_BEHAVIOUR: Readonly<Record<string, Partial<PreviewShop>>> = {
  "#shop-laden": { ready: false },
  "#shop-fehler": { purchaseMs: 400, purchaseError: "Der Server hat den Kauf abgelehnt." },
  "#shop-langsam": { purchaseMs: 2000 },
  "#shop-muenzen": { giftMs: 5000 },
};

/** Wie sich der Zauberladen in der Vorschau mit `hash` verhält. */
export function previewShop(hash: string): PreviewShop {
  const change = Object.hasOwn(SHOP_BEHAVIOUR, hash) ? SHOP_BEHAVIOUR[hash] : {};
  return { ...PREVIEW_SHOP, ...change };
}

/**
 * Die Einstellungen der Vorschau mit den Abfragen der Adresse: `?optimized` schaltet den
 * optimierten Modus an, `?ruhig` reduziert die Bewegung und `?fps=30` begrenzt die Bildrate.
 */
export function previewSettings(search: string, settings: Settings): Settings {
  const query = new URLSearchParams(search);
  const fps = Number(query.get("fps"));
  return {
    ...settings,
    optimizedRendering: query.has("optimized") || settings.optimizedRendering,
    reducedMotion: query.has("ruhig") ? true : settings.reducedMotion,
    frameLimit: Number.isInteger(fps) && fps > 0 ? fps : settings.frameLimit,
  };
}

/**
 * Was der Server zum Level-Aufstieg der Vorschau (`#shop-muenzen`) schicken würde: die Münzen für
 * den Aufstieg und das neue Level. So zählt der Zauberer auch ohne Server mit.
 */
export function previewGiftEvents(level: number, coins: number): ServerEvent[] {
  const event = (type: string, payload: Record<string, unknown>) => ({
    id: 0,
    type,
    player_id: null,
    payload,
    created_at: 0,
  });
  return [
    event("coins.gained", { amount: coins, source: "level" }),
    event("level.up", { level: level + 1 }),
  ];
}

/** Ein Level-Aufstieg in der Vorschau (`#shop-muenzen`): ein Level mehr und seine Münzen. */
export function previewCoinGift(game: Game): Game {
  const { me } = game;
  if (!me) return game;
  const coins = me.coins + game.lan.rules.coins_per_level;
  return { ...game, me: { ...me, coins, level: me.level + 1 } };
}

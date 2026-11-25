/**
 * Beispieldaten für die Browser-Vorschau, in der es weder Rust noch Server gibt.
 *
 * `PREVIEW_CATALOG` ist ein Auszug aus `GET /v1/catalog`, `PREVIEW_ME` ein Spieler auf Level 3 mit
 * drei Münzen. Hashes wie `#join` oder `#shop-pleite` holen andere Zustände in den Browser, die
 * Abfragen `?optimized`, `?ruhig` und `?fps=30` andere Einstellungen. Mit `#shop-nerven` spielt die
 * Vorschau den Diebstahl von Funkelbarts Hut, mit `#shop-hutlos` trägt ihn gerade Mo. `#news`,
 * `#news-tower`, `#news-achievement`, `#news-presenter` und `#news-watching` lassen die Jelly-News
 * beginnen ({@link previewNewsEvent}).
 *
 * @module
 */

import { withEquipped } from "./cosmetics";
import { FRAME_RATE } from "./frameRate";
import { PREVIEW_CATALOG } from "./previewCatalog";
import {
  PET_SIZE,
  VOLUME,
  type Equipped,
  type Game,
  type Me,
  type PetColor,
  type Rules,
  type ServerEvent,
  type Settings,
  type WizardHat,
} from "./types";
import { WIZARD_HAT_KEY } from "./wizardHat";

export { PREVIEW_CATALOG };

/** Die Standardregeln des Servers, soweit die App sie kennt. */
export const PREVIEW_RULES: Rules = {
  near_distance: 6,
  xp_per_level: 100,
  coins_per_level: 1,
  wizard_hat_seconds: 300,
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
  wizard_hat: null,
  lans_attended: 1,
  badges: [],
  cosmetics: ["headset", "headset-neutral", "beanie"],
  achievements: [{ key: "hatched", title: "Frisch geschlüpft", lan_slug: null, earned_at: 0 }],
  awards: [],
};

/**
 * Mitternacht des letzten Donnerstags, heute eingeschlossen: Donnerstag bis Sonntag zeigt der
 * Zeitplan die LAN mittendrin.
 */
function lastThursday() {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 3) % 7));
  return day.getTime();
}

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
    current: { slug: "vorschau", name: "Vorschau-LAN", starts_at: lastThursday(), ends_at: 0 },
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
  "#shop-nerven",
  "#shop-hutlos",
] as const;

/** Ein Hash aus {@link PREVIEW_SHOP_HASHES}. */
export type PreviewShopHash = (typeof PREVIEW_SHOP_HASHES)[number];

/** Alles, was der Shop verkauft. */
const SHOP_KEYS = PREVIEW_CATALOG.cosmetics
  .filter((entry) => entry.unlock === "shop")
  .map((entry) => entry.key);

/** So lange trägt Mo in `#shop-hutlos` den Hut noch, wenn der Laden aufgeht. */
const PREVIEW_HAT_MS = 4 * 60_000;

/** Funkelbarts Hut bei einem anderen Jelly, bis `ends_at` in der Uhr des Geräts. */
function foreignHat(): WizardHat {
  return { holder_id: 7, holder_name: "Mo", ends_at: Date.now() + PREVIEW_HAT_MS };
}

/** Der Stand mit geändertem Jelly. */
function withMe(game: Game, patch: Partial<Me>): Game {
  return { ...game, me: game.me && { ...game.me, ...patch } };
}

/**
 * Der Stand des Zauberladens je Hash. Uhrzeit, Dösen, Runen, Zauber und Nerven der übrigen Hashes
 * spielen Zauberer und Bühne selbst, sie starten mit dem normalen Stand.
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
  "#shop-hutlos": (game) => withMe(game, { wizard_hat: foreignHat() }),
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
  /** Ob der geklaute Hut wie beim Server auf den Kopf des Jellys geht. */
  stealsHat: boolean;
}

/** So verhält sich der Laden ohne Hash: Ein Kauf braucht eine Viertelsekunde. */
const PREVIEW_SHOP: PreviewShop = {
  ready: true,
  purchaseMs: 250,
  purchaseError: null,
  giftMs: null,
  stealsHat: false,
};

/** Was ein Hash daran ändert. */
const SHOP_BEHAVIOUR: Readonly<Record<string, Partial<PreviewShop>>> = {
  "#shop-laden": { ready: false },
  "#shop-fehler": { purchaseMs: 400, purchaseError: "Der Server hat den Kauf abgelehnt." },
  "#shop-langsam": { purchaseMs: 2000 },
  "#shop-muenzen": { giftMs: 5000 },
  "#shop-nerven": { stealsHat: true },
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

/** So lange läuft eine Sendung der Vorschau, etwa so lange wie mit `news_seconds` des Servers. */
const PREVIEW_SHOW_MS = 90_000;

/** Mo liest in der Vorschau die Jelly-News vor, wenn es das eigene Jelly nicht tut. */
const PREVIEW_PRESENTER = 7;

/**
 * Was die Jelly-News der Vorschau melden, ohne das eigene Jelly. Jede Art Beitrag kommt vor, auch
 * ein dringender nächster Punkt: So hört man in der Vorschau jeden Tonfall des Vorlesers.
 */
function previewNews(now: number) {
  const next = { title: "CS2-Turnier", detail: "Finale auf der Hauptbühne", kind: "tournament" };
  return {
    top_xp: { player_id: 9, xp: 80 },
    achievements: [
      { player_id: 8, key: "tournament" },
      { player_id: 5, key: "hatched" },
    ],
    tallest_stack: [8, 9],
    next_item: { starts_at: now + 25 * 60_000, ends_at: null, ...next },
  };
}

/** Die News der Vorschau. */
type PreviewNews = ReturnType<typeof previewNews>;

/** Wer je Hash vorliest und wo das eigene Jelly `own` in den News vorkommt. */
const NEWS_SHOWS: Readonly<
  Record<string, (own: number, news: PreviewNews) => Record<string, unknown>>
> = {
  "#news": (own, news) => ({ news: { ...news, top_xp: { player_id: own, xp: 120 } } }),
  "#news-tower": (own, news) => ({ news: { ...news, tallest_stack: [8, own, 9] } }),
  "#news-achievement": (own, news) => ({
    news: { ...news, achievements: [{ player_id: own, key: "hydrated" }] },
  }),
  "#news-presenter": (own) => ({ presenter_id: own }),
  "#news-watching": () => ({}),
};

/**
 * Der Beginn der Jelly-News in der Vorschau, wie ihn der Server mit `gathering.changed` meldet:
 * `#news` nennt das eigene Jelly `ownId` mit den meisten XP, `#news-tower` im höchsten Turm und
 * `#news-achievement` mit einem Erfolg. Mit `#news-presenter` liest es vor, mit `#news-watching`
 * schaut es nur zu. `null` für jeden anderen Hash.
 */
export function previewNewsEvent(hash: string, ownId: number, now: number): ServerEvent | null {
  const show = Object.hasOwn(NEWS_SHOWS, hash) ? NEWS_SHOWS[hash] : undefined;
  if (!show) return null;
  const news = previewNews(now);
  const payload = {
    kind: "news",
    winner_id: null,
    ends_at: now + PREVIEW_SHOW_MS,
    presenter_id: PREVIEW_PRESENTER,
    news,
    ...show(ownId, news),
  };
  return { id: 0, type: "gathering.changed", player_id: null, payload, created_at: now };
}

/** Ein Level-Aufstieg in der Vorschau (`#shop-muenzen`): ein Level mehr und seine Münzen. */
export function previewCoinGift(game: Game): Game {
  const { me } = game;
  if (!me) return game;
  const coins = me.coins + game.lan.rules.coins_per_level;
  return { ...game, me: { ...me, coins, level: me.level + 1 } };
}

/**
 * Der Diebstahl in der Vorschau (`#shop-nerven`): Das Jelly trägt den Hut bis `endsAt` in der Uhr
 * des Geräts, wie es der Server über `equipped` zeigt.
 */
export function previewHatStolen(game: Game, endsAt: number): Game {
  const { me } = game;
  if (!me) return game;
  const wizard_hat = { holder_id: me.id, holder_name: me.name, ends_at: endsAt };
  return withMe(game, { wizard_hat, equipped: withEquipped(me.equipped, "head", WIZARD_HAT_KEY) });
}

/** Der Hut geht in der Vorschau zurück, und das Jelly trägt wieder `head` wie zuvor. */
export function previewHatBack(game: Game, head?: Equipped[string]): Game {
  const { me } = game;
  if (!me) return game;
  const back = (key: string | null) =>
    withEquipped(me.equipped, "head", key, head?.color ?? undefined);
  const equipped = me.equipped.head?.key === WIZARD_HAT_KEY ? back(head?.key ?? null) : me.equipped;
  return withMe(game, { wizard_hat: null, equipped });
}

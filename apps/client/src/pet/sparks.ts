/**
 * Die Funken des Zauberladens als reine Rechnung: Zufall mit Samen, Bögen, Funkenphysik und für
 * jeden Effekt ein Plan, wann welcher Funke oder welche Form wo erscheint.
 *
 * Gezeichnet wird in `shop/fx/sparksEngine.ts` auf einer Canvas über dem ganzen Fenster. Alle Lagen
 * sind Pixel im Fenster, alle Zeiten Millisekunden ab dem Abspielen, Größen hängen an `u`: Pixel je
 * Einheit der Szene bei z 0, wie `--u` auf der Bühne.
 *
 * @module
 */

/** Ein Punkt im Fenster, in Pixeln. */
export interface Point {
  x: number;
  y: number;
}

/** Die Bühne im Fenster, in Pixeln. */
export interface StageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Die Farben der Funken. `glow` ist das Leuchten des eigenen Jellys. */
export type FxTint = "gold" | "white" | "cyan" | "violet" | "glow";

/** Die Bilder der Funken: weicher Schein, Stern mit vier Zacken, Münze. */
export type FxSprite = "glow" | "star" | "coin";

/** Ein Funke. Ohne `path` fliegt er mit Tempo, Luftwiderstand und Schwerkraft. */
export interface SparkSpec {
  x: number;
  y: number;
  /** Tempo in px/s. */
  vx?: number;
  vy?: number;
  /** In px/s². */
  gravity?: number;
  /** Bremst je Sekunde um diesen Faktor (e-Basis). */
  drag?: number;
  life: number;
  /** Durchmesser in px. */
  size: number;
  sprite: FxSprite;
  tint: FxTint;
  /** Fester Weg statt Physik: die Lage beim Anteil 0 bis 1 seines Lebens. */
  path?: (t: number) => Point;
  /** `out` verblasst, `inOut` blendet auch ein. */
  fade?: "out" | "inOut";
  /** Dreht sich wie eine fliegende Münze. */
  flip?: boolean;
}

/** Eine Form: Blitz, Schockring, Lichtsäule oder ein kurzer Schein. */
export type ShapeSpec =
  | { shape: "flash" | "glow"; x: number; y: number; radius: number; life: number; tint: FxTint }
  | { shape: "ring"; x: number; y: number; from: number; to: number; life: number; tint: FxTint }
  | {
      shape: "pillar";
      x: number;
      bottom: number;
      top: number;
      width: number;
      life: number;
      tint: FxTint;
    };

/** Ein Schritt eines Plans: ab `at` ms ein Funke, eine Form oder die Landung der Münze `land`. */
export interface Spawn {
  at: number;
  spark?: SparkSpec;
  shape?: ShapeSpec;
  land?: number;
}

/** Was ein Plan wissen muss. */
export interface PlanContext {
  /** Pixel je Szenen-Einheit. */
  u: number;
  box: StageBox;
  random: () => number;
  /** Anteil der Funken: 1 voll, weniger im leichten Modus. */
  density: number;
}

/** Zufall mit Samen: dieselbe Folge für denselben Samen. Werte von 0 bis unter 1. */
export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ein Punkt auf der kubischen Bézierkurve durch `points` beim Anteil `t`. */
export function bezier([p0, p1, p2, p3]: readonly [Point, Point, Point, Point], t: number): Point {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const c = 3 * s * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Der Bogen des Zaubers von der Kugel zum Ziel: Die Stützpunkte liegen 18 % der Bühnenhöhe über dem
 * höheren Ende, aber nie über 30 % von oben. Die Kurve bleibt in ihrer Hülle und so unter der
 * Sprechblase.
 */
export function spellArc(from: Point, to: Point, box: StageBox): [Point, Point, Point, Point] {
  const ceiling = box.top + 0.3 * box.height;
  const y = Math.max(ceiling, Math.min(from.y, to.y) - 0.18 * box.height);
  const dx = to.x - from.x;
  return [from, { x: from.x + dx / 3, y }, { x: from.x + (2 * dx) / 3, y }, to];
}

/**
 * Wo eine Münze beim Anteil `t` ihres Flugs ist: waagerecht gleichmäßig, senkrecht auf einem Bogen,
 * dessen Scheitel `apex` px über dem Start liegt.
 */
export function coinPoint(from: Point, to: Point, apex: number, t: number): Point {
  const top = from.y - apex;
  const control = top - Math.sqrt(Math.max(0, apex * (apex + to.y - from.y)));
  const s = 1 - t;
  return {
    x: from.x + (to.x - from.x) * t,
    y: s * s * from.y + 2 * s * t * control + t * t * to.y,
  };
}

/**
 * Wie hoch eine Münze über ihren Start hüpft, bevor sie in die Schale fällt: ein kleiner Bogen von
 * höchstens 3 % der Bühnenhöhe, der aber zwei Münzen Abstand zum oberen Fensterrand hält. Die Börse
 * sitzt im Kopf des Fensters, so fällt die Münze dort meist gleich.
 */
export function coinApex(from: Point, box: StageBox, size: number) {
  return Math.max(0, Math.min(0.03 * box.height, from.y - 2 * size));
}

/** Wie breit eine fliegende Münze beim Anteil `t` erscheint: Sie dreht sich viereinhalb Mal. */
export function coinFlip(t: number) {
  return Math.max(0.15, Math.abs(Math.cos(9 * Math.PI * t)));
}

/** Ein bewegter Funke für {@link stepSpark}: Lage, Tempo, Schwerkraft und Luftwiderstand. */
export type Motion = Record<"x" | "y" | "vx" | "vy" | "gravity" | "drag", number>;

/** Bewegt einen Funken um `dt` Sekunden: erst bremsen, dann fallen, dann fliegen. */
export function stepSpark(spark: Motion, dt: number) {
  const keep = Math.exp(-spark.drag * dt);
  spark.vx *= keep;
  spark.vy = spark.vy * keep + spark.gravity * dt;
  spark.x += spark.vx * dt;
  spark.y += spark.vy * dt;
}

/** Eine Zahl zwischen `min` und `max`. */
function between(random: () => number, min: number, max: number) {
  return min + (max - min) * random();
}

/** So viele Funken im aktuellen Modus, mindestens einer. */
function count(context: PlanContext, full: number) {
  return Math.max(1, Math.round(full * context.density));
}

/** Eine Farbe aus `tints`, reihum. */
function pick(tints: readonly FxTint[], index: number): FxTint {
  return tints[index % tints.length] ?? "gold";
}

/** Wie ein Schwarm Funken aussieht: Anzahl, Tempo, Lebensdauer und Größe in Einheiten. */
export interface BurstLook {
  count: number;
  /** Tempo in Einheiten/s, in zufälliger Richtung. */
  speed: readonly [number, number];
  life: readonly [number, number];
  size: number;
  tints: readonly FxTint[];
  drag?: number;
  /** In Einheiten/s². */
  gravity?: number;
  /** Zusätzlich nach oben, in Einheiten/s. */
  lift?: number;
  /** So weit (Einheiten) um den Punkt streuen sie beim Start. */
  spread?: number;
  /** Jeder so vielte Funke ist ein Stern. */
  stars?: number;
  fade?: SparkSpec["fade"];
}

/** Funken, die von `at` aus auseinanderstieben, alle ab `start` ms. */
export function burst(context: PlanContext, at: Point, start: number, look: BurstLook): Spawn[] {
  const { u, random } = context;
  const spread = (look.spread ?? 0) * u;
  return Array.from({ length: count(context, look.count) }, (_, index) => {
    const angle = between(random, 0, 2 * Math.PI);
    const speed = between(random, ...look.speed) * u;
    const spark: SparkSpec = {
      x: at.x + between(random, -spread, spread),
      y: at.y + between(random, -spread, spread) * 0.6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (look.lift ?? 0) * u,
      gravity: (look.gravity ?? 0) * u,
      drag: look.drag ?? 3,
      life: between(random, ...look.life),
      size: look.size * u * between(random, 0.7, 1.2),
      sprite: look.stars && index % look.stars === 0 ? "star" : "glow",
      tint: pick(look.tints, index),
      fade: look.fade,
    };
    return { at: start, spark };
  });
}

/** Ein Funke auf einer Spirale um `center`: von Radius `from` nach `to` mit `turns` Umdrehungen. */
export function spiral(
  center: Point,
  angle: number,
  radii: readonly [number, number],
  turns: number,
) {
  return (t: number): Point => {
    const radius = radii[0] + (radii[1] - radii[0]) * t;
    const turn = angle + turns * 2 * Math.PI * t;
    return { x: center.x + radius * Math.cos(turn), y: center.y + radius * Math.sin(turn) };
  };
}

/** Wie ein kurzer Schein aussieht: Radius in Einheiten, Dauer, Farbe. */
export interface GlowLook {
  radius: number;
  life: number;
  tint: FxTint;
}

/** Ein kurzer Schein: im ruhigen Modus der ganze Effekt, sonst Glanz einer Landung oder Anprobe. */
export function glowAt(context: PlanContext, at: Point, start: number, look: GlowLook): Spawn {
  const radius = look.radius * context.u;
  return {
    at: start,
    shape: { shape: "glow", x: at.x, y: at.y, life: look.life, tint: look.tint, radius },
  };
}

/** Funken, die auf Spiralen in `at` hineinkreisen, alle `every` ms einer. */
export function inward(context: PlanContext, at: Point, look: InwardLook): Spawn[] {
  const { u, random } = context;
  return Array.from({ length: look.count }, (_, index): Spawn => {
    const outer = between(random, ...look.radius) * u;
    const path = spiral(at, between(random, 0, 2 * Math.PI), [outer, 0.06 * u], look.turns);
    const life = look.life ?? between(random, 550, 750);
    const tint = pick(look.tints, index);
    const sprite = look.stars && index % look.stars === 0 ? "star" : "glow";
    const spark: SparkSpec = {
      ...path(0),
      path,
      life,
      size: look.size * u,
      sprite,
      tint,
      fade: "inOut",
    };
    return { at: index * look.every, spark };
  });
}

/** Was {@link inward} braucht. */
export interface InwardLook {
  count: number;
  every: number;
  radius: readonly [number, number];
  turns: number;
  size: number;
  tints: readonly FxTint[];
  life?: number;
  stars?: number;
}

/** Farbfolgen der Schwärme. */
const WARM = ["gold", "white"] as const;
const BRIGHT = ["gold", "white", "glow"] as const;
const MAGIC = ["violet", "cyan", "white"] as const;
/** Jeder fünfte Funke des Einschlags leuchtet in der Farbe des Kunden. */
const SPELL_TINTS = ["gold", "white", "violet", "white", "glow"] as const;

/** Ein Schwarm: Anzahl, Tempo (Einheiten/s), Lebensdauer (ms) und Größe (Einheiten). */
function look(count: number, speed: [number, number], life: [number, number], size: number) {
  return { count, speed, life, size };
}

/** Die Schwärme der Effekte. */
export const FX_LOOKS = {
  swirlPop: { ...look(12, [3.6, 4.8], [300, 420], 0.1), drag: 8, tints: BRIGHT },
  glint: { ...look(5, [0.8, 1.4], [300, 450], 0.08), drag: 4, tints: WARM },
  puff: { ...look(12, [1.2, 2], [500, 700], 0.12), drag: 4, lift: 0.5, tints: BRIGHT },
  wax: { ...look(10, [1.5, 3], [300, 480], 0.08), drag: 5, gravity: 2, tints: WARM },
  fizzle: { ...look(10, [0.6, 1.6], [380, 650], 0.08), gravity: 4, lift: 1.2, tints: MAGIC },
  clink: { ...look(6, [0.8, 1.6], [260, 360], 0.07), gravity: 3, lift: 0.8, tints: WARM },
  impact: { ...look(40, [2.2, 5.8], [700, 1100], 0.12), drag: 3.5, stars: 3, tints: SPELL_TINTS },
} satisfies Record<string, BurstLook>;

/** Ablegen: acht silberne Funken steigen 0,4 Einheiten auf und verwehen in 700 ms. */
export const DRIFT: BurstLook = {
  ...look(8, [0, 0.1], [650, 700], 0.09),
  drag: 0,
  lift: 0.57,
  spread: 0.35,
  tints: ["white"],
  fade: "inOut",
};

/** Eine Ware, die man schon besitzt: ein Stern blinkt, fünf Funken springen ab. */
export function planGlint(context: PlanContext, at: Point): Spawn[] {
  const star = { ...at, life: 450, size: 0.36 * context.u, fade: "inOut" } as const;
  return [
    { at: 0, spark: { ...star, sprite: "star", tint: "white" } },
    ...burst(context, at, 80, FX_LOOKS.glint),
  ];
}

/** Die Ladung: Funken kreisen von außen in die Kugel, bis zu `ms` lang. */
export function planCharge(context: PlanContext, at: Point, ms: number): Spawn[] {
  const every = 43 / context.density;
  const look = { every, radius: [0.55, 0.8], turns: 0.6, size: 0.14, tints: MAGIC } as const;
  return inward(context, at, { ...look, count: Math.floor(ms / every) });
}

/** Ein Zauber misslingt: Funken stottern aus der Kugel und fallen, dazu ein fahler Schein. */
export function planFizzle(context: PlanContext, at: Point): Spawn[] {
  const glow = glowAt(context, at, 0, { radius: 0.35, life: 300, tint: "violet" });
  return [...burst(context, at, 0, FX_LOOKS.fizzle), glow];
}

/** Was die Münzen brauchen: von wo nach wo, wann sie abfliegen und wie lange sie fliegen. */
export interface CoinRun {
  from: Point;
  to: Point;
  launchesMs: readonly number[];
  flightMs: number;
}

/**
 * Wie groß eine fliegende Münze ist, in Pixeln: so groß wie die Münze der Börse, aus der sie kommt,
 * und auch auf kleiner Bühne mindestens 14 px. Sonst flögen nur Funken über den Hut.
 */
export const COIN_LOOK = { size: 0.24, minPx: 14, trail: 0.1 } as const;

/** Münzen fliegen von der Börse in die Schale, je mit drei Funken als Spur und einem Klirren. */
export function planCoins(context: PlanContext, run: CoinRun): Spawn[] {
  const { u } = context;
  const { from, to, flightMs } = run;
  const size = Math.max(COIN_LOOK.size * u, COIN_LOOK.minPx);
  const apex = coinApex(from, context.box, size);
  return run.launchesMs.flatMap((launch, index): Spawn[] => {
    const path = (t: number) => coinPoint(from, to, apex, t);
    const coin: SparkSpec = {
      ...from,
      path,
      life: flightMs,
      size,
      sprite: "coin",
      tint: "gold",
      flip: true,
    };
    const trail = [0.25, 0.5, 0.75].map((t): Spawn => {
      const look = {
        gravity: 1.5 * u,
        drag: 2,
        life: 260,
        size: COIN_LOOK.trail * u,
        sprite: "glow",
      } as const;
      return { at: launch + t * flightMs, spark: { ...path(t), ...look, tint: "gold" } };
    });
    const land = launch + flightMs;
    return [
      { at: launch, spark: coin },
      ...trail,
      ...burst(context, to, land, FX_LOOKS.clink),
      glowAt(context, to, land, { radius: 0.22, life: 200, tint: "gold" }),
      { at: land, land: index },
    ];
  });
}

/** Was der Kaufzauber braucht: Kugel, Ziel, Füße des Kunden und die Zeiten ab jetzt. */
export interface SpellRun {
  from: Point;
  to: Point;
  feet: Point;
  burstMs: number;
  impactMs: number;
}

/** Der Schweif: Funken entlang des Bogens, ±6 px (bei 288 px Bühne) in sechs Windungen darum. */
function comet(context: PlanContext, arc: [Point, Point, Point, Point], run: SpellRun): Spawn[] {
  const { u, random, box } = context;
  const total = count(context, 72);
  const wind = (6 * box.height) / 288;
  return Array.from({ length: total }, (_, index): Spawn => {
    const t = index / total;
    const point = bezier(arc, t);
    const ahead = bezier(arc, t + 0.01);
    const along = Math.hypot(ahead.x - point.x, ahead.y - point.y) || 1;
    const offset = (wind * Math.sin(12 * Math.PI * t)) / along;
    const ember = index % 4 === 3;
    const spark: SparkSpec = {
      x: point.x - (ahead.y - point.y) * offset,
      y: point.y + (ahead.x - point.x) * offset,
      vx: between(random, -0.3, 0.3) * u,
      vy: between(random, -0.3, 0.3) * u,
      gravity: ember ? 3.6 * u : 0,
      drag: ember ? 0.5 : 2.5,
      life: ember ? between(random, 600, 900) : between(random, 300, 480),
      size: (ember ? 0.07 : 0.12) * u,
      sprite: index % 6 === 0 ? "star" : "glow",
      tint: ember ? "gold" : pick(MAGIC, index),
    };
    return { at: run.burstMs + t * (run.impactMs - run.burstMs), spark };
  });
}

/** Der Einschlag: Blitz, Schockringe, 40 Funken und eine Lichtsäule von den Füßen aufwärts. */
function impact(context: PlanContext, run: SpellRun): Spawn[] {
  const { u, box } = context;
  const { to, impactMs: at } = run;
  const ring = { shape: "ring", x: to.x, y: to.y, from: 0.2 * u, to: 1.6 * u, life: 650 } as const;
  const top = box.top + 0.187 * box.height;
  const pillar = { x: run.feet.x, bottom: run.feet.y, top, width: 1.7 * u, life: 900 } as const;
  const rings: Spawn[] = [{ at, shape: { ...ring, tint: "gold" } }];
  if (context.density >= 1) rings.push({ at: at + 120, shape: { ...ring, tint: "violet" } });
  return [
    { at, shape: { shape: "flash", x: to.x, y: to.y, radius: 0.55 * u, life: 280, tint: "white" } },
    ...rings,
    ...burst(context, to, at, FX_LOOKS.impact),
    { at, shape: { shape: "pillar", ...pillar, tint: "gold" } },
  ];
}

/** Der Kaufzauber: Die Kugel blitzt, ein Komet fliegt auf dem Bogen zum Ziel und schlägt dort ein. */
export function planSpell(context: PlanContext, run: SpellRun): Spawn[] {
  const { u } = context;
  const arc = spellArc(run.from, run.to, context.box);
  const path = (t: number) => bezier(arc, t);
  const life = run.impactMs - run.burstMs;
  const head = { ...run.from, path, life } as const;
  return [
    glowAt(context, run.from, run.burstMs, { radius: 0.4, life: 220, tint: "violet" }),
    { at: run.burstMs, spark: { ...head, size: 0.7 * u, sprite: "glow", tint: "violet" } },
    { at: run.burstMs, spark: { ...head, size: 0.34 * u, sprite: "star", tint: "white" } },
    ...comet(context, arc, run),
    ...impact(context, run),
  ];
}

/**
 * Alle kurzen Effekte des Zauberladens auf einer Canvas über dem ganzen Fenster: Wirbel der
 * Anprobe, Glanz, Wölkchen und Hauch, Wachsspritzer, die Ladung der Kugel, fliegende Münzen, der
 * Kaufzauber und ein misslungener Zauber.
 *
 * {@link shopFx} gibt es einmal je Fenster. `ShopFx.tsx` hängt die Canvas ein, der Laden spielt
 * Effekte mit `play`, alle Zeiten in Millisekunden ab jetzt. Der Takt läuft nur, solange etwas lebt
 * oder ansteht, und endet 100 ms danach. Was wann wo erscheint, rechnet `pet/sparks.ts`, gemalt
 * wird mit `fxAtlas.ts`.
 *
 * @module
 */

import { createFramePacer } from "@jelly/stage/frame-pacing";

import { STAGE_SPOTS, unitPx, type StagePoint, type StageSpotName } from "../../pet/shopStage";
import { TRY_ON } from "../../pet/shopTimeline";
import {
  burst,
  DRIFT,
  FX_LOOKS,
  glowAt,
  inward,
  mulberry32,
  planCharge,
  planCoins,
  planFizzle,
  planGlint,
  planSpell,
  stepSpark,
  type FxTint,
  type Motion,
  type PlanContext,
  type Point,
  type SparkSpec,
  type Spawn,
  type StageBox,
} from "../../pet/sparks";
import { createFxAtlas, drawShape, placeSpark, type FxAtlas, type LiveShape } from "./fxAtlas";

/** Wohin ein Effekt zielt: ein benannter Punkt der Bühne oder ein Punkt im Fenster in Pixeln. */
export type FxTarget = StageSpotName | Point;

/** Ein Effekt. Alle Zeiten in ms ab jetzt, `delayMs` schiebt den ganzen Effekt. */
export type FxEffect = { delayMs?: number } & (
  | { kind: "swirl"; at: FxTarget; popMs?: number }
  | { kind: "glint" | "puff" | "drift" | "wax"; at: FxTarget }
  | { kind: "charge" | "fizzle"; at?: FxTarget }
  | {
      kind: "coins";
      /** Ohne Angabe die Münze der Börse (`[data-coin-source]`). */
      from?: FxTarget;
      /** Ohne Angabe die Schale (`.stage-tray`). */
      to?: FxTarget;
      launchesMs: readonly number[];
      flightMs: number;
      /** Münze `index` ist gelandet. Kommt auch im ruhigen Modus und ohne Bühne pünktlich. */
      onLand?: (index: number) => void;
    }
  | {
      kind: "spell";
      from?: FxTarget;
      to: FxTarget;
      feet?: FxTarget;
      burstMs: number;
      impactMs: number;
    }
);

/** Die Art eines Effekts, etwa für `cancel`. */
export type FxKind = FxEffect["kind"];

/** Die fliegenden Münzen und der Kaufzauber. */
type CoinsEffect = Extract<FxEffect, { kind: "coins" }>;
type SpellEffect = Extract<FxEffect, { kind: "spell" }>;

/** Wie die Effekte laufen. */
export interface FxOptions {
  /** Bilder pro Sekunde, `null` unbegrenzt. */
  frameLimit: number | null;
  /** Optimierte Darstellung: höchstens 80 Funken, normal gemischt, ohne hohe Pixeldichte. */
  lite: boolean;
  /** Reduzierte Bewegung: statt Funken nur kurze Scheine bis 300 ms. */
  calm: boolean;
  /** Leuchtfarbe des Kunden. */
  glow: string;
}

/** Was die Effekte gerade tun, für Prüfungen im Browser. */
export type FxState = Record<"sparks" | "shapes" | "pending", number> & { running: boolean };

/** So viele Funken leben höchstens, im leichten Modus weniger. */
const POOL = 240;
const LITE_POOL = 80;
const LITE_DENSITY = 0.4;
const MAX_DPR = 1.5;
/** So lange läuft der Takt weiter, nachdem alles vorbei ist. */
const LINGER_MS = 100;
/** So viel früher weckt ein Zeitgeber den Takt für das nächste, was ansteht. */
const WAKE_EARLY_MS = 20;
/** Längste Ladung der Kugel. */
const CHARGE_MS = 3000;
/** Ersatz für die Münze der Börse, in Prozent der Bühne. */
const PURSE_FALLBACK: StagePoint = { left: 88, top: 12 };

/** Ein Funke im Vorrat. */
type LiveSpark = Motion & { live: boolean; kind: FxKind; born: number; spec: SparkSpec };

/** Ein Schritt, der noch ansteht. Gelandete Münzen meldet `onLand`. */
type Pending = { due: number; kind: FxKind; spawn: Spawn; onLand?: (index: number) => void };

/** Die Bühne im Fenster, oder `null` ohne Bühne. */
function stageBox(): StageBox | null {
  const stage = document.querySelector<HTMLElement>(".shop-stage");
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  const { clientLeft, clientTop, clientWidth: width, clientHeight: height } = stage;
  return { left: rect.left + clientLeft, top: rect.top + clientTop, width, height };
}

/** Ein Punkt der Bühne in Prozent als Punkt im Fenster. */
function onStage(box: StageBox, { left, top }: StagePoint): Point {
  return { x: box.left + (left / 100) * box.width, y: box.top + (top / 100) * box.height };
}

/** Die Mitte des ersten Elements zu `selector`, oder `null`. */
function centerOf(selector: string): Point | null {
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Löst ein Ziel auf der Bühne `box` auf. */
function placer(box: StageBox) {
  return (target: FxTarget | undefined, fallback: StageSpotName): Point => {
    const spot = target ?? fallback;
    return typeof spot === "string" ? onStage(box, STAGE_SPOTS[spot]) : spot;
  };
}

/** Wo Münzen abfliegen und landen. */
function coinEnds(effect: CoinsEffect, box: StageBox) {
  const place = placer(box);
  const from = effect.from ? place(effect.from, "tray") : centerOf("[data-coin-source]");
  const to = effect.to ? place(effect.to, "tray") : centerOf(".stage-tray");
  return { from: from ?? onStage(box, PURSE_FALLBACK), to: to ?? place(undefined, "tray") };
}

/** Der Plan eines Effekts, mit Funken. */
function fullPlan(context: PlanContext, effect: FxEffect, box: StageBox): Spawn[] {
  const place = placer(box);
  switch (effect.kind) {
    case "swirl":
      return swirlPlan(context, place(effect.at, "slotHead"), effect.popMs);
    case "glint":
      return planGlint(context, place(effect.at, "slotHead"));
    case "puff":
      return burst(context, place(effect.at, "slotHead"), 0, FX_LOOKS.puff);
    case "drift":
      return burst(context, place(effect.at, "slotHead"), 0, DRIFT);
    case "wax":
      return burst(context, place(effect.at, "orb"), 0, FX_LOOKS.wax);
    case "charge":
      return planCharge(context, place(effect.at, "orb"), CHARGE_MS);
    case "fizzle":
      return planFizzle(context, place(effect.at, "orb"));
    case "coins":
      return planCoins(context, { ...effect, ...coinEnds(effect, box) });
    case "spell":
      return spellPlan(context, effect, box);
  }
}

/** Die Anprobe: Funken kreisen bis zum Aufspringen auf den Platz zu, dann stieben sie auseinander. */
function swirlPlan(context: PlanContext, at: Point, popMs: number = TRY_ON.pop): Spawn[] {
  const count = Math.max(1, Math.round(18 * context.density));
  const tints = ["gold", "white"] as const;
  const look = { count, every: 0, radius: [0.45, 0.55], turns: 0.8, size: 0.13, stars: 3 } as const;
  return [
    ...inward(context, at, { ...look, life: popMs, tints }),
    ...burst(context, at, popMs, FX_LOOKS.swirlPop),
    glowAt(context, at, popMs, { radius: 0.3, life: 260, tint: "white" }),
  ];
}

/** Der Kaufzauber von der Kugel zum Ziel, die Säule steht auf den Füßen des Kunden. */
function spellPlan(context: PlanContext, effect: SpellEffect, box: StageBox) {
  const place = placer(box);
  const ends = { from: place(effect.from, "orb"), to: place(effect.to, "slotFace") };
  return planSpell(context, { ...effect, ...ends, feet: place(effect.feet, "feet") });
}

/** Wo und wann ein Effekt im ruhigen Modus kurz aufscheint, und in welcher Farbe. */
function calmSpot(effect: FxEffect, box: StageBox): { at: Point; ms: number; tint: FxTint } {
  const place = placer(box);
  if (effect.kind === "coins")
    return { at: coinEnds(effect, box).to, ms: lastLanding(effect), tint: "gold" };
  if (effect.kind === "spell")
    return { at: place(effect.to, "slotFace"), ms: effect.impactMs, tint: "white" };
  if (effect.kind === "swirl")
    return { at: place(effect.at, "slotHead"), ms: effect.popMs ?? TRY_ON.pop, tint: "gold" };
  const orb = effect.kind === "charge" || effect.kind === "fizzle";
  return { at: place(effect.at, orb ? "orb" : "slotHead"), ms: 0, tint: orb ? "violet" : "gold" };
}

/** Wann die letzte Münze landet. */
function lastLanding({ launchesMs, flightMs }: CoinsEffect) {
  return Math.max(0, ...launchesMs) + flightMs;
}

/** Die Landungen der Münzen, ohne Bild: Sie kommen immer. */
function landings(effect: FxEffect): Spawn[] {
  if (effect.kind !== "coins") return [];
  return effect.launchesMs.map((launch, index) => ({ at: launch + effect.flightMs, land: index }));
}

/** Ein leerer Platz im Vorrat. */
function emptySpark(): LiveSpark {
  const spec: SparkSpec = { x: 0, y: 0, life: 1, size: 0, sprite: "glow", tint: "gold" };
  const motion = { x: 0, y: 0, vx: 0, vy: 0, gravity: 0, drag: 0 };
  return { ...motion, live: false, kind: "glint", born: 0, spec };
}

/** Wie die Effekte ohne `configure` laufen. */
const DEFAULT_OPTIONS: FxOptions = { frameLimit: 30, lite: false, calm: false, glow: "#9fe8ff" };

/** Die Effekte eines Fensters: Vorrat, Warteschlange, Takt und Canvas. */
class SparkEngine {
  private readonly options = { ...DEFAULT_OPTIONS };
  private readonly pacer = createFramePacer(30);
  private readonly pool = Array.from({ length: POOL }, emptySpark);
  private readonly view = { width: 0, height: 0, dpr: 1 };
  private shapes: LiveShape[] = [];
  private queue: Pending[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private paint: CanvasRenderingContext2D | null = null;
  private atlas: FxAtlas | null = null;
  private frame = 0;
  private running = false;
  private lastTick = 0;
  private emptySince: number | null = null;
  private wake = 0;
  private seed = 1;

  /** Spielt einen Effekt. */
  play = (effect: FxEffect) => {
    const due = performance.now() + (effect.delayMs ?? 0);
    const onLand = effect.kind === "coins" ? effect.onLand : undefined;
    for (const spawn of this.plan(effect)) {
      this.queue.push({ due: due + spawn.at, kind: effect.kind, spawn, onLand });
    }
    this.queue.sort((a, b) => a.due - b.due);
    this.start();
  };

  /** Bricht ab, was von dieser Art noch ansteht. Ohne Art auch alles, was gerade zu sehen ist. */
  cancel = (kind?: FxKind) => {
    this.queue = kind ? this.queue.filter((item) => item.kind !== kind) : [];
    if (kind) return;
    this.shapes = [];
    for (const spark of this.pool) spark.live = false;
  };

  /** Übernimmt Bildrate, Modus und Leuchtfarbe. */
  configure = (next: Partial<FxOptions>) => {
    const { frameLimit } = next;
    if (frameLimit !== undefined && frameLimit !== this.options.frameLimit) {
      this.pacer.setLimit(frameLimit);
    }
    Object.assign(this.options, next);
    if (next.glow) this.atlas?.setGlow(next.glow);
    if (this.running) this.fit();
  };

  /** Wo ein Punkt der Bühne im Fenster liegt, in Pixeln. Ohne Bühne `null`. */
  stagePoint = (spot: StageSpotName | StagePoint): Point | null => {
    const box = stageBox();
    if (!box) return null;
    return onStage(box, typeof spot === "string" ? STAGE_SPOTS[spot] : spot);
  };

  /** Hängt die Canvas ein, auf die gemalt wird. */
  attach = (canvas: HTMLCanvasElement) => {
    this.canvas = canvas;
    this.paint = canvas.getContext("2d");
    this.atlas ??= createFxAtlas(this.options.glow);
    if (!this.running) {
      if (this.queue.length > 0) this.start();
      return;
    }
    this.fit();
    canvas.setAttribute("data-active", "");
  };

  /** Hängt die Canvas wieder aus, nur wenn es noch dieselbe ist. */
  detach = (canvas: HTMLCanvasElement) => {
    if (this.canvas !== canvas) return;
    this.stop();
    this.canvas = null;
    this.paint = null;
  };

  /** Was gerade läuft, für Prüfungen im Browser. */
  inspect = (): FxState => ({
    running: this.running,
    sparks: this.pool.filter((spark) => spark.live).length,
    shapes: this.shapes.length,
    pending: this.queue.length,
  });

  /** Der Plan eines Effekts: ohne Bühne nur die Landungen, ruhig nur ein kurzer Schein. */
  private plan(effect: FxEffect): Spawn[] {
    const box = stageBox();
    if (!box) return landings(effect);
    const random = mulberry32(Math.floor(performance.now()) * 7919 + this.seed++);
    const density = this.options.lite ? LITE_DENSITY : 1;
    const context = { u: unitPx(box.height), box, random, density };
    if (!this.options.calm) return fullPlan(context, effect, box);
    const { at, ms, tint } = calmSpot(effect, box);
    return [glowAt(context, at, ms, { radius: 0.45, life: 300, tint }), ...landings(effect)];
  }

  /** Passt die Canvas ans Fenster an. */
  private fit = () => {
    this.view.width = window.innerWidth;
    this.view.height = window.innerHeight;
    this.view.dpr = this.options.lite ? 1 : Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (!this.canvas) return;
    this.canvas.width = Math.round(this.view.width * this.view.dpr);
    this.canvas.height = Math.round(this.view.height * this.view.dpr);
  };

  private start() {
    window.clearTimeout(this.wake);
    if (this.running) return;
    this.running = true;
    this.fit();
    window.addEventListener("resize", this.fit);
    this.canvas?.setAttribute("data-active", "");
    this.lastTick = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private stop() {
    window.clearTimeout(this.wake);
    cancelAnimationFrame(this.frame);
    this.running = false;
    this.emptySince = null;
    window.removeEventListener("resize", this.fit);
    this.paint?.clearRect(0, 0, this.view.width, this.view.height);
    this.canvas?.removeAttribute("data-active");
  }

  /**
   * Ein Bild: Fälliges erscheinen lassen, bewegen, malen. Ist 100 ms lang nichts zu sehen, ruht der
   * Takt, auch wenn später noch etwas ansteht.
   */
  private tick = (now: number) => {
    this.frame = requestAnimationFrame(this.tick);
    if (!this.pacer.isDue(now)) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    this.release(now);
    this.update(now, dt);
    this.draw(now);
    if (this.shapes.length > 0 || this.pool.some((spark) => spark.live)) this.emptySince = null;
    else if (this.emptySince === null) this.emptySince = now;
    else if (now - this.emptySince >= LINGER_MS) this.rest(now);
  };

  /** Nichts zu sehen: Der Takt ruht, bis ein Zeitgeber ihn zum nächsten, was ansteht, weckt. */
  private rest(now: number) {
    this.stop();
    const next = this.queue[0];
    if (next) this.wake = window.setTimeout(() => this.start(), next.due - now - WAKE_EARLY_MS);
  }

  /** Lässt erscheinen, was fällig ist, und meldet gelandete Münzen. */
  private release(now: number) {
    while (this.queue[0] && this.queue[0].due <= now) {
      const item = this.queue.shift()!;
      const { land, spark, shape } = item.spawn;
      if (land !== undefined) item.onLand?.(land);
      if (spark && this.canvas) this.addSpark(item, spark);
      if (shape && this.canvas) this.shapes.push({ spec: shape, born: item.due });
    }
  }

  /** Nimmt einen freien Funken aus dem Vorrat. Ist keiner frei, fällt dieser weg. */
  private addSpark(item: Pending, spec: SparkSpec) {
    const cap = this.options.lite ? LITE_POOL : POOL;
    const spark = this.pool.slice(0, cap).find((candidate) => !candidate.live);
    if (!spark) return;
    const motion = {
      vx: spec.vx ?? 0,
      vy: spec.vy ?? 0,
      gravity: spec.gravity ?? 0,
      drag: spec.drag ?? 0,
    };
    Object.assign(
      spark,
      { live: true, kind: item.kind, born: item.due, spec, x: spec.x, y: spec.y },
      motion,
    );
  }

  private update(now: number, dt: number) {
    for (const spark of this.pool) {
      if (!spark.live) continue;
      const t = (now - spark.born) / spark.spec.life;
      if (t >= 1) spark.live = false;
      else if (spark.spec.path) Object.assign(spark, spark.spec.path(Math.max(0, t)));
      else stepSpark(spark, dt);
    }
    this.shapes = this.shapes.filter((shape) => now - shape.born < shape.spec.life);
  }

  private draw(now: number) {
    const { paint, atlas, view } = this;
    if (!paint || !atlas) return;
    paint.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    paint.globalAlpha = 1;
    paint.globalCompositeOperation = "source-over";
    paint.clearRect(0, 0, view.width, view.height);
    paint.globalCompositeOperation = this.options.lite ? "source-over" : "lighter";
    const age = (born: number, life: number) => Math.max(0, (now - born) / life);
    for (const shape of this.shapes)
      drawShape(paint, atlas, shape, age(shape.born, shape.spec.life));
    for (const spark of this.pool) {
      if (spark.live)
        atlas.draw(paint, spark.spec, placeSpark(spark, age(spark.born, spark.spec.life)));
    }
    paint.globalAlpha = 1;
  }
}

/** Die Funken-Effekte eines Fensters: abspielen, abbrechen, einstellen und Punkte der Bühne finden. */
export type ShopFx = Pick<
  SparkEngine,
  "play" | "cancel" | "configure" | "stagePoint" | "attach" | "detach" | "inspect"
>;

/** Die Funken-Effekte dieses Fensters. */
export const shopFx: ShopFx = new SparkEngine();

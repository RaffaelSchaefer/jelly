/**
 * Lässt ein Jelly der Seite leben, oben oder als Kopf im Fuß: Bildschleife, Zeiger, Stupser und
 * Farbwechsel. Wird erst nach dem ersten Bild der Seite geladen (`index.ts`), Three.js bremst den
 * Start also nicht.
 *
 * Die Schleife läuft nur, solange das Jelly zu sehen ist. Bei reduzierter Bewegung steht sie und
 * zeichnet nur kurz nach einer Eingabe.
 *
 * @module
 */

import { EMOTE_SECONDS, type EmoteFrame, type EmoteKey, type JellyColor } from "@jelly/scene";

import type { CameraView } from "./views.ts";

import { aimAt, approach, type Aim } from "./gaze.ts";
import { createSlowMeter, initialQuality, type HardwareHints } from "./quality.ts";
import { createHeroScene, drawHero, rebuildJelly, resizeHero, type HeroScene } from "./scene.ts";

/** Was die Seite am Jelly steuert. */
export interface HeroControls {
  setColor(color: JellyColor): void;
}

/** Gesten, die ein Stupser auslösen kann. */
const POKE_EMOTES: EmoteKey[] = ["wave", "cheer", "dance", "love", "laugh"];

/** Jeder wievielte Stupser eine Geste auslöst. Die übrigen lassen es nur hüpfen. */
const EMOTE_EVERY = 3;

/** So lange zeichnet die stehende Schleife nach einer Eingabe weiter, in Millisekunden. */
const SETTLE_MS = { pointer: 700, poke: 1800, color: 200 } as const;

/** Zustand zwischen zwei Bildern. */
interface Runner {
  hero: HeroScene;
  host: HTMLElement;
  reducedMotion: boolean;
  pulse: number;
  aim: Aim;
  target: Aim;
  emote: { key: EmoteKey; startedAt: number } | null;
  visible: boolean;
  activeUntil: number;
  frame: number;
  last: number;
  isSlow: (seconds: number) => boolean;
}

/** Was über die Hardware bekannt ist. */
function hardware(): HardwareHints {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return {
    cores: nav.hardwareConcurrency,
    memory: nav.deviceMemory,
    saveData: nav.connection?.saveData,
  };
}

/** Soll gerade gezeichnet werden? */
function shouldRun(run: Runner, now: number) {
  if (!run.visible || document.hidden) return false;
  return !run.reducedMotion || now < run.activeUntil;
}

/**
 * Bittet um das nächste Bild, wenn die Schleife laufen soll.
 *
 * @param running - Aus dem letzten Bild heraus. Sonst stand die Schleife, und die Pause zählt nicht
 *   als Zeit zwischen zwei Bildern.
 */
function schedule(run: Runner, running = false) {
  if (run.frame !== 0 || !shouldRun(run, performance.now())) return;
  if (!running) run.last = performance.now();
  run.frame = requestAnimationFrame((now) => tick(run, now));
}

/** Hält die Schleife bei reduzierter Bewegung noch `ms` am Laufen. */
function wake(run: Runner, ms: number) {
  run.activeUntil = Math.max(run.activeUntil, performance.now() + ms);
  schedule(run);
}

/** Die laufende Geste als Eingabe für die Animation, abgelaufene fallen weg. */
function currentEmote(run: Runner, now: number): EmoteFrame | undefined {
  const elapsed = run.emote ? (now - run.emote.startedAt) / 1000 : 0;
  if (run.emote && elapsed > EMOTE_SECONDS) run.emote = null;
  return run.emote ? { key: run.emote.key, elapsed, seconds: EMOTE_SECONDS } : undefined;
}

/** Ein Bild: weich zum Zeiger drehen, animieren, zeichnen, bei Bedarf auf optimiert umschalten. */
function tick(run: Runner, now: number) {
  run.frame = 0;
  const delta = Math.min(0.1, Math.max(0, (now - run.last) / 1000));
  run.last = now;
  run.aim = approach(run.aim, run.target, delta);
  drawHero(run.hero, {
    time: now / 1000,
    delta,
    pulse: run.pulse,
    reducedMotion: run.reducedMotion,
    aim: run.aim,
    emote: run.reducedMotion ? undefined : currentEmote(run, now),
  });
  run.host.dataset.ready = "true";
  // Nur die laufende Schleife sagt etwas über das Gerät, die stehende zeichnet mit Pausen.
  if (!run.reducedMotion && run.isSlow(delta)) rebuildJelly(run.hero, run.hero.color, "optimized");
  schedule(run, true);
}

/** Ein Stupser: hüpfen, ab und zu eine Geste. */
function poke(run: Runner) {
  run.pulse += 1;
  if (!run.reducedMotion && run.pulse % EMOTE_EVERY === 0) {
    const key = POKE_EMOTES[Math.floor(Math.random() * POKE_EMOTES.length)] ?? "wave";
    run.emote = { key, startedAt: performance.now() };
  }
  wake(run, SETTLE_MS.poke);
}

/** Verdrahtet Zeiger, Klicks, Sichtbarkeit und Größe. */
function listen(run: Runner, canvas: HTMLCanvasElement) {
  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") return;
      const box = run.host.getBoundingClientRect();
      run.target = aimAt(event.clientX, event.clientY, box, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      if (run.reducedMotion) wake(run, SETTLE_MS.pointer);
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    run.target = { x: 0, y: 0 };
  });
  run.host.addEventListener("click", () => poke(run));
  document.addEventListener("visibilitychange", () => schedule(run));
  new IntersectionObserver(([entry]) => {
    run.visible = entry?.isIntersecting ?? false;
    schedule(run);
  }).observe(run.host);
  new ResizeObserver(() => {
    resizeHero(run.hero, canvas.clientWidth, canvas.clientHeight);
    wake(run, SETTLE_MS.color);
  }).observe(canvas);
  // Verliert der Browser den Kontext, steht wieder das Plakat da.
  canvas.addEventListener("webglcontextlost", () => {
    run.host.dataset.ready = "false";
  });
}

/**
 * Startet ein Jelly in `host`, oben über dessen Plakat. Wirft, wenn es kein WebGL gibt, dann bleibt
 * das Plakat.
 *
 * @param view - Blick der Kamera, ohne Angabe das ganze Jelly.
 */
export function runHero(host: HTMLElement, color: JellyColor, view?: CameraView): HeroControls {
  const canvas = document.createElement("canvas");
  canvas.className = "hero-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const hero = createHeroScene(canvas, color, initialQuality(hardware()), view);
  host.append(canvas);
  const run: Runner = {
    hero,
    host,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    pulse: 0,
    aim: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    emote: null,
    visible: true,
    activeUntil: 0,
    frame: 0,
    last: performance.now(),
    isSlow: createSlowMeter(),
  };
  listen(run, canvas);
  return {
    setColor(next) {
      rebuildJelly(run.hero, next, run.hero.quality);
      wake(run, SETTLE_MS.color);
    },
  };
}

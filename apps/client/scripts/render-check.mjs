/**
 * Browser-Prüfung und Messung der echten Szene mit Vorschau-Daten, ohne weitere
 * Test-Abhängigkeiten. Unter /scripts/render-check.html über den Vite-Server öffnen, der Tab muss
 * dabei sichtbar bleiben.
 *
 * Die Seite kompiliert beide Körper-Shader wirklich, prüft den Wechsel der Modi im laufenden
 * Betrieb und misst danach je Variante und Szene die Zeit pro Bild. Parameter: `seconds` (60),
 * `runs` (3), `warmup` (5), `scenes` und `variants` als kommagetrennte Listen, `size` (100),
 * `measure=0` nur für die Prüfungen. CSS und Fensterkomposition sieht die Messung nicht: Die zeigen
 * sich nur in der Last der echten App.
 *
 * @module
 */

import { emoteSeconds } from "@jelly/scene/partner-emotes";
import { _roots, addAfterEffect, addEffect } from "@react-three/fiber";
import { createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { stageStyle } from "../src/App.tsx";
import { FULL_RENDERING, OPTIMIZED_RENDERING, PREVIEW_ME } from "../src/pet/index.ts";
import PetStage from "../src/PetStage.tsx";
import { usePet } from "../src/usePet.ts";
import "../src/styles.css";

const PARAMS = new URLSearchParams(location.search);
const SECONDS = Number(PARAMS.get("seconds") ?? 60);
const RUNS = Number(PARAMS.get("runs") ?? 3);
const WARMUP = Number(PARAMS.get("warmup") ?? 5);
const SIZE = Number(PARAMS.get("size") ?? 100);

/** Die Hebel einzeln dazugeschaltet, damit der Beitrag jedes Hebels sichtbar wird. */
const VARIANTS = {
  ausgang: { rendering: FULL_RENDERING, surfaces: false },
  flaechen: { rendering: { ...FULL_RENDERING, glass: false }, surfaces: true },
  dpr1: { rendering: { ...FULL_RENDERING, glass: false, dpr: 1 }, surfaces: true },
  optimiert: { rendering: OPTIMIZED_RENDERING, surfaces: true },
  schritte64: { rendering: OPTIMIZED_RENDERING, surfaces: true, marchSteps: 64 },
};

/** Wer im Duett herüberkommt. */
const PARTNER = { color: "peach", equipped: {} };

/** Dieselben Zustände für jede Variante. `every` läuft regelmäßig erneut, `setup` einmal. */
const SCENES = {
  begleiter: { panel: null },
  studio: { panel: "look" },
  nahansicht: { panel: "look", setup: () => document.querySelector(".blob.at-gesicht")?.click() },
  schilder: { panel: "signs" },
  emote: {
    panel: null,
    every: (game) => void game.playEmote("wave"),
    seconds: emoteSeconds("wave"),
  },
  duett: {
    panel: null,
    every: (game) => game.showEmote({ key: "hop", label: "Hüpfen" }, PARTNER),
    seconds: emoteSeconds("hop"),
  },
};

/** Wählt aus `table` die Einträge eines Parameters, ohne Parameter alle. */
function picked(name, table) {
  return (PARAMS.get(name)?.split(",") ?? Object.keys(table)).filter((key) => key in table);
}

const output = document.getElementById("result");
let root = createRoot(document.getElementById("root"));
const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const noop = () => null;
/** Der letzte Stand aus der App, für die Aktionen der Szenen. */
let currentGame = null;

/** Meldet einen fehlgeschlagenen Prüfpunkt. */
function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** Wartet auf eine Bedingung. Auf schwachen Geräten dauert schon das erste Bild Sekunden. */
async function until(condition, message, ms = 60_000) {
  const end = performance.now() + ms;
  while (!condition()) {
    check(performance.now() < end, message);
    await sleep(50);
  }
}

/** Wartet, bis `count` weitere Bilder fertig sind. */
function framesDrawn(probe, count = 3) {
  const target = probe.stamps.length + count;
  return until(() => probe.stamps.length >= target, "Die Szene zeichnet keine Bilder");
}

/** Der echte Spielstand-Hook und die echte Bühne. */
function Harness({ rendering, panel }) {
  const game = usePet(noop);
  useEffect(() => {
    currentGame = game;
  });
  return createElement(
    "main",
    { className: "pet-window", style: stageStyle(SIZE) },
    createElement(PetStage, {
      game,
      panel,
      rendering,
      me: game.game.me ?? PREVIEW_ME,
      joining: false,
      reducedMotion: false,
      onToggle: noop,
      onClose: noop,
    }),
  );
}

/** Zeigt die Bühne im gewünschten Zustand. */
function show({ rendering, surfaces }, panel) {
  document.documentElement.toggleAttribute("data-optimized-rendering", surfaces);
  root.render(createElement(Harness, { rendering, panel }));
}

/** Wartet, bis die Canvas steht, und liefert den Zustand von Fiber. */
async function fiberState() {
  for (;;) {
    const canvas = document.querySelector("canvas");
    const state = canvas && _roots.get(canvas)?.store.getState();
    if (state?.gl?.info) return state;
    await sleep(50);
  }
}

/**
 * Liest fertige Zeitmessungen aus. Eine gestörte Messung zählt nicht, statt falsche Werte zu
 * liefern.
 */
function drainQueries(gl, ext, pending, onValue) {
  while (pending.length > 0) {
    const query = pending[0];
    if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (!disjoint) onValue(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
    gl.deleteQuery(query);
    pending.shift();
  }
}

/**
 * Hängt die Messung an den Renderer. Ohne Erweiterung bleibt `gpu` leer: JavaScript-Zeit ist keine
 * GPU-Zeit.
 */
function instrument(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const probe = { gpu: [], cpu: [], stamps: [], recording: false, hasTimer: Boolean(ext) };
  const pending = [];
  const render = renderer.render;
  renderer.render = (scene, camera) => {
    if (ext) drainQueries(gl, ext, pending, (ms) => probe.recording && probe.gpu.push(ms));
    const query = ext ? gl.createQuery() : null;
    if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    render.call(renderer, scene, camera);
    if (query) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(query);
    }
    if (probe.recording) probe.stamps.push(performance.now());
  };
  let started = 0;
  const offBefore = addEffect(() => {
    started = performance.now();
  });
  const offAfter = addAfterEffect(() => {
    if (probe.recording) probe.cpu.push(performance.now() - started);
  });
  probe.stop = () => {
    renderer.render = render;
    offBefore();
    offAfter();
  };
  return probe;
}

/** Wert am Anteil `share` der sortierten Liste. */
function percentile(values, share) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? NaN;
}

/** Wie viele Materialien die Szene gerade verwendet. */
function countMaterials(scene) {
  const materials = new Set();
  scene.traverseVisible((object) => {
    if (object.material) materials.add(object.material);
  });
  return materials.size;
}

/** Stellt den Schritt-Versuch ein: Auch ein Partner, der später dazukommt, bekommt ihn. */
function setMarchSteps(scene, steps) {
  scene.traverse(({ material }) => {
    if (material?.defines?.MARCH_STEPS && material.defines.MARCH_STEPS !== steps) {
      material.defines.MARCH_STEPS = steps;
      material.needsUpdate = true;
    }
  });
}

/** Prüft, dass alle Programme gelaufen sind und genau die erwartete Shader-Variante dabei ist. */
function checkPrograms(renderer, { rendering }, scene) {
  const programs = renderer.info.programs;
  const failed = programs.filter((program) => program.diagnostics?.runnable === false);
  check(failed.length === 0, `Shader-Fehler: ${failed[0]?.diagnostics?.programLog}`);
  const has = (define) => programs.some((program) => program.cacheKey.includes(define));
  check(has("HEAD_R"), "Der Körper-Shader muss kompiliert sein");
  check(
    has("JELLY_OPTIMIZED") === (rendering.quality === "optimized"),
    `Falsche Körper-Variante in ${scene}`,
  );
}

/** Startet eine Szene auf frischer Canvas und liefert, was zum Messen und Aufräumen nötig ist. */
async function startScene(variant, scene) {
  root.unmount();
  root = createRoot(document.getElementById("root"));
  show(variant, scene.panel);
  const state = await fiberState();
  const probe = instrument(state.gl);
  // Regionen und Szenen-Aktionen brauchen die fertige Bühne.
  await sleep(500);
  scene.setup?.();
  scene.every?.(currentGame);
  const timers = [
    scene.every && setInterval(() => scene.every(currentGame), (scene.seconds + 0.2) * 1000),
    variant.marchSteps && setInterval(() => setMarchSteps(state.scene, variant.marchSteps), 250),
  ];
  const stop = () => {
    timers.forEach(clearInterval);
    probe.stop();
  };
  return { state, probe, stop };
}

/** Ein Messlauf. Der Shader ist dann schon aufgewärmt. */
async function recordRun({ state, probe }) {
  probe.gpu.length = probe.cpu.length = probe.stamps.length = 0;
  probe.recording = true;
  await sleep(SECONDS * 1000);
  probe.recording = false;
  check(!document.hidden, "Der Tab war verborgen, die Messung gilt nicht");
  const { stamps, gpu, cpu } = probe;
  const { render, memory, programs } = state.gl.info;
  return {
    gpuMedian: percentile(gpu, 0.5),
    gpuP95: percentile(gpu, 0.95),
    cpuMedian: percentile(cpu, 0.5),
    fps: (stamps.length - 1) / ((stamps.at(-1) - stamps[0]) / 1000),
    calls: render.calls,
    textures: memory.textures,
    programs: programs.length,
    materials: countMaterials(state.scene),
  };
}

/** Eine Messreihe einer Variante in einer Szene. */
async function measure(variantName, sceneName) {
  const variant = VARIANTS[variantName];
  const running = await startScene(variant, SCENES[sceneName]);
  await sleep(WARMUP * 1000);
  const rows = [];
  for (let run = 0; run < RUNS; run++) {
    rows.push({ variant: variantName, scene: sceneName, run, ...(await recordRun(running)) });
  }
  checkPrograms(running.state.gl, variant, sceneName);
  running.stop();
  return { rows, hasTimer: running.probe.hasTimer };
}

/** Zählt laufende Intervalle, solange `restore` nicht gerufen wurde. */
function watchTimers() {
  const live = new Set();
  const { setInterval: start, clearInterval: stop } = window;
  window.setInterval = (...args) => {
    const id = start(...args);
    live.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    live.delete(id);
    stop(id);
  };
  const restore = () => {
    window.setInterval = start;
    window.clearInterval = stop;
  };
  return { live, restore };
}

/** Schaltet mehrmals hin und her und wartet jeweils auf fertige Bilder im neuen Modus. */
async function cycleModes(probe) {
  for (let cycle = 0; cycle < 4; cycle++) {
    show(VARIANTS.optimiert, null);
    await framesDrawn(probe);
    show(VARIANTS.ausgang, null);
    await framesDrawn(probe);
  }
}

/** Prüft den Wechsel der Modi: gleiche Canvas und gleicher Kontext, keine wachsenden Ressourcen. */
async function checkSwitching() {
  const { live, restore } = watchTimers();
  show(VARIANTS.ausgang, null);
  const state = await fiberState();
  const probe = instrument(state.gl);
  probe.recording = true;
  const context = state.gl.getContext();
  const canvas = state.gl.domElement;
  await framesDrawn(probe);
  const counts = () => {
    const { memory, programs } = state.gl.info;
    return { ...memory, programs: programs.length, timers: live.size };
  };
  const before = counts();
  await cycleModes(probe);
  const after = counts();
  probe.stop();
  restore();
  check(document.querySelector("canvas") === canvas, "Die Canvas darf nicht neu entstehen");
  check(state.gl.getContext() === context && !context.isContextLost(), "Der Kontext muss bleiben");
  for (const key of Object.keys(before)) {
    check(
      after[key] <= before[key],
      `${key} wächst beim Umschalten: ${before[key]} → ${after[key]}`,
    );
  }
  return after;
}

/** Prüft die Pause beim Verbergen: ohne Timer keine Bilder, beim Wiederanzeigen sofort ein Bild. */
async function checkHidden() {
  // Manche Vorschau-Fenster halten `document.hidden` fest. Dort bleibt nur die echte App.
  if (Object.getOwnPropertyDescriptor(document, "hidden")?.configurable === false) return false;
  show(VARIANTS.optimiert, null);
  const state = await fiberState();
  const probe = instrument(state.gl);
  probe.recording = true;
  await framesDrawn(probe);
  let hidden = true;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
  // Ein Bild kann noch unterwegs sein, erst danach darf nichts mehr kommen.
  await sleep(500);
  probe.stamps.length = 0;
  await sleep(500);
  check(probe.stamps.length === 0, "Verborgen darf nichts gezeichnet werden");
  hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  await framesDrawn(probe, 1);
  delete document.hidden;
  probe.stop();
  return true;
}

/** Mittelt die Läufe je Variante und Szene, dazu die Ersparnis gegenüber dem Ausgangszustand. */
function report(rows) {
  const lines = [];
  const groups = Map.groupBy(rows, (row) => `${row.scene}/${row.variant}`);
  const mean = (list, key) => list.reduce((sum, row) => sum + row[key], 0) / list.length;
  for (const [name, list] of groups) {
    const base = groups.get(`${list[0].scene}/ausgang`);
    const gpu = mean(list, "gpuMedian");
    const saved = base ? Math.round((1 - gpu / mean(base, "gpuMedian")) * 100) : NaN;
    const { calls, textures, programs, materials } = list.at(-1);
    lines.push(
      `${name.padEnd(22)} GPU ${gpu.toFixed(2).padStart(7)} ms (p95 ${mean(list, "gpuP95").toFixed(2)}, ${saved} % gespart)` +
        ` · CPU ${mean(list, "cpuMedian").toFixed(2)} ms · ${mean(list, "fps").toFixed(1)} FPS` +
        ` · ${calls} Draws, ${textures} Texturen, ${materials} Materialien, ${programs} Programme`,
    );
  }
  return lines.join("\n");
}

/** Alle Prüfungen und danach die Messung. */
async function run() {
  const hiddenChecked = await checkHidden();
  const resources = await checkSwitching();
  const results = [
    hiddenChecked ? "Verbergen ok" : "Verbergen hier nicht prüfbar",
    `Umschalten ok: ${JSON.stringify(resources)}`,
  ];
  const rows = [];
  let hasTimer = false;
  const scenes = PARAMS.get("measure") === "0" ? [] : picked("scenes", SCENES);
  for (const scene of scenes) {
    for (const variant of picked("variants", VARIANTS)) {
      output.textContent = `Messe ${scene}/${variant} …\n${report(rows)}`;
      const measured = await measure(variant, scene);
      rows.push(...measured.rows);
      hasTimer = measured.hasTimer;
    }
  }
  if (rows.length > 0 && !hasTimer)
    results.push("Ohne EXT_disjoint_timer_query_webgl2: keine GPU-Zeit.");
  results.push(`${SECONDS} s × ${RUNS} Läufe bei ${SIZE} %, dpr ${devicePixelRatio}`, report(rows));
  window.renderCheckRows = rows;
  return results.join("\n");
}

try {
  output.textContent = await run();
  document.body.dataset.result = "passed";
} catch (error) {
  output.textContent = String(error);
  document.body.dataset.result = "failed";
}

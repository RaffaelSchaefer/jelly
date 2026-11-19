/**
 * Hörprobe des Zauberladens: rendert jedes Geräusch, das Kaufritual zu den Preisen 1, 3 und 8 und
 * zwölf Sekunden Ambiente (Startwert 7) offline mit 48 kHz durch den ganzen Mischer und misst
 * Spitze und RMS hinter dem Begrenzer gegen `CUE_TARGETS`. Darunter ein Brett zum Anhören mit dem
 * echten `shopSound`, seinen Zuhörern und dem Klangthema. Unter /scripts/shop-sound-check.html über
 * den Vite-Server öffnen. Das Ergebnis steht in `document.body.dataset.result`: `pass` oder
 * `fail`.
 *
 * @module
 */

import { createElement } from "react";
import { createRoot } from "react-dom/client";

import {
  BED_TARGET,
  CUE_TARGETS,
  CUE_TOLERANCE_DB,
  gainToDb,
  PEAK_CEILING_DB,
  SOUND_PANS,
} from "../src/pet/shopMix.ts";
import { createShopRng, ritualScore, ritualTimes, SHOP_SFX } from "../src/pet/shopScore.ts";
import { purchaseTimeline } from "../src/pet/shopTimeline.ts";
import { speechNotes } from "../src/pet/voice.ts";
import { startAmbience } from "../src/shop/sound/ambience.ts";
import { busOf, playCue, recipeOf, SFX_CUES } from "../src/shop/sound/cues.ts";
import { createMixer } from "../src/shop/sound/mixer.ts";
import { coinHit, createStage, playRitual, playSpell, tillBell } from "../src/shop/sound/ritual.ts";
import { shopSound } from "../src/shop/sound/shopSound.ts";
import { useShopSound } from "../src/shop/sound/useShopSound.ts";
import { useClickSounds } from "../src/useUiSounds.ts";
import { createVoiceOutput, playNotes } from "../src/voice.ts";

const RATE = 48000;
const SEED = 7;

/** Darunter gilt ein Sample als still. */
const SILENCE = 10 ** (-60 / 20);

/**
 * Jedes Geräusch beginnt erst nach dieser Zeit in Sekunden. Der Begrenzer in Chrome startet
 * gedrückt und braucht ein paar hundert Millisekunden, bis er frei ist. Live läuft er immer schon
 * unter dem Ambiente, hier würde er frühe Spitzen um bis zu 7 dB drücken.
 */
const WARMUP = 0.5;

/** Bett und Kauf zusammen müssen schneller rendern, sonst nur eine Warnung. In Millisekunden. */
const PERF_BUDGET_MS = 480;

/** Höchstens so viele Knoten hält der Klang in Ruhe. */
const NODES_AT_REST = 40;

/** Die Plätze am Jelly. */
const SLOTS = ["head", "face", "hands", "body", "aura"];

/** Der Kaufplan in Millisekunden ab C, so wie der Laden ihn an `shopSound.purchase` gibt. */
function timeline(price) {
  return ritualTimes(purchaseTimeline(price));
}

/** Spitze und hörbarer Bereich eines Kanals. */
function scan(data, found) {
  for (let index = 0; index < data.length; index++) {
    const value = Math.abs(data[index]);
    found.peak = Math.max(found.peak, value);
    if (value > SILENCE) {
      found.first = Math.min(found.first, index);
      found.last = index;
    }
  }
}

/** Spitze und RMS in dBFS über den hörbaren Teil, dazu bis wann es nach `offset` hörbar ist. */
function measure(buffer, offset) {
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  const found = { peak: 0, first: Infinity, last: -1 };
  for (const data of channels) scan(data, found);
  let sum = 0;
  for (const data of channels) {
    for (let index = found.first; index <= found.last; index++) sum += data[index] ** 2;
  }
  const count = Math.max(1, 2 * (found.last - found.first + 1));
  const rms = gainToDb(Math.sqrt(sum / count));
  return { peak: gainToDb(found.peak), rms, until: (found.last + 1) / RATE - offset };
}

/** Rendert `seconds` nach `offset` offline durch den ganzen Mischer. `build` plant, was klingt. */
async function render(seconds, build, offset = WARMUP) {
  const context = new OfflineAudioContext(2, Math.ceil((seconds + offset) * RATE), RATE);
  const mixer = createMixer(context);
  const started = performance.now();
  build(context, mixer);
  const buffer = await context.startRendering();
  return { ...measure(buffer, offset), ms: performance.now() - started, seconds };
}

/** Ein Rezept in einem Bus, wie `shopSound` es spielt. */
const recipe =
  (name, bus, options = {}) =>
  (context, mixer) => {
    const spec = { at: WARMUP, rng: createShopRng(SEED), options, reverb: mixer.reverb };
    playCue(context, mixer.bus(bus), name, spec);
  };

/** Ein Geräusch des Ladens, wie `shopSound.cue` es spielt. */
const cue = (name, options = {}) => {
  const resolved = recipeOf(name, options);
  return recipe(resolved, busOf(resolved), options);
};

/** Ein Geräusch des Zauberers, wie `shopSound.sfx` es spielt. */
const sfx = (name) => {
  const { cue: resolved, place } = SFX_CUES[name];
  return recipe(resolved, busOf(resolved), { place });
};

/** Das Ritual oder nur der Zauber, wie `shopSound.purchase` es spielt. */
const ritual =
  (times, play = playRitual, calm = false) =>
  (context, mixer) => {
    const rng = createShopRng(SEED);
    const stage = createStage(context, mixer.bus("sfx"));
    play({ context, stage, at: WARMUP, rng }, ritualScore(times, rng, calm));
  };

/** Ein Teil des Rituals allein, so laut wie im Ritual: ohne die Schwankung der Geräusche. */
const part = (play) => (context, mixer) => {
  const stage = createStage(context, mixer.bus("sfx"));
  play({ context, stage, at: WARMUP, rng: createShopRng(SEED) });
};

/** Eine Münze landet in der Schale, mit dem Tock der Theke. */
const landing = { at: 0, hz: 2500, gain: 1, pan: SOUND_PANS.tray, tock: true };

/** Zwölf Sekunden Ambiente, voll eingeblendet. */
function bed(context, mixer) {
  const options = { orb: mixer.place("orb", "ambience"), seed: SEED, at: 0, mood: "awake" };
  const ambience = startAmbience(context, mixer.bus("ambience"), options);
  ambience.scheduleUntil(12);
  mixer.bedFade.set(1);
}

/** Kurze Geräusche der Oberfläche, je 1,5 s gerendert. */
const CLICKS = "tap pageOpen pageClose pageTurn latchOn latchOff".split(" ");

/** Längere Geräusche, je 2,5 s gerendert. */
const MOMENTS = "blocked shimmer fizzle coinGain stamp stampLight takeOff glint hatTip snort".split(
  " ",
);

/**
 * Was die Hörprobe misst: Name (sein erstes Wort wählt das Ziel), Länge in Sekunden, wie es klingt
 * und, wo der Name es nicht sagt, das Ziel.
 */
const CHECKS = [
  ["hover", 1.5, cue("hover", { variant: "harp", step: 2 })],
  ["hoverWax", 1.5, cue("hover", { variant: "wax" })],
  ["hoverCoin", 1.5, cue("hover", { variant: "coin" })],
  ["rustle", 1.5, cue("rustle", { intensity: 1 })],
  ...CLICKS.map((name) => [name, 1.5, cue(name)]),
  ...MOMENTS.map((name) => [name, 2.5, cue(name)]),
  ["tryOn", 2.5, cue("tryOn", { slot: "head", price: 3 })],
  ["short", 2.5, cue("tryOn", { slot: "face", price: 6, variant: "short" })],
  ["owned", 2.5, cue("tryOn", { slot: "hands", variant: "owned" })],
  ["equip", 3.5, cue("equip", { slot: "head" })],
  ["clink", 2.5, part((run) => coinHit(run, landing))],
  ["till", 8, part((run) => tillBell(run, 0))],
  ["spell", 4, ritual({ coinLandsMs: [], tillMs: 0, burstMs: 420, impactMs: 1020 }, playSpell)],
  ...[1, 3, 8].map((price) => [`purchase ${price}`, 9, ritual(timeline(price))]),
  ["purchase 3 ruhig", 9, ritual(timeline(3), playRitual, true)],
  ...SHOP_SFX.map((name) => [`sfx ${name}`, 4, sfx(name), SFX_CUES[name].cue]),
];

/** Was an einer Messung nicht stimmt. */
function problemsOf(name, result, key = name.split(" ")[0]) {
  const target = CUE_TARGETS[key];
  const problems = [];
  if (!(result.peak > -80)) problems.push("stumm");
  if (!(result.peak <= PEAK_CEILING_DB)) problems.push("übersteuert");
  if (target !== undefined && Math.abs(result.peak - target) > CUE_TOLERANCE_DB) {
    problems.push(`Ziel ${target} ± ${CUE_TOLERANCE_DB}`);
  }
  if (result.until > result.seconds - 0.05) problems.push("klingt über das Ende");
  return { name, target, ...result, problems };
}

/** Das Ambiente: RMS um −46 dBFS, keine Spitze über −30 dBFS. */
function bedProblems(result) {
  const problems = [];
  if (Math.abs(result.rms - BED_TARGET.rms) > BED_TARGET.tolerance) {
    problems.push(`RMS ${BED_TARGET.rms} ± ${BED_TARGET.tolerance}`);
  }
  if (result.peak > BED_TARGET.peak) problems.push(`Spitze über ${BED_TARGET.peak}`);
  return { name: "Ambiente 12 s", target: `RMS ${BED_TARGET.rms}`, ...result, problems };
}

/** Wie viele Knoten der Klang in Ruhe hält: Mischer, Ambiente, alle Busse und die Stimmen. */
function nodesAtRest() {
  const proto = BaseAudioContext.prototype;
  const names = Object.getOwnPropertyNames(proto).filter((name) =>
    /^create(?!Buffer$|PeriodicWave$)/.test(name),
  );
  const originals = names.map((name) => proto[name]);
  let count = 1;
  names.forEach((name, index) => {
    proto[name] = function counted(...args) {
      count += 1;
      return originals[index].apply(this, args);
    };
  });
  try {
    const context = new OfflineAudioContext(2, RATE, RATE);
    const mixer = createMixer(context);
    bed(context, mixer);
    for (const bus of ["ui", "sfx"]) mixer.bus(bus);
    mixer.place("wizard", "voice");
    mixer.place("customer", "customer");
  } finally {
    names.forEach((name, index) => (proto[name] = originals[index]));
  }
  return count;
}

/** Eine Zeile der Tabelle. */
function row(cells, failed = false, tag = "td") {
  const line = document.createElement("tr");
  if (failed) line.className = "fail";
  for (const text of cells) {
    const cell = document.createElement(tag);
    cell.textContent = String(text);
    line.append(cell);
  }
  return line;
}

/** Zeigt alle Messungen. */
function show(results) {
  const table = document.getElementById("table");
  table.append(
    row(["Geräusch", "Spitze dBFS", "Ziel", "RMS dBFS", "hörbar s", "Befund"], false, "th"),
  );
  for (const result of results) {
    const { name, peak, target, rms, until, problems } = result;
    const cells = [name, peak.toFixed(1), target ?? "–", rms.toFixed(1), until.toFixed(2)];
    table.append(row([...cells, problems.join(", ") || "ok"], problems.length > 0));
  }
}

/** Rendert alles und prüft es. Liefert die Befunde und die Meldungen darüber hinaus. */
async function run() {
  const results = [];
  for (const [name, seconds, build, key] of CHECKS) {
    results.push(problemsOf(name, await render(seconds, build), key));
  }
  results.push(bedProblems(await render(12, bed, 0)));
  const peak = (name) => results.find((result) => result.name === name)?.peak ?? 0;
  const order = ["hover", "tap", "tryOn", "stamp"].map(peak);
  const notes = [];
  if (!order.every((value, index) => index === 0 || value > order[index - 1])) {
    notes.push("Lautstärke nicht hover < tap < tryOn < stamp");
  }
  const nodes = nodesAtRest();
  if (nodes > NODES_AT_REST) notes.push(`${nodes} Knoten in Ruhe, höchstens ${NODES_AT_REST}`);
  const perf = await render(
    12,
    (context, mixer) => {
      bed(context, mixer);
      ritual(timeline(3))(context, mixer);
    },
    0,
  );
  return { results, notes, nodes, perfMs: perf.ms };
}

/** Der Zauberer spricht an seinem Platz: Das Ambiente duckt sich, die Kugel horcht. */
function speak() {
  const route = shopSound.voiceRoute("wizard");
  if (!route) return;
  const start = route.context.currentTime + 0.05;
  const output = createVoiceOutput(route.context, route.output);
  const notes = speechNotes("Willkommen in meinem Laden!");
  const phrase = playNotes(route.context, output, notes, start);
  route.onPhrase(start, phrase.end);
}

/** Was das Brett dem Klang vorgibt: Ton an, volle Lautstärke. */
const SOUND = { sound: true, volume: 100, reducedMotion: false };

/** Ein Kauf bei reduzierter Bewegung: Vom Zauber bleibt nur der Einschlag. */
function calmPurchase() {
  shopSound.configure({ ...SOUND, reducedMotion: true });
  shopSound.purchase(timeline(3));
  shopSound.configure(SOUND);
}

/** Die Knöpfe des Bretts, je Gruppe. */
const BOARD = [
  [
    "Oberfläche",
    "tap pageOpen pageClose pageTurn blocked latchOn latchOff shimmer fizzle coinGain"
      .split(" ")
      .map((name) => [name, () => shopSound.cue(name)]),
  ],
  [
    "Zeiger",
    [
      ...[0, 1, 2, 3, 4, 5].map((step) => [
        `Harfe ${step}`,
        () => shopSound.cue("hover", { variant: "harp", step }),
      ]),
      ["Wachs", () => shopSound.cue("hover", { variant: "wax" })],
      ["Münze", () => shopSound.cue("hover", { variant: "coin" })],
      ["Rascheln", () => shopSound.cue("rustle", { intensity: 1 })],
    ],
  ],
  [
    "Anprobe",
    [
      ...SLOTS.map((slot) => [slot, () => shopSound.cue("tryOn", { slot, price: 3 })]),
      ["zu teuer", () => shopSound.cue("tryOn", { slot: "face", variant: "short" })],
      ["im Besitz", () => shopSound.cue("tryOn", { slot: "hands", variant: "owned" })],
      ["Anlegen", () => shopSound.cue("equip")],
      ["Ablegen", () => shopSound.cue("takeOff")],
    ],
  ],
  [
    "Kauf",
    [
      ["Stempel", () => shopSound.cue("stamp")],
      ["leichter Stempel", () => shopSound.cue("stampLight")],
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((price) => [
        `Kauf ${price}`,
        () => shopSound.purchase(timeline(price)),
      ]),
      ["Kauf 3 ruhig", calmPurchase],
    ],
  ],
  ["Zauberer", SHOP_SFX.map((name) => [name, () => shopSound.sfx(name)])],
  [
    "Ambiente",
    [
      ["wach", () => shopSound.setMood("awake")],
      ["döst", () => shopSound.setMood("dozing")],
      ["Stimme", speak],
      ["Ton aus", () => shopSound.configure({ ...SOUND, sound: false })],
      ["Ton an", () => shopSound.configure(SOUND)],
    ],
  ],
];

/** Baut das Brett: ein Knopf je Geräusch, dazu das Siegel zum Halten. */
function buildBoard() {
  const board = document.getElementById("board");
  for (const [title, buttons] of BOARD) {
    const group = document.createElement("p");
    group.append(`${title}: `);
    for (const [label, play] of buttons) {
      const button = Object.assign(document.createElement("button"), { textContent: label });
      button.dataset.sound = "none";
      button.addEventListener("click", play);
      group.append(button);
    }
    board.append(group);
  }
  const hold = Object.assign(document.createElement("button"), { textContent: "Siegel halten" });
  hold.dataset.sound = "none";
  hold.addEventListener("pointerdown", () => shopSound.charge(true));
  for (const end of ["pointerup", "pointerleave"]) {
    hold.addEventListener(end, () => shopSound.charge(false));
  }
  board.append(hold);
  const volume = document.getElementById("volume");
  volume.addEventListener("input", () => {
    shopSound.configure({ ...SOUND, volume: Number(volume.value) });
  });
}

/** Einstellungen fürs Brett: Ton an, volle Lautstärke. */
const SETTINGS = {
  reducedMotion: false,
  size: 100,
  sound: true,
  volume: 100,
  optimizedRendering: false,
  frameLimit: null,
};

/** Der echte Klang mit Zuhörern und Klangthema, wie im Shop-Fenster. */
function Harness() {
  useShopSound(SETTINGS);
  useClickSounds(SETTINGS, "");
  return null;
}

buildBoard();
createRoot(document.getElementById("root")).render(createElement(Harness));
const expander = document.getElementById("expander");
expander.addEventListener("click", () => {
  expander.setAttribute("aria-expanded", String(expander.getAttribute("aria-expanded") !== "true"));
});
window.setInterval(() => {
  const { context, sources, asleep } = shopSound.inspect();
  const state = context ? `Kontext ${context.state}, ${sources} Quellen` : "Kein Kontext.";
  document.getElementById("status").textContent = asleep ? `${state}, schläft` : state;
}, 500);

try {
  const { results, notes, nodes, perfMs } = await run();
  show(results);
  const failed = results.filter((result) => result.problems.length > 0).length + notes.length;
  const perf = `Bett + Kauf in ${perfMs.toFixed(0)} ms${perfMs > PERF_BUDGET_MS ? " (Warnung: über 480 ms)" : ""}`;
  const summary =
    failed === 0 ? "alle Klang-Prüfungen bestanden" : `${failed} Klang-Prüfungen fehlgeschlagen`;
  document.getElementById("result").textContent = [
    summary,
    ...notes,
    `${nodes} Knoten in Ruhe`,
    perf,
  ].join("\n");
  document.body.dataset.result = failed === 0 ? "pass" : "fail";
} catch (error) {
  document.getElementById("result").textContent = String(error?.stack ?? error);
  document.body.dataset.result = "fail";
}

import assert from "node:assert/strict";
import { test } from "node:test";

import { syncWorn, type Worn, type WornActions, type WornWish } from "./worn.ts";

/** Records what happens and lets the test decide when a model arrives. */
function createWorld() {
  const answers = new Map<string, (model: string | null) => void>();
  const shown: string[] = [];
  const actions: WornActions<string, string> = {
    load: (key) => new Promise((resolve) => answers.set(key, resolve)),
    put: (model, wish) => {
      const item = wish.color ? `${model} ${wish.color}` : model;
      shown.push(item);
      return item;
    },
    remove: (item) => {
      shown.splice(shown.indexOf(item), 1);
    },
  };
  /** Lets `key` finish loading and waits for what follows from it. */
  async function answer(key: string, model: string | null = key) {
    answers.get(key)?.(model);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { actions, answer, shown };
}

/** Wishes per slot: a key alone, or `key color` for a colored one. */
const wanted = (entries: Record<string, string> = {}) =>
  new Map(
    Object.entries(entries).map(([slot, wish]): [string, WornWish] => {
      const [key = "", color = null] = wish.split(" ");
      return [slot, { key, color }];
    }),
  );

test("puts a cosmetic on once it has loaded", async () => {
  const { actions, answer, shown } = createWorld();
  const worn: Worn<string> = new Map();
  syncWorn(worn, wanted({ head: "headset" }), actions);
  assert.deepEqual(shown, []);
  await answer("headset");
  assert.deepEqual(shown, ["headset"]);
});

test("does not load again while the wish stays", async () => {
  const { actions, answer, shown } = createWorld();
  const worn: Worn<string> = new Map();
  let loads = 0;
  const counted = {
    ...actions,
    load: (key: string) => {
      loads += 1;
      return actions.load(key);
    },
  };
  syncWorn(worn, wanted({ head: "headset" }), counted);
  await answer("headset");
  syncWorn(worn, wanted({ head: "headset" }), counted);
  assert.equal(loads, 1);
  assert.deepEqual(shown, ["headset"]);
});

test("swaps a cosmetic and takes off what is no longer wanted", async () => {
  const { actions, answer, shown } = createWorld();
  const worn: Worn<string> = new Map();
  syncWorn(worn, wanted({ head: "headset" }), actions);
  await answer("headset");
  syncWorn(worn, wanted({ head: "neutral" }), actions);
  assert.deepEqual(shown, []);
  await answer("neutral");
  assert.deepEqual(shown, ["neutral"]);
  syncWorn(worn, wanted(), actions);
  assert.deepEqual(shown, []);
});

test("drops a late answer for an old wish", async () => {
  const { actions, answer, shown } = createWorld();
  const worn: Worn<string> = new Map();
  syncWorn(worn, wanted({ head: "headset" }), actions);
  syncWorn(worn, wanted({ head: "neutral" }), actions);
  await answer("neutral");
  await answer("headset");
  assert.deepEqual(shown, ["neutral"]);
});

test("drops a late answer after a change back and forth", async () => {
  const { actions, answer, shown } = createWorld();
  const worn: Worn<string> = new Map();
  syncWorn(worn, wanted({ head: "headset" }), actions);
  const first = worn.get("head");
  syncWorn(worn, wanted(), actions);
  syncWorn(worn, wanted({ head: "headset" }), actions);
  assert.notEqual(worn.get("head"), first);
  await answer("headset");
  assert.deepEqual(shown, ["headset"]);
});

test("drops a late answer for a jelly that left", async () => {
  const { actions, answer, shown } = createWorld();
  const worn: Worn<string> = new Map();
  syncWorn(worn, wanted({ head: "headset" }), actions);
  worn.clear();
  await answer("headset");
  assert.deepEqual(shown, []);
});

test("shows nothing for a key without a model", async () => {
  const { actions, answer, shown } = createWorld();
  const worn: Worn<string> = new Map();
  syncWorn(worn, wanted({ head: "unknown" }), actions);
  await answer("unknown", null);
  assert.deepEqual(shown, []);
});

test("a failed load leaves the jelly without the cosmetic", async () => {
  const { actions, shown } = createWorld();
  const worn: Worn<string> = new Map();
  const warn = console.warn;
  const warnings: unknown[] = [];
  console.warn = (...args) => warnings.push(args);
  try {
    syncWorn(worn, wanted({ head: "broken" }), {
      ...actions,
      load: () => Promise.reject(new Error("broken")),
    });
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(shown, []);
  assert.equal(warnings.length, 1);
});

test("recolors when only the color changes", async () => {
  const { actions, answer, shown } = createWorld();
  const worn: Worn<string> = new Map();
  syncWorn(worn, wanted({ head: "beanie #ffd45c" }), actions);
  await answer("beanie");
  syncWorn(worn, wanted({ head: "beanie #ffd45c" }), actions);
  assert.deepEqual(shown, ["beanie #ffd45c"]);
  syncWorn(worn, wanted({ head: "beanie #4cc9f0" }), actions);
  await answer("beanie");
  assert.deepEqual(shown, ["beanie #4cc9f0"]);
  syncWorn(worn, wanted({ head: "beanie" }), actions);
  await answer("beanie");
  assert.deepEqual(shown, ["beanie"]);
});

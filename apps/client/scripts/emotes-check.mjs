/**
 * Browser-Prüfung der echten Emote- und Schild-Hooks mit Tauri-Mock, ohne weitere
 * Test-Abhängigkeiten. Unter /scripts/emotes-check.html und zusätzlich mit ?preview über den
 * Vite-Server öffnen.
 *
 * @module
 */

import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const preview = new URLSearchParams(location.search).has("preview");
globalThis.isTauri = !preview;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { useEmotes } = await import("../src/useEmotes.ts");
const { useSigns } = await import("../src/useSigns.ts");
const { useGameState, useBackendCall } = await import("../src/useGame.ts");
const { PREVIEW_GAME, PREVIEW_CATALOG } = await import("../src/pet/preview.ts");
const { EMOTE_SECONDS } = await import("@jelly/scene/emotes");
let current;
let failures = 0;
const requests = [];
const signMessages = [];
let answer = () => PREVIEW_GAME;
const root = createRoot(document.getElementById("root"));

/** Merkt sich, was das Jelly zu einem neuen Schild sagt. */
function onSignChanged(message) {
  signMessages.push(message);
}

/** Meldet einen fehlgeschlagenen Prüfpunkt. */
function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** Rendert die produktiven Hooks, ohne Canvas oder zusätzliche Oberfläche. */
function Harness() {
  const state = useGameState();
  const call = useBackendCall(() => failures++);
  current = {
    ...useEmotes(state, call, true),
    ...useSigns(state, call, true, onSignChanged),
    state,
    call,
  };
  return null;
}

/** Wartet auf eine Geste, einschließlich React-Zustandsänderungen. */
async function play(key) {
  let accepted;
  await act(async () => {
    accepted = await current.playEmote(key);
  });
  return accepted;
}

/** Prüft laufende Anfragen und die Übernahme erst nach erfolgreicher Antwort. */
async function checkRequest() {
  let finish;
  answer = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  let pending;
  await act(async () => {
    pending = current.playEmote("wave");
  });
  check(current.call.busy && current.activeEmote === null, "Vor Bestätigung keine Geste");
  check(!(await play("dance")) && requests.length === 1, "Parallele Aktion muss gesperrt sein");
  const next = { ...PREVIEW_GAME, me: { ...PREVIEW_GAME.me, xp: 777, hidden: true } };
  await act(async () => {
    finish(next);
    await pending;
  });
  check(current.state.game.me.xp === 777, "Serverstand muss übernommen werden");
  check(current.activeEmote.key === "wave", "Auch ausgeblendete Jellies animieren");
  check(requests[0].command === "emote" && requests[0].args.key === "wave", "IPC-Vertrag");
}

/** Prüft wiederholte Gesten und die Rückkehr zum normalen Zustand. */
async function checkLifetime() {
  answer = () => PREVIEW_GAME;
  check(await play("wave"), "Winken muss funktionieren");
  const previous = current.activeEmote;
  check(await play("wave"), "Wiederholtes Winken muss funktionieren");
  check(current.activeEmote !== previous, "Wiederholung braucht einen neuen Start");
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, EMOTE_SECONDS * 1000 + 50);
    });
  });
  check(current.activeEmote === null, "Geste muss nach drei Sekunden enden");
}

/** Prüft Fehler, fehlende Teilnahme und zukünftige Katalogeinträge. */
async function checkFailures() {
  for (const message of [
    "Warte kurz bis zum nächsten Emote.",
    "Dieses Emote gibt es nicht.",
    "Netzfehler",
  ]) {
    answer = () => Promise.reject(message);
    check(!(await play("wave")), "Abgelehnte Aktion darf keinen Erfolg melden");
    check(current.activeEmote === null && current.call.error === message, "Fehler statt Geste");
  }
  check(failures === 3, "Nach jedem Fehler muss der Stand neu geladen werden");
  const before = requests.length;
  await act(async () => current.state.setGame({ ...PREVIEW_GAME, tokenRejected: true }));
  check(!(await play("wave")), "Abgelehntes Konto sperrt Emotes");
  await act(async () =>
    current.state.setGame({ ...PREVIEW_GAME, lan: { ...PREVIEW_GAME.lan, joined: false } }),
  );
  check(!(await play("wave")), "Fehlende LAN-Teilnahme sperrt Emotes");
  check(requests.length === before, "Gesperrte Aktionen senden nichts");
  await act(async () => current.state.setGame(PREVIEW_GAME));
}

/** Setzt ein Schild, einschließlich React-Zustandsänderungen. */
async function setSign(key) {
  let accepted;
  await act(async () => {
    accepted = await current.setSign(key);
  });
  return accepted;
}

/** Prüft den IPC-Vertrag von `set_sign`, die Sperre ohne LAN und den Stand nach einem Fehler. */
async function checkSignRequests() {
  const raised = { ...PREVIEW_GAME, me: { ...PREVIEW_GAME.me, sign: "cs2" } };
  answer = () => raised;
  check(await setSign("cs2"), "Heben muss klappen");
  check(requests.at(-1).command === "set_sign" && requests.at(-1).args.key === "cs2", "Heben: IPC");
  check(current.state.game.me.sign === "cs2", "Serverstand des Schilds muss übernommen werden");
  answer = () => Promise.reject("Dieses Schild gibt es nicht.");
  check(!(await setSign("free text")), "Abgelehntes Schild darf keinen Erfolg melden");
  check(current.state.game.me.sign === "cs2", "Ein Fehler lässt das Schild stehen");
  check(current.call.error === "Dieses Schild gibt es nicht.", "Der Fehler muss sichtbar werden");
  answer = () => PREVIEW_GAME;
  check(await setSign(null), "Senken muss klappen");
  check(requests.at(-1).command === "set_sign" && requests.at(-1).args.key === null, "Senken: IPC");
  check(current.state.game.me.sign === null, "Das gesenkte Schild muss verschwinden");
  check(signMessages.length === 2, "Nur erfolgreiche Wechsel melden sich");
  const before = requests.length;
  await act(async () =>
    current.state.setGame({ ...PREVIEW_GAME, lan: { ...PREVIEW_GAME.lan, joined: false } }),
  );
  check(!current.signsAllowed && current.signsDisabled, "Ohne Teilnahme gibt es nichts zu wählen");
  check(!(await setSign("cs2")) && requests.length === before, "Gesperrt wird nichts gesendet");
  await act(async () => current.state.setGame(PREVIEW_GAME));
}

/** Prüft, dass die Vorschau nur den lokalen Stand ändert. */
async function checkSignPreview() {
  check(await setSign("cs2"), "Heben muss in der Vorschau klappen");
  check(current.state.game.me.sign === "cs2", "Die Vorschau zeigt das Schild");
  check(await setSign(null), "Senken muss in der Vorschau klappen");
  check(current.state.game.me.sign === null, "Die Vorschau senkt das Schild");
}

/** Führt dieselben Hooks als Desktop oder reine Vorschau aus. */
async function run() {
  mockIPC((command, args) => {
    requests.push({ command, args });
    return answer();
  });
  await act(async () => root.render(createElement(Harness)));
  if (!preview) await checkRequest();
  await checkLifetime();
  if (!preview) await checkFailures();
  await (preview ? checkSignPreview() : checkSignRequests());
  answer = () => PREVIEW_GAME;
  await act(async () =>
    current.state.setCatalog({
      ...PREVIEW_CATALOG,
      emotes: [...PREVIEW_CATALOG.emotes, { key: "future", label: "Neue Geste" }],
    }),
  );
  check(
    (await play("future")) && current.activeEmote.label === "Neue Geste",
    "Neue Server-Emotes bleiben nutzbar",
  );
  if (preview) check(requests.length === 0, "Die Vorschau darf kein Backend aufrufen");
  return `${preview ? "Vorschau" : "Desktop-Mock"}: alle Emote- und Schild-Prüfungen bestanden.`;
}

try {
  document.getElementById("result").textContent = await run();
  document.body.dataset.result = "passed";
} catch (error) {
  document.getElementById("result").textContent = String(error);
  document.body.dataset.result = "failed";
} finally {
  await act(async () => root.unmount());
  clearMocks();
}

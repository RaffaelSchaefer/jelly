/**
 * Hörprobe der Jelly-News: plant eine Sendung wie `news-check.mjs` (90 Sekunden, Vorleser, meiste
 * XP, zwei Erfolge, ein Turm, „Vermischtes“, nächster Programmpunkt), zeigt jeden Satz des
 * Vorlesers mit Zeit, Silben und Tempo und spielt ihn auf Klick in seiner Stimme. „Ganze Sendung“
 * rendert Jingle, leise Musik und alle Sätze offline durch dieselbe Kette wie im Pet
 * (`src/newsVoiceRender.ts`) und spielt das Ergebnis. Unter /scripts/news-voice-check.html über den
 * Vite-Server öffnen.
 *
 * Parameter: `render` rendert sofort und legt das WAV bereit (16 Bit, Mono): `window.newsVoiceWav`
 * ist eine Blob-URL, `window.newsVoiceChunk(index, bytes)` liefert ein Stück davon als Base64 (für
 * Skripte über das DevTools-Protokoll), `window.newsVoicePhrases` die Sätze mit Zeiten in Sekunden,
 * und `document.body.dataset.ready` wird `true`. `rate` (Abtastrate, sonst 48000). Einzelne Spuren:
 * `nojingle`, `novoice` und `nobed` lassen Jingle, Stimme oder Musik weg, `bedonly` rendert nur die
 * Musik.
 *
 * Zur Sendung: `seconds` (Dauer, sonst 90), `endsAt` (Ende in Unix-Millisekunden, sonst ein fester
 * Wert: Es bestimmt den Zufall der Sätze, so klingt jedes Rendern gleich), `presenter` (ID des
 * Vorlesers, sonst 1), `nopresenter`, `own` (ID des eigenen Jellys, sonst 2: Mit `own=1` liest es
 * selbst vor und spricht mit eigener Stimme), `achievements` (sonst 2, höchstens 5), `stack`
 * (Jellies im höchsten Turm, sonst 3, 0 für keinen), `xp` (sonst 420), `noxp`, `title` (Titel des
 * nächsten Punkts, sonst „CS2-Turnier“), `kind` (seine Art, sonst `tournament`, eine dringende) und
 * `nonext`. Der Beginn ist wie beim Pet `created_at` des Ereignisses: `endsAt` minus `seconds`.
 *
 * @module
 */

import { renderNewsVoice } from "../src/newsVoiceRender.ts";
import { anchorVoice, contourOf, listAnchorPhrases, planAnchor } from "../src/pet/index.ts";
import { createVoice } from "../src/voice.ts";

const PARAMS = new URLSearchParams(location.search);
const count = (name, usual) => Number(PARAMS.get(name) ?? usual);
const SECONDS = count("seconds", 90);
const ENDS_AT = count("endsAt", 1_795_000_090_000);
const OWN = count("own", 2);
const RATE = count("rate", 48000);
const KEYS = ["hydrated", "hatched", "marathon", "matching", "conga"];

/** Das Ereignis, mit dem der Server die Sendung beginnt. */
function createEvent() {
  const achievements = Math.min(5, count("achievements", 2));
  const stack = count("stack", 3);
  const next = {
    starts_at: ENDS_AT + 25 * 60_000,
    ends_at: null,
    title: PARAMS.get("title") ?? "CS2-Turnier",
    detail: "Finale auf der Hauptbühne",
    kind: PARAMS.get("kind") ?? "tournament",
  };
  const news = {
    top_xp: PARAMS.has("noxp") ? null : { player_id: 2, xp: count("xp", 420) },
    achievements: KEYS.slice(0, achievements).map((key, index) => ({ player_id: index + 3, key })),
    tallest_stack: Array.from({ length: stack }, (_, index) => 20 + index),
    next_item: PARAMS.has("nonext") ? null : next,
  };
  const presenter = PARAMS.has("nopresenter") ? null : count("presenter", 1);
  return {
    id: 1,
    type: "gathering.changed",
    player_id: null,
    created_at: ENDS_AT - SECONDS * 1000,
    payload: { kind: "news", winner_id: null, ends_at: ENDS_AT, presenter_id: presenter, news },
  };
}

const event = createEvent();
const plan = planAnchor(event);
const voice = plan && anchorVoice(plan.show.presenterId, OWN);
const phrases = plan && voice ? listAnchorPhrases(plan, voice) : [];
const status = document.querySelector("#status");

/** Ein Wert mit einer Nachkommastelle. */
const fixed = (value) => value.toFixed(1);

/** Die Tabelle der Sätze: wann, wie lange, zu welchem Beitrag, in welchem Ton. */
function showTable() {
  const rows = phrases.map((phrase) => {
    const at = (phrase.at - plan.startedAt) / 1000;
    const last = phrase.notes.at(-1);
    const seconds = last ? last.at + last.duration : 0;
    const end = (phrase.beatEndsAt - plan.startedAt) / 1000;
    const rate = phrase.notes.length / seconds;
    return `<tr><td>${phrase.beat.kind}</td><td>${contourOf(phrase.beat)}</td><td>${fixed(at)}</td><td>${fixed(seconds)}</td><td>${phrase.notes.length}</td><td>${fixed(rate)}</td><td>${fixed(end)}</td></tr>`;
  });
  const head =
    "<tr><th>Beitrag</th><th>Ton</th><th>ab s</th><th>Länge s</th><th>Silben</th><th>Silben/s</th><th>Beitrag bis s</th></tr>";
  document.querySelector("#table").innerHTML = head + rows.join("");
}

/** Je Beitrag der ersten Runde ein Knopf, der seinen Satz in der Stimme des Vorlesers spricht. */
function showBoard() {
  const speaker = createVoice();
  const board = document.querySelector("#board");
  const seen = new Set();
  for (const phrase of phrases) {
    const label = `${phrase.beat.kind} (${contourOf(phrase.beat)})`;
    if (seen.has(label)) continue;
    seen.add(label);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      speaker.arm();
      speaker.play(phrase.notes, voice.own ? undefined : voice.timbre);
    });
    board.append(button);
  }
}

/** Ein Mono-Puffer als WAV mit 16 Bit. */
function encodeWav(buffer) {
  const data = buffer.getChannelData(0);
  const view = new DataView(new ArrayBuffer(44 + data.length * 2));
  const text = (offset, value) => {
    for (const [index, char] of [...value].entries())
      view.setUint8(offset + index, char.charCodeAt(0));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + data.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, data.length * 2, true);
  data.forEach((sample, index) =>
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true),
  );
  return new Blob([view], { type: "audio/wav" });
}

/** Die höchste Spitze in dBFS. */
function peakDb(buffer) {
  let peak = 0;
  for (const sample of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(sample));
  return 20 * Math.log10(peak || 1e-9);
}

/** Rendert die Sendung und legt das WAV für Skripte und zum Herunterladen bereit. */
async function render() {
  status.textContent = "Rendere …";
  const options = {
    ownId: OWN,
    rate: RATE,
    jingle: !PARAMS.has("nojingle") && !PARAMS.has("bedonly"),
    voice: !PARAMS.has("novoice") && !PARAMS.has("bedonly"),
    bed: !PARAMS.has("nobed"),
  };
  const result = await renderNewsVoice(event, options);
  if (!result) {
    status.textContent = "Keine Sendung.";
    return null;
  }
  const blob = encodeWav(result.buffer);
  window.newsVoiceWav = URL.createObjectURL(blob);
  window.newsVoicePhrases = result.phrases;
  window.newsVoiceChunk = async (index, bytes) => {
    const slice = new Uint8Array(
      await blob.slice(index * bytes, (index + 1) * bytes).arrayBuffer(),
    );
    let binary = "";
    for (const byte of slice) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  const link = document.querySelector("#download");
  link.href = window.newsVoiceWav;
  link.hidden = false;
  const seconds = fixed(result.buffer.duration);
  status.textContent = `${seconds} s gerendert, ${blob.size} Bytes, Spitze ${fixed(peakDb(result.buffer))} dBFS, ${result.own ? "eigene Stimme" : "Stimme des Vorlesers"}.`;
  document.body.dataset.ready = "true";
  return result.buffer;
}

/** Rendert und spielt die ganze Sendung. */
async function playShow() {
  const buffer = await render();
  if (!buffer) return;
  const context = new AudioContext();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
}

if (plan) {
  status.textContent = `${phrases.length} Sätze in ${SECONDS} s, ${plan.show.beats.length} Beiträge je Runde.`;
  showTable();
  showBoard();
} else {
  status.textContent = "Keine Sendung.";
}
document.querySelector("#show").addEventListener("click", () => void playShow());
if (PARAMS.has("render")) void render();

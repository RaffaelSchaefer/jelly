// Records the stage canvas in headless Firefox and saves it as WebM. Needs a running demo.
// Usage: node scripts/record-stage.mjs <stage-url> <out.webm> [seconds] [width] [height]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, seconds = "20", width = "1600", height = "900"] = process.argv.slice(2);
const debugPort = 19222;
const connectTries = 40;
const connectPauseMs = 500;
const settleMs = 2000;
const framesPerSecond = 30;
const videoBitsPerSecond = 12_000_000;

const pause = (duration) => new Promise((done) => setTimeout(done, duration));

/** Runs in the page: records the canvas and returns the video as base64. */
const recordInPage = `async (durationMs, frames, bits) => {
  const canvas = document.getElementById("stage");
  const recorder = new MediaRecorder(canvas.captureStream(frames), {
    mimeType: "video/webm", videoBitsPerSecond: bits,
  });
  const chunks = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  const stopped = new Promise((done) => { recorder.onstop = done; });
  recorder.start();
  await new Promise((done) => setTimeout(done, durationMs));
  recorder.stop();
  await stopped;
  const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
  let binary = "";
  for (const byte of bytes) { binary += String.fromCharCode(byte); }
  return btoa(binary);
}`;

async function connect() {
  for (let attempt = 0; attempt < connectTries; attempt += 1) {
    await pause(connectPauseMs);
    const socket = await new Promise((done) => {
      const trial = new WebSocket(`ws://127.0.0.1:${debugPort}/session`);
      trial.onopen = () => done(trial);
      trial.onerror = () => done(null);
    });
    if (socket) {
      return socket;
    }
  }
  throw new Error("firefox did not open its debug port");
}

const profile = mkdtempSync(join(tmpdir(), "jelly-record-"));
const firefox = spawn(
  "firefox",
  ["--headless", "--no-remote", "--profile", profile, `--remote-debugging-port=${debugPort}`, "about:blank"],
  { stdio: "ignore" },
);
try {
  const socket = await connect();
  let nextId = 1;
  const waiting = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      waiting.get(message.id)?.(message);
    }
  };
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = nextId++;
      waiting.set(id, (message) =>
        message.type === "error" ? fail(new Error(message.message)) : done(message.result),
      );
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send("session.new", { capabilities: {} });
  const { contexts } = await send("browsingContext.getTree");
  const { context } = contexts[0];
  const viewport = { width: Number(width), height: Number(height) };
  await send("browsingContext.setViewport", { context, viewport });
  await send("browsingContext.navigate", { context, url, wait: "complete" });
  await pause(settleMs);
  const number = (value) => ({ type: "number", value });
  const { result, exceptionDetails } = await send("script.callFunction", {
    functionDeclaration: recordInPage,
    target: { context },
    awaitPromise: true,
    arguments: [number(Number(seconds) * 1000), number(framesPerSecond), number(videoBitsPerSecond)],
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.text);
  }
  writeFileSync(out, Buffer.from(result.value, "base64"));
} finally {
  firefox.kill();
  await pause(connectPauseMs);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(0);

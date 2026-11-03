// Measures the stage in headless Chrome over the DevTools protocol and can save a screenshot.
// Needs a running demo. Prints main thread and script time per painted frame.
// Usage: node benchmarks/stage.mjs <stage-url> [seconds] [screenshot.png]
// Set CHROME to the browser binary, for example the one in /Applications on macOS.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, seconds = "20", screenshot] = process.argv.slice(2);
const chrome = process.env.CHROME ?? "chromium";
const viewport = { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false };
const debugPort = 19223;
const connectTries = 40;
const connectPauseMs = 500;
// Jellies walk from the lounge to their seats first, the measurement starts once they stand.
const settleMs = 15_000;

const pause = (duration) => new Promise((done) => setTimeout(done, duration));

/** Runs in the page: counts painted frames, the stage copies its 3D picture once per frame. */
const countFrames = `(() => {
  window.paintedFrames = 0;
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    window.paintedFrames += 1;
    return draw.apply(this, args);
  };
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
})()`;

async function connect() {
  for (let attempt = 0; attempt < connectTries; attempt += 1) {
    await pause(connectPauseMs);
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const page = (await response.json()).find((target) => target.type === "page");
      if (page) {
        return new WebSocket(page.webSocketDebuggerUrl);
      }
    } catch {
      // Chrome is still starting.
    }
  }
  throw new Error("chrome did not open its debug port");
}

const profile = mkdtempSync(join(tmpdir(), "jelly-stage-"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--no-first-run",
    "--ignore-gpu-blocklist",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
try {
  const socket = await connect();
  await new Promise((done) => (socket.onopen = done));
  let nextId = 1;
  const waiting = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    waiting.get(message.id)?.(message);
  };
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = nextId++;
      waiting.set(id, (message) =>
        message.error ? fail(new Error(message.error.message)) : done(message.result),
      );
      socket.send(JSON.stringify({ id, method, params }));
    });
  const readMetrics = async () => {
    const { metrics } = await send("Performance.getMetrics");
    return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
  };
  const countPainted = async () =>
    (await send("Runtime.evaluate", { expression: "window.paintedFrames" })).result.value;

  await send("Emulation.setDeviceMetricsOverride", viewport);
  await send("Page.enable");
  await send("Page.navigate", { url });
  await pause(settleMs);
  const { result } = await send("Runtime.evaluate", { expression: countFrames });
  await send("Performance.enable");
  const before = await readMetrics();
  const framesBefore = await countPainted();
  await pause(Number(seconds) * 1000);
  const after = await readMetrics();
  const frames = (await countPainted()) - framesBefore;
  const perFrame = (name) => (((after[name] - before[name]) * 1000) / frames).toFixed(1);
  console.log(`renderer: ${result.value}`);
  console.log(`frames per second: ${(frames / Number(seconds)).toFixed(1)}`);
  console.log(`script per frame: ${perFrame("ScriptDuration")} ms`);
  console.log(`main thread per frame: ${perFrame("TaskDuration")} ms`);
  if (screenshot) {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(screenshot, Buffer.from(data, "base64"));
  }
} finally {
  browser.kill();
  await pause(connectPauseMs);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(0);

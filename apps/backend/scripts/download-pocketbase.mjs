// Downloads the PocketBase binary for the current platform (pinned by default,
// overridable via POCKETBASE_VERSION) and applies migrations once so that
// pb_data/ (incl. types.d.ts for editor tooling) exists.
//
// Usage:
//   node scripts/download-pocketbase.mjs
//   POCKETBASE_VERSION=v0.39.11 node scripts/download-pocketbase.mjs
//   FORCE=1 node scripts/download-pocketbase.mjs   (re-download)

import { execSync } from "node:child_process";
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PINNED_VERSION = "v0.39.11";
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function log(msg) {
  console.log(`[joint/backend] ${msg}`);
}

function resolveVersion() {
  const requested = process.env.POCKETBASE_VERSION || PINNED_VERSION;
  return requested.startsWith("v") ? requested : `v${requested}`;
}

function platformInfo() {
  const osMap = { darwin: "darwin", linux: "linux", win32: "windows" };
  const archMap = { x64: "amd64", arm64: "arm64", ia32: "386" };
  const os = osMap[process.platform];
  const arch = archMap[process.arch];
  if (!os || !arch) {
    throw new Error(
      `Unsupported platform: ${process.platform}/${process.arch}. Download PocketBase manually from https://github.com/pocketbase/pocketbase/releases`,
    );
  }
  return { os, arch, isWindows: process.platform === "win32" };
}

function binaryPath({ isWindows }) {
  return path.join(APP_DIR, isWindows ? "pocketbase.exe" : "pocketbase");
}

async function download(url, targetZip) {
  log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed with HTTP ${res.status}`);
  }
  await pipeline(res.body, createWriteStream(targetZip));
}

function extract(zipPath, outDir, { isWindows }) {
  mkdirSync(outDir, { recursive: true });
  if (isWindows) {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '${zipPath}' -DestinationPath '${outDir}'"`,
      { stdio: "inherit" },
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: "inherit" });
  }
}

function runMigrations(binary) {
  // Bootstraps the app once: creates pb_data/, writes pb_data/types.d.ts and
  // applies all pb_migrations/. Idempotent.
  const cmd = process.platform === "win32" ? binary : `"${binary}"`;
  log("Applying migrations (generates pb_data/types.d.ts)...");
  execSync(`${cmd} migrate up`, { cwd: APP_DIR, stdio: "inherit" });
}

async function main() {
  const version = resolveVersion();
  const { os, arch, isWindows } = platformInfo();
  const binary = binaryPath({ isWindows });

  const force = process.env.FORCE === "1";
  if (!force && existsSync(binary)) {
    log(`PocketBase ${version} already present (${binary}), skipping download.`);
    runMigrations(binary);
    return;
  }

  const url = `https://github.com/pocketbase/pocketbase/releases/download/${version}/pocketbase_${version.slice(1)}_${os}_${arch}.zip`;
  const tmpDir = path.join(APP_DIR, ".pb-tmp");
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, "pocketbase.zip");

  try {
    await download(url, zipPath);
    extract(zipPath, tmpDir, { isWindows });
    const extracted = path.join(tmpDir, isWindows ? "pocketbase.exe" : "pocketbase");
    if (!existsSync(extracted)) {
      throw new Error(`Archive did not contain expected binary at ${extracted}`);
    }
    rmSync(binary, { force: true });
    // Move instead of copy to preserve the executable bit on unix systems.
    execSync(`mv "${extracted}" "${binary}"`);
    if (!isWindows) chmodSync(binary, 0o755);
    log(`Installed PocketBase ${version} -> ${binary}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  runMigrations(binary);
}

main().catch((err) => {
  console.error(`[joint/backend] ${err.message ?? err}`);
  process.exitCode = 1;
});

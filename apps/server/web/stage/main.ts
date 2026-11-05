/**
 * The stage page: shows the stage of `@jelly/stage` over the whole window, with the key from the
 * address, and reports problems at the bottom.
 *
 * @module
 */

import { createStageView, LENS_RANGE } from "@jelly/stage";

import { createServerSource, RequestError } from "./connection.ts";

/** `?scale=` sets the detail of the 3D picture relative to the canvas, for slow or fast machines. */
const SCALE_RANGE = { lowest: 0.25, highest: 2, usual: 1 };
const TEXT_WRONG_KEY = "Der Bühnen-Link ist ungültig. Bitte den vollständigen Link öffnen.";
const TEXT_OFFLINE = "Keine Verbindung zum Server. Neuer Versuch läuft …";
const TEXT_NO_WEBGL = "Dieser Browser kann die 3D-Bühne nicht zeichnen.";
const STATUS_UNAUTHORIZED = 401;

/** Finds a page element. A missing one means the page itself is broken. */
function findElement<Type extends HTMLElement>(id: string): Type {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`missing element #${id}`);
  }
  return element as Type;
}

/** Shows a problem at the bottom of the stage, or hides it with an empty text. */
function showStatus(text: string): void {
  const status = findElement("status");
  status.textContent = text;
  status.hidden = text === "";
}

/** Reads a number from the address and keeps it in its range. */
function readSetting(
  parameters: URLSearchParams,
  name: string,
  range: { lowest: number; highest: number; usual: number },
): number {
  const value = Number(parameters.get(name) ?? range.usual);
  if (!Number.isFinite(value)) {
    return range.usual;
  }
  return Math.min(range.highest, Math.max(range.lowest, value));
}

/** Starts the page. */
function startStage(): void {
  const parameters = new URLSearchParams(window.location.search);
  try {
    createStageView({
      canvas: findElement<HTMLCanvasElement>("stage"),
      source: createServerSource(parameters.get("key") ?? ""),
      lensStrength: readSetting(parameters, "lens", LENS_RANGE),
      renderScale: readSetting(parameters, "scale", SCALE_RANGE),
      onState: () => showStatus(""),
      onError: (error) => {
        const isWrongKey = error instanceof RequestError && error.status === STATUS_UNAUTHORIZED;
        showStatus(isWrongKey ? TEXT_WRONG_KEY : TEXT_OFFLINE);
      },
      onConnectionChange: (isOpen) => showStatus(isOpen ? "" : TEXT_OFFLINE),
    });
  } catch {
    showStatus(TEXT_NO_WEBGL);
  }
}

startStage();

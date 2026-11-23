/**
 * Lädt das 3D-Jelly oben auf der Seite nach, sobald der Browser Luft hat. Bis dahin und ohne WebGL
 * steht dort das Bild aus `jelly-poster.svg`. Mit dem Jelly erscheinen die Farbknöpfe, im Fuß
 * schaut später sein Kopf herauf.
 *
 * @module
 */

import { JELLY_COLORS, type JellyColor } from "@jelly/scene/colors";

import type { Lang } from "../i18n/lang.ts";
import type { HeroControls, runHero } from "./run.ts";

import { t, type TextKey } from "../i18n/text.ts";
import { FOOTER_VIEW } from "./views.ts";

/** Farben zum Ausprobieren. Die übrigen gibt es in der App. */
const SWATCHES: JellyColor[] = ["mint", "sky", "violet", "rose", "tangerine", "clover"];

/** Die laufenden Jellies: das oben und, sobald er in Sicht kommt, der Kopf im Fuß. */
const jellies: HeroControls[] = [];
let chosen: JellyColor = "mint";

/** Führt `task` aus, sobald der Browser nichts Dringenderes zu tun hat. */
function whenIdle(task: () => void) {
  // Safari kennt `requestIdleCallback` erst seit kurzem.
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(task, { timeout: 1500 });
  } else {
    setTimeout(task, 200);
  }
}

/**
 * Färbt den Akzent der Seite wie das Jelly: Knöpfe, Links und Marken nehmen sein Leuchten an. Aqua
 * ist die Farbe der Seite selbst, dafür gelten wieder die Werte aus `tokens.css`.
 */
function tintPage(color: JellyColor) {
  const root = document.documentElement.style;
  const { glow, ink } = JELLY_COLORS[color];
  for (const [name, value] of [
    ["--accent", glow],
    ["--accent-ink", ink],
    ["--jelly-glow", glow],
  ] as const) {
    if (color === "mint") root.removeProperty(name);
    else root.setProperty(name, value);
  }
}

/** Markiert die gewählte Farbe. */
function markChosen(group: HTMLElement) {
  for (const button of group.querySelectorAll<HTMLButtonElement>("button[data-color]")) {
    button.setAttribute("aria-pressed", String(button.dataset.color === chosen));
  }
}

/** Baut die Farbknöpfe. */
function renderSwatches(group: HTMLElement) {
  for (const color of SWATCHES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.dataset.color = color;
    const { hex, glow } = JELLY_COLORS[color];
    button.style.setProperty("--swatch", `linear-gradient(160deg, ${hex}, ${glow})`);
    button.addEventListener("click", () => {
      chosen = color;
      for (const jelly of jellies) jelly.setColor(color);
      tintPage(color);
      markChosen(group);
    });
    group.append(button);
  }
  markChosen(group);
}

/** Beschriftet die Farbknöpfe in `lang`. */
export function labelSwatches(lang: Lang): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("#hero-swatches .swatch")) {
    const label = t(lang, `color.${button.dataset.color}` as TextKey);
    button.setAttribute("aria-label", label);
    button.title = label;
  }
}

/**
 * Startet den Kopf im Fuß, kurz bevor er in Sicht kommt: Er braucht einen zweiten WebGL-Kontext.
 * Ohne ihn schrumpft der Fuß auf seine Textzeile.
 */
function startFooterJelly(run: typeof runHero) {
  const host = document.getElementById("footer-jelly");
  if (!host) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      try {
        jellies.push(run(host, chosen, FOOTER_VIEW));
      } catch (error: unknown) {
        host.hidden = true;
        console.info("Der Fuß bleibt ohne Jelly:", error);
      }
    },
    { rootMargin: "600px" },
  );
  observer.observe(host);
}

/**
 * Startet das Jelly, wenn der Browser Luft hat.
 *
 * @param lang - Sprache für die Beschriftung der Farbknöpfe.
 */
export function startHero(lang: () => Lang): void {
  const host = document.getElementById("hero-jelly");
  const group = document.getElementById("hero-swatches");
  if (!host || !group) return;
  whenIdle(() => {
    import("./run.ts")
      .then(({ runHero }) => {
        jellies.push(runHero(host, chosen));
        startFooterJelly(runHero);
        renderSwatches(group);
        labelSwatches(lang());
        group.hidden = false;
      })
      .catch((error: unknown) => {
        // Ohne WebGL oder bei einem Ladefehler bleibt das Bild stehen, die Seite geht trotzdem.
        console.info("Jelly bleibt ein Bild:", error);
      });
  });
}

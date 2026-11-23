/**
 * Die Wahl des Betriebssystems unter „Loslegen“, nach dem Muster „Tabs“ der WAI-ARIA Authoring
 * Practices: Pfeile wechseln den Reiter, Pos1 und Ende springen an den Rand. Ohne Skript stehen
 * alle Anleitungen untereinander.
 *
 * @module
 */

import { SYSTEMS, type System } from "./downloads/release.ts";

/** Das System hinter einem Reiter, aus seiner Kennung `tab-<system>`. */
function systemOf(tab: HTMLElement): System | undefined {
  return SYSTEMS.find((system) => tab.id === `tab-${system}`);
}

/** Wählt den Reiter `index` und zeigt seine Anleitung. */
function select(tabs: HTMLElement[], index: number, focus: boolean) {
  tabs.forEach((tab, position) => {
    const selected = position === index;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
    if (panel) panel.hidden = !selected;
  });
  if (focus) tabs[index]?.focus();
}

/** Ziel einer Taste in der Reiterleiste, `null` für Tasten ohne Bedeutung. */
function keyTarget(key: string, index: number, count: number): number | null {
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * Verdrahtet die Reiter und öffnet den für `initial`.
 *
 * @param onSelect - Erfährt jedes neu gewählte System, damit der Download dazu passt.
 */
export function startSystemTabs(initial: System, onSelect: (system: System) => void): void {
  const tabs = [...document.querySelectorAll<HTMLElement>("#start-tabs [role=tab]")];
  if (tabs.length === 0) return;
  const choose = (index: number, focus: boolean) => {
    select(tabs, index, focus);
    const system = tabs[index] ? systemOf(tabs[index]) : undefined;
    if (system) onSelect(system);
  };
  const start = tabs.findIndex((tab) => systemOf(tab) === initial);
  select(tabs, Math.max(0, start), false);
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => choose(index, false));
    tab.addEventListener("keydown", (event) => {
      const target = keyTarget(event.key, index, tabs.length);
      if (target === null) return;
      event.preventDefault();
      choose(target, true);
    });
  });
}

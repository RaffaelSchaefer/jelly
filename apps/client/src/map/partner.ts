/**
 * Partner-Emotes auf der Karte: Klick aufs eigene Jelly, Geste wählen, ein leuchtendes Jelly in der
 * Nähe auffordern und auf die Antwort warten.
 *
 * Die Antwort des anderen entscheidet der Server. Bei einer Annahme schließt Rust die Karte, das
 * Pet zeigt das Duett (siehe `src-tauri/src/events.rs`). Hier bleibt nur der Weg dorthin.
 *
 * @module
 */

import type { ScreenPoint, StageEvent, StageHighlight } from "@jelly/stage";

import type { MapSource } from "./source";

import { classifyInvite, NEAR_DISTANCE, type CatalogEntry, type PartnerInvite } from "../pet";

/** Abstand des Fensters zum Klick und zum Rand. */
const MENU_OFFSET = 24;
const MENU_MARGIN = 12;
const SECOND_MS = 1000;
const INVITE_EVENT = "partner_emote.updated";

/** Wo der Ablauf gerade steht. */
export type PartnerStep =
  | { kind: "idle" }
  | { kind: "gesture" }
  | { kind: "target"; entry: CatalogEntry }
  | { kind: "waiting"; invite: PartnerInvite; name: string };

/** Was der Ablauf von der Seite braucht. */
export interface PartnerContext {
  source: MapSource;
  /** Das Jelly, das am Punkt gewählt werden kann. */
  pickAt: (point: ScreenPoint) => number | null;
  findName: (playerId: number) => string;
  /** Uhrzeit des Servers jetzt. */
  readServerTime: () => number;
  setHighlight: (highlight: StageHighlight | null) => void;
  /** Zeigt eine Meldung in der Statuszeile. */
  report: (message: string) => void;
}

/** Der Ablauf und seine Elemente aus `map.html`. */
export interface PartnerFlow {
  context: PartnerContext;
  step: PartnerStep;
  /** `null`, bis der Katalog einmal gelesen ist. */
  entries: CatalogEntry[] | null;
  menu: HTMLElement;
  bar: HTMLElement;
  note: HTMLElement;
  /** Ein Aufruf läuft. Ein zweiter Klick soll nicht noch ein Jelly auffordern. */
  sending: boolean;
  clock: ReturnType<typeof setInterval> | undefined;
}

/** Was im Schritt leuchtet: erst alle anderen, nach der Wahl der Geste nur noch die in der Nähe. */
function highlightOf(step: PartnerStep): StageHighlight | null {
  if (step.kind === "gesture") return { kind: "others" };
  return step.kind === "target" ? { kind: "near", reach: NEAR_DISTANCE } : null;
}

/** Sekunden bis zum Ablauf, nie unter 0. */
function secondsLeft(flow: PartnerFlow, invite: PartnerInvite) {
  const left = invite.expires_at - flow.context.readServerTime();
  return Math.max(0, Math.round(left / SECOND_MS));
}

/** Schreibt die Restzeit. Abgelaufen meldet der Server nichts, also gibt die Uhr hier auf. */
function tickWaiting(flow: PartnerFlow, invite: PartnerInvite, name: string) {
  const seconds = secondsLeft(flow, invite);
  if (seconds > 0) {
    flow.note.textContent = `Warte auf ${name} … ${seconds} s`;
    return;
  }
  show(flow, { kind: "idle" });
  flow.context.report(`${name} hat nicht geantwortet.`);
}

/** Wechselt in einen Schritt und zeigt, was zu ihm gehört. */
function show(flow: PartnerFlow, step: PartnerStep) {
  clearInterval(flow.clock);
  flow.step = step;
  flow.menu.hidden = step.kind !== "gesture";
  flow.bar.hidden = step.kind !== "target" && step.kind !== "waiting";
  flow.context.setHighlight(highlightOf(step));
  if (step.kind === "target") {
    flow.note.textContent = `${step.entry.label}: Wer leuchtet, steht nah genug.`;
  }
  if (step.kind === "waiting") {
    const { invite, name } = step;
    tickWaiting(flow, invite, name);
    flow.clock = setInterval(() => tickWaiting(flow, invite, name), SECOND_MS);
  }
}

/** Legt die Gesten ins Fenster. Sie bleiben im DOM: Das Glas zählt seine Tropfen der Reihe nach. */
function fillMenu(flow: PartnerFlow, entries: CatalogEntry[]) {
  flow.menu.replaceChildren(
    ...entries.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "glass-pill";
      button.dataset.liquid = "calm";
      button.textContent = entry.label;
      button.addEventListener("click", () => show(flow, { kind: "target", entry }));
      return button;
    }),
  );
}

/** Setzt das Fenster neben den Klick, ganz innerhalb der Karte. */
function placeMenu(menu: HTMLElement, at: ScreenPoint) {
  const area = menu.parentElement!;
  const maxLeft = area.clientWidth - menu.offsetWidth - MENU_MARGIN;
  const maxTop = area.clientHeight - menu.offsetHeight - MENU_MARGIN;
  const left = Math.min(maxLeft, at.x + MENU_OFFSET);
  const top = Math.min(maxTop, at.y - menu.offsetHeight / 2);
  menu.style.left = `${Math.max(MENU_MARGIN, left)}px`;
  menu.style.top = `${Math.max(MENU_MARGIN, top)}px`;
}

/** Öffnet das Fenster mit den Gesten neben dem eigenen Jelly. Eine laufende Aufforderung geht vor. */
export async function openGestures(flow: PartnerFlow, at: ScreenPoint) {
  if (flow.step.kind !== "idle") return;
  try {
    if (!flow.entries) {
      flow.entries = await flow.context.source.readPartnerEmotes();
      fillMenu(flow, flow.entries);
    }
  } catch (cause) {
    flow.context.report(String(cause));
    return;
  }
  show(flow, { kind: "gesture" });
  placeMenu(flow.menu, at);
}

/** Fordert ein Jelly auf. Sagt der Server `too_far`, bleibt die Wahl offen. */
async function invite(flow: PartnerFlow, key: string, playerId: number) {
  flow.sending = true;
  try {
    const sent = await flow.context.source.invitePartner(key, playerId);
    show(flow, { kind: "waiting", invite: sent, name: flow.context.findName(playerId) });
  } catch (cause) {
    flow.context.report(String(cause));
  }
  flow.sending = false;
}

/**
 * Ein Klick auf die Bühne. `true`, wenn er zum Ablauf gehört. Sonst gilt er wie immer, auch während
 * man wartet.
 */
export function handleStageClick(flow: PartnerFlow, point: ScreenPoint) {
  const { step } = flow;
  if (step.kind === "gesture") show(flow, { kind: "idle" });
  if (step.kind === "target") {
    const picked = flow.context.pickAt(point);
    if (picked !== null && !flow.sending) void invite(flow, step.entry.key, picked);
  }
  return step.kind === "gesture" || step.kind === "target";
}

/** Bricht ab. Eine schon gesendete Aufforderung zieht das Jelly zurück. */
export function cancelFlow(flow: PartnerFlow) {
  const { step } = flow;
  show(flow, { kind: "idle" });
  if (step.kind !== "waiting") return;
  void flow.context.source
    .cancelInvite(step.invite.id)
    .catch((cause) => flow.context.report(String(cause)));
}

/** Escape schließt Fenster und Wahl. Beim Warten braucht es den Knopf, das soll bewusst sein. */
export function handleEscape(flow: PartnerFlow) {
  if (flow.step.kind === "gesture" || flow.step.kind === "target") show(flow, { kind: "idle" });
}

/** Hört auf die Antwort des anderen. Bei einer Annahme schließt Rust gleich die Karte. */
export function handleInviteEvent(flow: PartnerFlow, event: StageEvent, ownId: number | null) {
  if (event.type !== INVITE_EVENT || flow.step.kind !== "waiting") return;
  const change = classifyInvite(event.payload, ownId ?? undefined);
  if (change?.role !== "mine" || change.invite.id !== flow.step.invite.id) return;
  if (change.invite.state === "pending") return;
  const { name } = flow.step;
  show(flow, { kind: "idle" });
  if (change.invite.state === "declined") flow.context.report(`${name} möchte gerade nicht.`);
}

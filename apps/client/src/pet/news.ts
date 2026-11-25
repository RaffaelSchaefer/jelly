/**
 * Was das Pet von den Jelly-News mitbekommt: ob das eigene Jelly vorliest, genannt wird oder nur
 * zuschaut, was es dazu sagt und ob der Jingle erklingt. Die Sendung selbst läuft auf Bühne und
 * Karte (`@jelly/stage`), hier kommt nur ihr Beginn als `gathering.changed` an.
 *
 * Der Inhalt wird Feld für Feld gelesen: Ein neuerer oder älterer Server darf Teile weglassen oder
 * anders füllen, dann ist das Jelly eben nicht genannt.
 *
 * @module
 */

import type { Catalog, ServerEvent } from "./types";

/** Was das eigene Jelly in der Sendung ist: Vorleser, genannt oder im Publikum. */
export type NewsRole = "presenter" | "named" | "watching";

/** Wie das Pet auf den Beginn der Jelly-News reagiert. */
export interface NewsCue {
  /** Kennzeichen der Sendung, ihr `ends_at`. Eine neue Sendung hat ein anderes. */
  show: number;
  role: NewsRole;
  /** Was das Jelly sagt. */
  message: string;
  /** Ob es dabei hüpft: Wer vorliest oder genannt wird, freut sich. */
  hops: boolean;
  /** Ob der Jingle erklingt, siehe {@link JINGLE_ROLES}. */
  jingle: boolean;
  /** Ob der Vorleser zu hören ist, siehe {@link ANCHOR_ROLES}. */
  anchor: boolean;
  /** Ob leise Musik unter der Sendung liegt, siehe {@link BED_ROLES}. */
  bed: boolean;
}

/** Wer die Sendung mitbekommt. */
export interface NewsViewer {
  /** Das eigene Jelly. */
  id: number;
  /** Uhrzeit des Servers in Millisekunden. */
  now: number;
  /** Für die Titel der Erfolge. */
  catalog: Catalog;
}

/**
 * Wer den Jingle hört. Er kündigt die Sendung an, also hört ihn jedes Pet. Sollen ihn nur Vorleser
 * und Genannte hören, fällt hier `watching` weg.
 */
export const JINGLE_ROLES: readonly NewsRole[] = ["presenter", "named", "watching"];

/**
 * Wer den Vorleser hört, wie er Beitrag für Beitrag die Sendung spricht (`newsSchedule.ts`). Auch
 * das ist jedes Pet, solange die Sendung läuft.
 */
export const ANCHOR_ROLES: readonly NewsRole[] = ["presenter", "named", "watching"];

/**
 * Wer die leise Musik unter der Sendung hört (`newsBed.ts`). Dieselben wie beim Vorleser: Sie trägt
 * seine Sätze.
 */
export const BED_ROLES: readonly NewsRole[] = ANCHOR_ROLES;

const TEXT_PRESENTING = "Ich moderiere die Jelly-News! Schau mir auf der Karte zu.";
const TEXT_PRESENTING_SELF = "Ich moderiere die Jelly-News und komme selbst drin vor!";
const TEXT_WATCHING = "Die Jelly-News laufen. Schau auf die Karte!";
const TEXT_TOP_XP = "Ich bin in den News: die meisten XP der Stunde!";
const TEXT_TOWER = "Ich bin in den News: unser Turm war der höchste!";
const TEXT_ACHIEVEMENT = "Ich bin in den News: mein neuer Erfolg!";

/** Ein Objekt aus dem Ereignis, sonst `null`. */
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Eine Liste aus dem Ereignis, sonst leer. */
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Die meisten XP der Stunde, mit Zahl, wenn der Server eine brauchbare schickt. */
function xpLine(xp: unknown) {
  if (typeof xp !== "number" || !Number.isFinite(xp) || xp <= 0) return TEXT_TOP_XP;
  return `Ich bin in den News: ${xp} XP in einer Stunde!`;
}

/** Der höchste Turm, mit seiner Höhe. Ein Turm hat mindestens zwei Jellies. */
function towerLine(height: number) {
  return height > 1 ? `Ich bin in den News: unser Turm, ${height} Jellies hoch!` : TEXT_TOWER;
}

/** Ein neuer Erfolg, mit Titel aus dem Katalog. Ein unbekannter bleibt namenlos. */
function achievementLine(key: unknown, catalog: Catalog) {
  const title = catalog.achievements.find((item) => item.key === key)?.title;
  return title ? `Ich bin in den News: mein Erfolg „${title}“!` : TEXT_ACHIEVEMENT;
}

/**
 * Was das Jelly über seinen Platz in den News sagt, oder `null`, wenn sie es nicht nennen. Steht es
 * in mehreren Teilen, zählt der auffälligste: XP vor Turm vor Erfolg.
 */
function namedLine(news: Record<string, unknown> | null, { id, catalog }: NewsViewer) {
  if (!news) return null;
  if (record(news.top_xp)?.player_id === id) return xpLine(record(news.top_xp)?.xp);
  const tower = list(news.tallest_stack);
  if (tower.includes(id)) return towerLine(tower.length);
  const earned = list(news.achievements).find((item) => record(item)?.player_id === id);
  return earned ? achievementLine(record(earned)?.key, catalog) : null;
}

/** Die Rolle des Jellys und sein Satz dazu. */
function roleLine(presenter: boolean, named: string | null) {
  if (presenter) {
    return { role: "presenter" as const, message: named ? TEXT_PRESENTING_SELF : TEXT_PRESENTING };
  }
  if (named) return { role: "named" as const, message: named };
  return { role: "watching" as const, message: TEXT_WATCHING };
}

/**
 * Was das Pet zum Ereignis `event` sagt, oder `null`, wenn es keine Jelly-News beginnen. Das Ende
 * einer Sendung, andere Gatherings und eine Sendung, die nach der Uhr des Servers schon vorbei ist,
 * etwa nach einem langen Schlaf des Geräts, bleiben still. IDs zählen nur als Zahl: `0` ist eine
 * gültige ID, `null` keine.
 */
export function newsCue(event: ServerEvent, viewer: NewsViewer): NewsCue | null {
  if (event.type !== "gathering.changed") return null;
  const gathering = record(event.payload);
  if (!gathering || gathering.kind !== "news") return null;
  const show = gathering.ends_at;
  if (typeof show !== "number" || !(show > viewer.now)) return null;
  const named = namedLine(record(gathering.news), viewer);
  const { role, message } = roleLine(gathering.presenter_id === viewer.id, named);
  const hops = role !== "watching";
  return {
    show,
    role,
    message,
    hops,
    jingle: JINGLE_ROLES.includes(role),
    anchor: ANCHOR_ROLES.includes(role),
    bed: BED_ROLES.includes(role),
  };
}

/**
 * Ob `event` laufende Jelly-News beendet: das Ende eines Gatherings (`null`) oder ein anderes, das
 * sie ersetzt. Rust lässt es durch, solange News laufen (`NewsOnAir` in `events.rs`).
 */
export function endsNews(event: ServerEvent): boolean {
  return event.type === "gathering.changed" && record(event.payload)?.kind !== "news";
}

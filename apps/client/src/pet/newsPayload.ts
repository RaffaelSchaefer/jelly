/**
 * Liest das Gathering der Jelly-News aus `gathering.changed`, bevor `planShow` es plant. Ein leerer
 * Teil darf `null` sein und wird zur leeren Liste, wie der Server ihn meint. Alles andere, das
 * nicht passt, verwirft die ganze Sendung: Einzelne Einträge wegzulassen verschöbe die Beiträge
 * gegen die Bühne, und dann spräche der Vorleser zum falschen Bild.
 *
 * @module
 */

import type { StageGathering, StageNews, StageScheduleItem } from "@jelly/stage";

/** Ein Objekt aus dem Ereignis, sonst `null`. */
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Ob `value` eine endliche Zahl ist. */
function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Eine Liste, `null` und Fehlendes als leer, `undefined`, wenn ein Eintrag nicht passt. */
function readList<T>(value: unknown, read: (item: unknown) => T | null): T[] | undefined {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  const items = value.map(read);
  return items.every((item): item is T => item !== null) ? items : undefined;
}

/** Die meisten XP der Stunde: `null` ohne, `undefined`, wenn sie nicht passen. */
function readTopXp(value: unknown): StageNews["top_xp"] | undefined {
  if (value === null || value === undefined) return null;
  const top = record(value);
  return top && isNumber(top.player_id) && isNumber(top.xp)
    ? { player_id: top.player_id, xp: top.xp }
    : undefined;
}

/** Ein Erfolg der Stunde. */
function readAchievement(value: unknown) {
  const entry = record(value);
  return entry && isNumber(entry.player_id) && typeof entry.key === "string"
    ? { player_id: entry.player_id, key: entry.key }
    : null;
}

/** Der nächste Programmpunkt: `null` ohne, `undefined`, wenn er nicht passt. */
function readNextItem(value: unknown): StageScheduleItem | null | undefined {
  if (value === null || value === undefined) return null;
  const item = record(value);
  if (!item || typeof item.title !== "string" || typeof item.kind !== "string") return undefined;
  if (!isNumber(item.starts_at)) return undefined;
  const endsAt = isNumber(item.ends_at) ? item.ends_at : null;
  const detail = typeof item.detail === "string" ? item.detail : null;
  return { starts_at: item.starts_at, ends_at: endsAt, title: item.title, detail, kind: item.kind };
}

/** Was die News melden, `null`, wenn ein Teil nicht passt. */
function readNews(value: unknown): StageNews | null {
  const news = record(value);
  if (!news) return null;
  const topXp = readTopXp(news.top_xp);
  const achievements = readList(news.achievements, readAchievement);
  const stack = readList(news.tallest_stack, (id) => (isNumber(id) ? id : null));
  const next = readNextItem(news.next_item);
  if (topXp === undefined || !achievements || !stack || next === undefined) return null;
  return { top_xp: topXp, achievements, tallest_stack: stack, next_item: next };
}

/** Der Vorleser: eine ID, `null` ohne, `undefined`, wenn sie nicht passt. */
function readPresenter(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return isNumber(value) ? value : undefined;
}

/**
 * Das Gathering der Jelly-News in `payload`, oder `null`: für andere Arten, das Ende (`null`) und
 * alles, was nicht zum Vertrag passt.
 */
export function readNewsGathering(payload: unknown): StageGathering | null {
  const gathering = record(payload);
  if (!gathering || gathering.kind !== "news" || !isNumber(gathering.ends_at)) return null;
  const presenter = readPresenter(gathering.presenter_id);
  const news = readNews(gathering.news);
  if (presenter === undefined || !news) return null;
  const startsAt = isNumber(gathering.starts_at) ? { starts_at: gathering.starts_at } : {};
  return {
    kind: "news",
    winner_id: null,
    ends_at: gathering.ends_at,
    presenter_id: presenter,
    news,
    ...startsAt,
  };
}

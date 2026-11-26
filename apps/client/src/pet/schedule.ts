/**
 * Der Zeitplan der LAN: reine Rechnungen für Panel und Erinnerung. Das Programm pflegt die Orga auf
 * dem Server (`GET /v1/lans/current/schedule`), `src/useSchedule.ts` liest es.
 *
 * @module
 */

import type { StageScheduleItem } from "@jelly/stage";

/** Ein Programmpunkt mit seinem Tag. */
export interface ScheduleEvent {
  title: string;
  /** Spiel, Köche oder Hinweis. */
  detail: string | null;
  /** Art wie `orga`, `food` oder `tournament`. Der Server darf neue ergänzen. */
  kind: string;
  /** Beginn in Unix-Millisekunden. */
  at: number;
  /** Mitternacht des Tags, unter dem er im Plan steht, Ortszeit. Nachts liegt `at` schon danach. */
  day: number;
  /**
   * Ende in Unix-Millisekunden: das des Servers, sonst der Beginn des nächsten Punkts am selben
   * Tag, sonst {@link LAST_RUNS_MS} später.
   */
  end: number;
}

/** Ein Tag der LAN. */
export interface ScheduleDay {
  /** Mitternacht in Unix-Millisekunden, Ortszeit. */
  date: number;
  events: ScheduleEvent[];
}

/** Was das Jelly nach der Erinnerung noch fragt, je Art. Unbekannte Arten bleiben ohne Frage. */
const CUES: Record<string, string> = {
  food: "Hunger?",
  yoga: "Kurz strecken?",
  tournament: "Bist du dabei?",
  together: "Spielst du mit?",
};

/** So lange vor einem Programmpunkt erinnert das Jelly daran, in Millisekunden. */
export const REMIND_BEFORE_MS = 10 * 60_000;

const DAY_MS = 86_400_000;

/** So lange läuft der letzte Punkt eines Tags, wenn der Server kein Ende nennt, in Millisekunden. */
const LAST_RUNS_MS = 2 * 3_600_000;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Mitternacht vor `at`, Ortszeit. */
function midnight(at: number) {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Bis zu dieser Uhrzeit zählt ein Punkt noch zum Vortag, in Millisekunden ab Mitternacht: Was um
 * Mitternacht beginnt, gehört für alle auf der LAN zum Abend davor.
 */
const NIGHT_MS = 5 * 3_600_000;

/** Mitternacht des Tags, unter dem ein Punkt mit Beginn `at` im Plan steht. */
const planDay = (at: number) => midnight(at - NIGHT_MS).getTime();

/**
 * Das Programm des Servers nach Tagen, in Ortszeit. Punkte der Art `news` fehlen: Sie starten nur
 * die Jelly-News auf der Bühne, die kündigt das Pet selbst an (`src/useNews.ts`).
 */
export function scheduleDays(items: StageScheduleItem[]): ScheduleDay[] {
  const sorted = items
    .filter((item) => item.kind !== "news")
    .sort((first, second) => first.starts_at - second.starts_at);
  const days: ScheduleDay[] = [];
  for (const [index, item] of sorted.entries()) {
    const date = planDay(item.starts_at);
    if (days.at(-1)?.date !== date) days.push({ date, events: [] });
    const following = sorted[index + 1];
    const sameDay = following && planDay(following.starts_at) === date;
    const end = item.ends_at ?? (sameDay ? following.starts_at : item.starts_at + LAST_RUNS_MS);
    const { title, detail, kind, starts_at: at } = item;
    days.at(-1)!.events.push({ title, detail, kind, at, day: date, end });
  }
  return days;
}

/** Der zuletzt begonnene und der nächste Programmpunkt, `null`, wo es keinen gibt. */
export function scheduleMoment(days: ScheduleDay[], now: number) {
  const events = days.flatMap((day) => day.events);
  const index = events.findIndex((event) => event.at > now);
  const next = index === -1 ? null : events[index];
  const last = (index === -1 ? events.at(-1) : events[index - 1]) ?? null;
  // Was gerade läuft: der zuletzt begonnene Punkt, solange er nicht zu Ende ist.
  const live = last && now < last.end ? last : null;
  return { last, next, live };
}

/** Der Programmpunkt, an den das Jelly gerade erinnern sollte, sonst `null`. */
export function dueReminder(days: ScheduleDay[], now: number) {
  const { next } = scheduleMoment(days, now);
  return next && next.at - REMIND_BEFORE_MS <= now ? next : null;
}

/** Was das Jelly kurz vor einem Programmpunkt sagt. */
export function reminderLine({ title, detail, kind }: ScheduleEvent) {
  return `Gleich geht’s los: ${title}${detail ? ` (${detail})` : ""}. ${CUES[kind] ?? ""}`.trim();
}

/** Wie lange es bis `at` noch dauert, ohne Präposition: „25 Min.“, „2 Std. 5 Min.“, „3 Tagen“. */
export function countdown(at: number, now: number) {
  // Aufgerundet: Bis dahin steht da mindestens eine Minute.
  const total = Math.max(1, Math.ceil((at - now) / 60_000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${total} Min.`;
  if (hours < 24) return minutes ? `${hours} Std. ${minutes} Min.` : `${hours} Std.`;
  const days = Math.floor(hours / 24);
  // Im Dativ: Davor steht „in“ oder „vor“.
  return days === 1 ? "1 Tag" : `${days} Tagen`;
}

/** Was oben im Zeitplan steht: läuft, gerade vorbei oder als Nächstes, dazu die Zeit in Worten. */
export interface Spotlight {
  state: "live" | "past" | "next";
  event: ScheduleEvent;
  when: string;
}

/**
 * Der Punkt für oben im Zeitplan: was gerade läuft, sonst das Nähere von gerade vorbei und als
 * Nächstes. Nach dem letzten Punkt der LAN nichts mehr.
 */
export function spotlight(days: ScheduleDay[], now: number): Spotlight | null {
  const { last, next, live } = scheduleMoment(days, now);
  if (live) return { state: "live", event: live, when: `noch ${countdown(live.end, now)}` };
  if (!next) return null;
  if (last && now - last.end < next.at - now) {
    return { state: "past", event: last, when: `vor ${countdown(now, last.end)}` };
  }
  return { state: "next", event: next, when: `in ${countdown(next.at, now)}` };
}

/** Der Tag `date` aus Sicht von `now`: „Heute“, „Morgen“, „Gestern“ oder der Wochentag. */
export function dayName(date: number, now: number) {
  // Gerundet: Bei der Zeitumstellung hat ein Tag 23 oder 25 Stunden.
  const diff = Math.round((midnight(date).getTime() - midnight(now).getTime()) / DAY_MS);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === -1) return "Gestern";
  return WEEKDAYS[new Date(date).getDay()];
}

/** Uhrzeit wie `20:00`. */
export function clockTime(at: number) {
  return new Date(at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** Datum wie `12.11.`. */
export function shortDate(date: number) {
  return new Date(date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

/** Wochentag ausgeschrieben, wie `Donnerstag`. */
export function weekday(date: number) {
  return new Date(date).toLocaleDateString("de-DE", { weekday: "long" });
}

/**
 * Ein Eintrag der Zeitleiste: ein Programmpunkt oder die Jetzt-Linie, mit Abstand nach oben in
 * Pixeln.
 */
export type TimelineEntry = { gap: number } & ({ event: ScheduleEvent } | { now: number });

/**
 * Abstand für eine Pause zwischen zwei Punkten: eine Viertelstunde je Pixel, gestaucht auf 4 bis 56
 * Pixel. So sieht man, wo Luft ist, ohne dass fünf Stunden Pause das Panel sprengen.
 */
function gapFor(ms: number) {
  return Math.round(Math.min(56, Math.max(4, ms / 60_000 / 4)));
}

/**
 * Die Zeitleiste eines Tags. Liegt der nächste Punkt an diesem Tag und ist der Tag angebrochen,
 * steht die Jetzt-Linie davor, anteilig in der Pause: halb vorbei heißt halber Weg.
 */
export function timelineEntries(day: ScheduleDay, next: ScheduleEvent | null, now: number) {
  const entries: TimelineEntry[] = [];
  let previous: number | null = null;
  for (const event of day.events) {
    let gap = previous === null ? 0 : gapFor(event.at - previous);
    if (event === next && now >= day.date) {
      const share = previous === null ? 0 : Math.min(1, (now - previous) / (event.at - previous));
      entries.push({ now, gap: Math.round(gap * share) });
      gap = Math.max(4, Math.round(gap * (1 - share)));
    }
    entries.push({ event, gap });
    previous = event.at;
  }
  return entries;
}

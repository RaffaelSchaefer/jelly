/**
 * Der Zeitplan der LAN: das Programm der Orga und reine Rechnungen für Panel und Erinnerung.
 *
 * Der Server kennt nur den Zeitraum der LAN (`LanPeriod`), daran bekommen die Tage ihr Datum.
 *
 * @module
 */

/** Art eines Programmpunkts. Bestimmt Farbe und Symbol wie im Plan der Orga. */
export type ScheduleKind = "orga" | "food" | "yoga" | "tournament" | "together";

/** Ein Programmpunkt, wie ihn die Orga plant. */
export interface ScheduleItem {
  /** Beginn als `HH:MM`. Über Mitternacht hinaus zählt er weiter: `24:00` ist das Ende des Tags. */
  time: string;
  title: string;
  /** Spiel, Köche oder Hinweis. */
  detail?: string;
  kind: ScheduleKind;
}

/** Ein Programmpunkt mit Datum. */
export interface ScheduleEvent extends ScheduleItem {
  /** Beginn in Unix-Millisekunden. */
  at: number;
  /** Mitternacht des Tags, unter dem er im Plan steht. Bei `24:00` liegt `at` schon danach. */
  day: number;
  /**
   * Ende in Unix-Millisekunden: der Beginn des nächsten Punkts am selben Tag, sonst
   * {@link LAST_RUNS_MS} später.
   */
  end: number;
}

/** Ein Tag der LAN. */
export interface ScheduleDay {
  /** Mitternacht in Unix-Millisekunden, Ortszeit. */
  date: number;
  events: ScheduleEvent[];
}

/** Wochentag des ersten Tags im Plan wie bei `Date.getDay()`: Donnerstag. */
const FIRST_WEEKDAY = 4;

// ponytail: fest im Client, jede Änderung braucht ein Release. Soll die Orga ihn selbst pflegen,
// gehört er auf den Server (neue API, vorher absprechen).
/** Das Programm der Orga, ein Eintrag je Tag ab {@link FIRST_WEEKDAY}. */
const PLAN: ScheduleItem[][] = [
  [
    { time: "10:00", title: "Einlass", kind: "orga" },
    { time: "11:00", title: "Begrüßung", detail: "Infos zum Ablauf", kind: "orga" },
    { time: "16:00", title: "Let’s Play Together", detail: "Spiel folgt", kind: "together" },
    { time: "20:00", title: "Let’s Play Together", detail: "Stumble Guys", kind: "together" },
  ],
  [
    { time: "10:30", title: "Frühstück", kind: "food" },
    { time: "13:00", title: "Yoga", kind: "yoga" },
    { time: "15:00", title: "Racing-Sim-Turnier", kind: "tournament" },
    { time: "17:30", title: "Fooden", detail: "Kichererbsen-Curry", kind: "food" },
    { time: "20:00", title: "CS2-Turnier", kind: "tournament" },
    { time: "24:00", title: "Let’s Play Together", detail: "Among Us", kind: "together" },
  ],
  [
    { time: "10:30", title: "Frühstück", kind: "food" },
    { time: "13:00", title: "Yoga", kind: "yoga" },
    { time: "17:30", title: "Fooden", detail: "Gulasch", kind: "food" },
    { time: "20:00", title: "Mario-Kart-Turnier", kind: "tournament" },
    { time: "22:00", title: "Let’s Play Together", detail: "GeoGuessr", kind: "together" },
  ],
  [
    { time: "10:30", title: "Frühstück", kind: "food" },
    { time: "13:00", title: "Abbau", kind: "orga" },
  ],
];

/** Was das Jelly nach der Erinnerung noch fragt, je Art. */
const CUES: Record<ScheduleKind, string> = {
  orga: "",
  food: "Hunger?",
  yoga: "Kurz strecken?",
  tournament: "Bist du dabei?",
  together: "Spielst du mit?",
};

/** So lange vor einem Programmpunkt erinnert das Jelly daran, in Millisekunden. */
export const REMIND_BEFORE_MS = 10 * 60_000;

const DAY_MS = 86_400_000;

// ponytail: Der Plan kennt keine Enden. Ein Punkt läuft bis zum nächsten am selben Tag, der letzte
// des Tags zwei Stunden. Nennt die Orga echte Enden, gehören sie als `until` in den Plan.
/** So lange läuft der letzte Punkt eines Tags, in Millisekunden. */
const LAST_RUNS_MS = 2 * 3_600_000;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Mitternacht vor `at`, Ortszeit. */
function midnight(at: number) {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** `HH:MM` am Tag `day`. `setHours` rechnet `24:00` und Sommerzeit selbst um. */
function timeOn(day: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(day).setHours(hours, minutes);
}

/**
 * Die Tage der LAN mit Datum. Der Plan beginnt am ersten Donnerstag ab dem Start der LAN: Öffnet
 * die Orga die LAN schon am Vortag, verrutscht er so nicht.
 *
 * @param lanStart - Beginn der LAN in Unix-Millisekunden.
 */
export function scheduleDays(lanStart: number): ScheduleDay[] {
  const first = midnight(lanStart);
  first.setDate(first.getDate() + ((FIRST_WEEKDAY - first.getDay() + 7) % 7));
  return PLAN.map((items, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    const date = day.getTime();
    return {
      date,
      events: items.map((item, at) => {
        const start = timeOn(day, item.time);
        const following = items[at + 1];
        const end = following ? timeOn(day, following.time) : start + LAST_RUNS_MS;
        return { ...item, at: start, day: date, end };
      }),
    };
  });
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
  return `Gleich geht’s los: ${title}${detail ? ` (${detail})` : ""}. ${CUES[kind]}`.trim();
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

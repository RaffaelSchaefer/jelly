/**
 * Panel „Zeitplan“: eine Zeitleiste über alle Tage der LAN. Die Abstände folgen der Zeit, die
 * Schiene leuchtet bis zur Jetzt-Linie in der Farbe des Pets. Der nächste Punkt sitzt in einem
 * Ring, der sich bis zu seinem Beginn füllt. Am Ende wartet das Ziel: GG.
 *
 * @module
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  clockTime,
  countdown,
  dayName,
  REMIND_BEFORE_MS,
  scheduleMoment,
  shortDate,
  spotlight,
  timelineEntries,
  weekday,
  type ScheduleDay,
  type ScheduleEvent,
  type ScheduleKind,
  type Spotlight,
} from "../pet";
import { Icon, type IconName } from "../ui";
import "../schedule.css";

/** Symbol je Art. Die Farbe steht in `schedule.css`. */
const KIND_ICONS: Record<ScheduleKind, IconName> = {
  orga: "flag",
  food: "food",
  yoga: "lotus",
  tournament: "trophy",
  together: "gamepad",
};

/** Wie oft Ring, Countdown und Jetzt-Linie weiterrücken, in Millisekunden. */
const TICK_MS = 15_000;

/** Uhrzeit des Servers, die alle {@link TICK_MS} weiterläuft. */
function useNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const timer = window.setInterval(() => setNow(Date.now() + offset), TICK_MS);
    return () => window.clearInterval(timer);
  }, [offset]);
  return now;
}

/** Wo die Zeitleiste gerade steht, für alle Zeilen gleich. */
interface Moment {
  next: ScheduleEvent | null;
  live: ScheduleEvent | null;
  now: number;
}

/**
 * Der Knoten auf der Schiene: das Symbol der Art. Läuft der Punkt gerade, umläuft ihn ein Ring, der
 * sich bis zu seinem Ende füllt.
 */
function Node({ event, moment }: { event: ScheduleEvent; moment: Moment }) {
  const { live, now } = moment;
  const ring =
    event === live ? { "--progress": (now - event.at) / (event.end - event.at) } : undefined;
  return (
    <span
      className={ring ? "schedule-icon schedule-ring" : "schedule-icon"}
      style={ring as CSSProperties | undefined}
      aria-hidden="true"
    >
      <Icon name={KIND_ICONS[event.kind]} />
    </span>
  );
}

/** Wie ein Programmpunkt dasteht: läuft, vorbei, als nächster oder noch offen. */
function rowState(event: ScheduleEvent, { next, live, now }: Moment) {
  if (event === live) return "live";
  if (event.at <= now) return "past";
  return event === next ? "next" : undefined;
}

/** Der Hinweis rechts: wie lange der laufende Punkt noch dauert, wann der nächste beginnt. */
function chip(event: ScheduleEvent, state: string | undefined, now: number) {
  if (state === "live") return `noch ${countdown(event.end, now)}`;
  return state === "next" ? `in ${countdown(event.at, now)}` : null;
}

/** Ein Programmpunkt. Der nächste glüht kurz vor Beginn. */
function Row({ event, gap, moment }: { event: ScheduleEvent; gap: number; moment: Moment }) {
  const state = rowState(event, moment);
  const soon = state === "next" && event.at - moment.now <= REMIND_BEFORE_MS;
  const hint = chip(event, state, moment.now);
  return (
    <li
      className="schedule-item"
      data-kind={event.kind}
      data-state={state}
      data-due={soon || undefined}
      style={{ "--gap": `${gap}px` } as CSSProperties}
    >
      <time>{clockTime(event.at)}</time>
      <Node event={event} moment={moment} />
      <span className="schedule-card">
        <strong>{event.title}</strong>
        {hint ? <span className="schedule-when">{hint}</span> : null}
        {event.detail ? <small>{event.detail}</small> : null}
      </span>
    </li>
  );
}

/** Die Jetzt-Linie zwischen Vergangenem und Kommendem. */
function NowLine({ now, gap }: { now: number; gap: number }) {
  return (
    <li className="schedule-now" style={{ "--gap": `${gap}px` } as CSSProperties}>
      <time>{clockTime(now)}</time>
      <span className="schedule-now-dot" aria-hidden="true" />
      <span className="schedule-now-line">Jetzt</span>
    </li>
  );
}

/** Ein Tag: sein Kopf bleibt beim Scrollen oben stehen, darunter seine Zeitleiste. */
function Day({ day, moment }: { day: ScheduleDay; moment: Moment }) {
  const today = dayName(day.date, moment.now) === "Heute";
  return (
    <section className="schedule-day" aria-label={weekday(day.date)}>
      <h3>
        {weekday(day.date)} <small>{shortDate(day.date)}</small>
        {today ? <span>Heute</span> : null}
      </h3>
      <ol className="schedule-timeline">
        {timelineEntries(day, moment.next, moment.now).map((entry) =>
          "event" in entry ? (
            <Row key={entry.event.at} event={entry.event} gap={entry.gap} moment={moment} />
          ) : (
            <NowLine key="now" now={entry.now} gap={entry.gap} />
          ),
        )}
      </ol>
    </section>
  );
}

/** Überschrift des Kastens oben je Zustand. */
const SPOT_LABELS: Record<Spotlight["state"], string> = {
  live: "Läuft gerade",
  past: "Gerade vorbei",
  next: "Als Nächstes",
};

/**
 * Der Kasten oben: was läuft, sonst das Nähere von gerade vorbei und als Nächstes. Er bleibt
 * stehen.
 */
function Spot({ spot }: { spot: Spotlight }) {
  const { state, event, when } = spot;
  return (
    <section
      className="schedule-spot"
      data-kind={event.kind}
      data-spot={state}
      aria-label={SPOT_LABELS[state]}
    >
      <span className="schedule-icon" aria-hidden="true">
        <Icon name={KIND_ICONS[event.kind]} />
      </span>
      <div>
        <strong>{event.title}</strong>
        {event.detail ? <small> · {event.detail}</small> : null}
        <p>
          {SPOT_LABELS[state]} · {when}
        </p>
      </div>
    </section>
  );
}

/** Das Ende der Zeitleiste: ein letzter Halt auf der Schiene. */
function Finish({ done }: { done: boolean }) {
  return (
    <div className="schedule-end" data-done={done || undefined}>
      <span />
      <span className="schedule-end-stop" aria-hidden="true" />
      <span>{done ? "GG! Das Programm ist durch, danke fürs Mitspielen." : "Ende der LAN"}</span>
    </div>
  );
}

/**
 * Rollt das Panel beim Öffnen zur Jetzt-Linie, sonst zum nächsten Punkt, nach der LAN zum Ziel. Von
 * Hand statt per `scrollIntoView`: Das schöbe womöglich auch das durchsichtige Fenster.
 */
function useScrollToNow() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = root.current?.querySelector(
      ".schedule-item[data-state='live'], .schedule-now, .schedule-item[data-state='next'], .schedule-end",
    );
    const panel = root.current?.closest(".panel");
    if (!target || !panel) return;
    const offset = target.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    panel.scrollTop += offset - panel.clientHeight / 3;
  }, []);
  return root;
}

/**
 * Das Panel.
 *
 * @param days - Der Plan mit Datum, ohne bekannte LAN leer.
 * @param offset - Abstand zur Uhr des Servers, siehe `useGameState`.
 */
export default function SchedulePanel({ days, offset }: { days: ScheduleDay[]; offset: number }) {
  const now = useNow(offset);
  const root = useScrollToNow();
  if (days.length === 0) {
    return <p className="panel-hint">Sobald die nächste LAN feststeht, steht hier ihr Programm.</p>;
  }
  const { next, live } = scheduleMoment(days, now);
  const moment = { next, live, now };
  const spot = spotlight(days, now);
  return (
    <div className="schedule" ref={root}>
      {spot ? <Spot spot={spot} /> : null}
      {days.map((day) => (
        <Day key={day.date} day={day} moment={moment} />
      ))}
      <Finish done={moment.next === null} />
    </div>
  );
}

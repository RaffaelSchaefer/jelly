/**
 * Der Zeitplan der LAN und die Erinnerung kurz vor jedem Programmpunkt: Das Jelly hüpft und sagt,
 * was gleich beginnt, der Knopf im Dock bekommt einen Punkt.
 *
 * @module
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { PetGame } from "./usePet";

import { dueReminder, reminderLine, scheduleDays, type ScheduleEvent } from "./pet";

/** Wie oft nachgesehen wird, ob ein Programmpunkt bevorsteht, in Millisekunden. */
const CHECK_MS = 30_000;

/**
 * Der Plan an der laufenden LAN, sonst an der nächsten, ohne LAN leer. Dazu der Programmpunkt, der
 * gleich beginnt.
 *
 * @param remind - Ob das Jelly gerade erinnern darf. Beim Einstieg spricht es über anderes.
 */
export function useSchedule(game: PetGame, remind: boolean) {
  const { lan } = game.game;
  const start = (lan.current ?? lan.next)?.starts_at;
  const days = useMemo(() => (start === undefined ? [] : scheduleDays(start)), [start]);
  const { offset, hopAndSay } = game;

  const [due, setDue] = useState<ScheduleEvent | null>(null);
  useEffect(() => {
    const check = () => setDue(dueReminder(days, Date.now() + offset));
    check();
    const timer = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(timer);
  }, [days, offset]);

  // Einmal je Programmpunkt, auch wenn `remind` zwischendurch wechselt.
  const said = useRef(new Set<number>());
  useEffect(() => {
    if (!due || !remind || said.current.has(due.at)) return;
    said.current.add(due.at);
    hopAndSay(reminderLine(due));
  }, [due, remind, hopAndSay]);

  return { days, due };
}

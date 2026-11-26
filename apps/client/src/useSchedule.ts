/**
 * Der Zeitplan der LAN und die Erinnerung kurz vor jedem Programmpunkt: Das Jelly hüpft und sagt,
 * was gleich beginnt, der Knopf im Dock bekommt einen Punkt.
 *
 * @module
 */

import type { StageScheduleItem } from "@jelly/stage";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PetGame } from "./usePet";

import { desktop, getSchedule } from "./backend";
import {
  dueReminder,
  reminderLine,
  scheduleDays,
  type ScheduleEvent,
  type ServerEvent,
} from "./pet";
import { previewSchedule } from "./pet/previewSchedule";
import { useServerEvents, useStreamReset } from "./useGame";

/** Wie oft nachgesehen wird, ob ein Programmpunkt bevorsteht, in Millisekunden. */
const CHECK_MS = 30_000;

/**
 * Das Programm vom Server für die LAN `lan` (ihr Slug, `undefined` ohne LAN), in der Vorschau ein
 * festes ab `start`. Liest neu, wenn die LAN wechselt, die Orga den Plan ändert
 * (`schedule.changed`) oder der Stream Ereignisse verworfen hat.
 */
function useScheduleItems(lan: string | undefined, start: number | undefined) {
  const [items, setItems] = useState<StageScheduleItem[]>([]);
  // Scheitert das Lesen, bleibt der letzte Plan stehen.
  const load = useCallback(() => {
    void getSchedule().then(
      (schedule) => setItems(schedule.items),
      () => null,
    );
  }, []);
  useEffect(() => {
    if (desktop) load();
  }, [load, lan, start]);
  const onEvent = useCallback(
    (event: ServerEvent) => {
      if (event.type === "schedule.changed") load();
    },
    [load],
  );
  useServerEvents(desktop, onEvent);
  useStreamReset(desktop, load);
  return useMemo(() => {
    if (start === undefined) return [];
    return desktop ? items : previewSchedule(start);
  }, [items, start]);
}

/**
 * Der Plan an der laufenden LAN, sonst an der nächsten, ohne LAN leer. Dazu der Programmpunkt, der
 * gleich beginnt.
 *
 * @param remind - Ob das Jelly gerade erinnern darf. Beim Einstieg spricht es über anderes.
 */
export function useSchedule(game: PetGame, remind: boolean) {
  const { lan } = game.game;
  const period = lan.current ?? lan.next;
  const items = useScheduleItems(period?.slug, period?.starts_at);
  const days = useMemo(() => scheduleDays(items), [items]);
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

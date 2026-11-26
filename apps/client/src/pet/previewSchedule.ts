/**
 * Der Zeitplan der Browser-Vorschau und der Tests: ein Programm, wie es der Server liefert.
 *
 * @module
 */

import type { StageScheduleItem } from "@jelly/stage";

/** Ein Punkt: Uhrzeit als `HH:MM`, Titel, Art und Hinweis. */
type Entry = [time: string, title: string, kind: string, detail?: string];

/** Wochentag des ersten Tags wie bei `Date.getDay()`: Donnerstag. */
const FIRST_WEEKDAY = 4;

/** Ein Eintrag je Tag ab {@link FIRST_WEEKDAY}. `24:00` ist Mitternacht des Folgetags. */
const PLAN: Entry[][] = [
  [
    ["10:00", "Einlass", "orga"],
    ["11:00", "Begrüßung", "orga", "Infos zum Ablauf"],
    ["16:00", "Let’s Play Together", "together", "Spiel folgt"],
    ["20:00", "Let’s Play Together", "together", "Stumble Guys"],
  ],
  [
    ["10:30", "Frühstück", "food"],
    ["13:00", "Yoga", "yoga"],
    ["15:00", "Racing-Sim-Turnier", "tournament"],
    ["17:30", "Fooden", "food", "Kichererbsen-Curry"],
    ["20:00", "CS2-Turnier", "tournament"],
    ["24:00", "Let’s Play Together", "together", "Among Us"],
  ],
  [
    ["10:30", "Frühstück", "food"],
    ["13:00", "Yoga", "yoga"],
    ["17:30", "Fooden", "food", "Gulasch"],
    ["20:00", "Mario-Kart-Turnier", "tournament"],
    ["22:00", "Let’s Play Together", "together", "GeoGuessr"],
  ],
  [
    ["10:30", "Frühstück", "food"],
    ["13:00", "Abbau", "orga"],
  ],
];

/**
 * Das Programm ab dem ersten Donnerstag ab dem Start der LAN, in Ortszeit.
 *
 * @param lanStart - Beginn der LAN in Unix-Millisekunden.
 */
export function previewSchedule(lanStart: number): StageScheduleItem[] {
  const first = new Date(lanStart);
  first.setHours(0, 0, 0, 0);
  first.setDate(first.getDate() + ((FIRST_WEEKDAY - first.getDay() + 7) % 7));
  return PLAN.flatMap((entries, index) =>
    entries.map(([time, title, kind, detail = null]) => {
      const [hours, minutes] = time.split(":").map(Number);
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      // `setHours` rechnet `24:00` und Sommerzeit selbst um.
      return { starts_at: day.setHours(hours, minutes), ends_at: null, title, detail, kind };
    }),
  );
}

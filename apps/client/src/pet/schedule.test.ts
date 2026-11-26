import { describe, expect, it } from "vitest";

import { previewSchedule } from "./previewSchedule";
import {
  countdown,
  dayName,
  dueReminder,
  reminderLine,
  scheduleDays,
  scheduleMoment,
  spotlight,
  timelineEntries,
} from "./schedule";

/** Donnerstag, 12. November 2026, Ortszeit. */
const at = (day: number, hours: number, minutes = 0) =>
  new Date(2026, 10, day, hours, minutes).getTime();

/** Der Plan einer LAN, die Donnerstag um 10 Uhr beginnt, wie ihn der Server liefert. */
const days = scheduleDays(previewSchedule(at(12, 10)));

describe("Zeitplan", () => {
  it("ordnet die Punkte des Servers nach Tagen", () => {
    expect(previewSchedule(at(11, 18))[0].starts_at).toBe(at(12, 10));
    expect(days.map((day) => day.date)).toEqual([at(12, 0), at(13, 0), at(14, 0), at(15, 0)]);
    expect(days[0].events[0].at).toBe(at(12, 10));
    expect(scheduleDays([])).toEqual([]);
  });

  it("lässt Mitternacht unter ihrem Tag stehen", () => {
    const amongUs = days[1].events.at(-1)!;
    expect(amongUs.at).toBe(at(14, 0));
    expect(amongUs.day).toBe(at(13, 0));
  });

  it("sortiert und nimmt das Ende des Servers", () => {
    const item = { title: "Yoga", detail: null, kind: "yoga" };
    const [day] = scheduleDays([
      { ...item, starts_at: at(13, 15), ends_at: null },
      { ...item, starts_at: at(13, 13), ends_at: at(13, 14) },
    ]);
    expect(day.events.map((event) => event.end)).toEqual([at(13, 14), at(13, 17)]);
  });

  it("lässt die Jelly-News weg", () => {
    const item = { ends_at: null, detail: null };
    const [day] = scheduleDays([
      { ...item, starts_at: at(13, 13), title: "Yoga", kind: "yoga" },
      { ...item, starts_at: at(13, 14), title: "Jelly-News", kind: "news" },
      { ...item, starts_at: at(13, 15), title: "Turnier", kind: "tournament" },
    ]);
    expect(day.events.map((event) => event.title)).toEqual(["Yoga", "Turnier"]);
    expect(day.events[0].end).toBe(at(13, 15));
  });

  it("erinnert auch an eine Art, die es noch nicht kennt", () => {
    const [day] = scheduleDays([
      { starts_at: at(13, 15), ends_at: null, title: "Quiz", detail: null, kind: "quiz" },
    ]);
    expect(reminderLine(day.events[0])).toBe("Gleich geht’s los: Quiz.");
  });

  it("findet den letzten und den nächsten Programmpunkt", () => {
    expect(scheduleMoment(days, at(9, 12))).toEqual({
      last: null,
      next: days[0].events[0],
      live: null,
    });
    const moment = scheduleMoment(days, at(13, 23));
    expect(moment.last?.title).toBe("CS2-Turnier");
    expect(moment.next?.detail).toBe("Among Us");
    expect(scheduleMoment(days, at(16, 9)).next).toBeNull();
  });
});

describe("Zeitplan im Lauf der LAN", () => {
  it("erinnert erst kurz vor dem Beginn", () => {
    expect(dueReminder(days, at(13, 19, 49))).toBeNull();
    expect(dueReminder(days, at(13, 19, 50))?.title).toBe("CS2-Turnier");
    expect(reminderLine(days[1].events[4])).toBe("Gleich geht’s los: CS2-Turnier. Bist du dabei?");
    expect(reminderLine(days[0].events[1])).toBe(
      "Gleich geht’s los: Begrüßung (Infos zum Ablauf).",
    );
  });

  it("sagt die Wartezeit in Worten", () => {
    expect(countdown(at(12, 20), at(12, 19, 35))).toBe("25 Min.");
    expect(countdown(at(12, 20), at(12, 17, 55))).toBe("2 Std. 5 Min.");
    expect(countdown(at(12, 20), at(12, 18))).toBe("2 Std.");
    expect(countdown(at(12, 10), at(9, 10))).toBe("3 Tagen");
  });

  it("zeigt oben, was läuft, sonst das Nähere von vorbei und gleich", () => {
    expect(spotlight(days, at(13, 21, 10))).toMatchObject({
      state: "live",
      when: "noch 2 Std. 50 Min.",
    });
    expect(spotlight(days, at(14, 3))).toMatchObject({ state: "past", when: "vor 1 Std." });
    expect(spotlight(days, at(14, 9))).toMatchObject({ state: "next", when: "in 1 Std. 30 Min." });
    expect(spotlight(days, at(16, 9))).toBeNull();
  });

  it("weiß, was gerade läuft und wie lange noch", () => {
    expect(days[1].events[4].end).toBe(at(14, 0));
    expect(days[1].events[5].end).toBe(at(14, 2));
    expect(scheduleMoment(days, at(13, 21, 10)).live?.title).toBe("CS2-Turnier");
    expect(scheduleMoment(days, at(14, 3)).live).toBeNull();
  });

  it("nennt den Tag", () => {
    expect(dayName(at(13, 0), at(12, 23))).toBe("Morgen");
    expect(dayName(at(15, 0), at(12, 9))).toBe("So");
  });

  it("setzt die Jetzt-Linie anteilig in die Pause", () => {
    const now = at(13, 21, 10);
    const { next } = scheduleMoment(days, now);
    const entries = timelineEntries(days[1], next, now);
    expect(entries.map((entry) => entry.gap)).toEqual([0, 38, 30, 38, 38, 16, 40]);
    expect("now" in entries[5]).toBe(true);
    expect(timelineEntries(days[2], next, now).some((entry) => "now" in entry)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { createSlowFrameMeter } from "./rendering";

/** Lässt den Messer Bilder im Abstand `gap` sehen und nennt die Zeit der ersten Meldung. */
function firstAlarm(meter: (now: number) => boolean, gap: number, from: number, until: number) {
  for (let now = from; now <= until; now += gap) {
    if (meter(now)) return now;
  }
  return null;
}

describe("createSlowFrameMeter", () => {
  it("bleibt bei flüssigen Bildern still", () => {
    expect(firstAlarm(createSlowFrameMeter(), 1000 / 60, 0, 60_000)).toBeNull();
  });

  it("bleibt am Standard von 30 FPS und knapp über der Schwelle still", () => {
    expect(firstAlarm(createSlowFrameMeter(), 1000 / 30, 0, 60_000)).toBeNull();
    expect(firstAlarm(createSlowFrameMeter(), 1000 / 22, 0, 60_000)).toBeNull();
  });

  it("meldet ein langsames Gerät nach Anlauf und zwei Fenstern", () => {
    const alarm = firstAlarm(createSlowFrameMeter(), 100, 0, 60_000);
    expect(alarm).toBeGreaterThanOrEqual(3000);
    expect(alarm).toBeLessThanOrEqual(3300);
  });

  it("meldet auch ein sehr langsames Gerät", () => {
    expect(firstAlarm(createSlowFrameMeter(), 1000, 0, 10_000)).not.toBeNull();
  });

  it("verzeiht einen einzelnen Hänger", () => {
    const meter = createSlowFrameMeter();
    let now = 0;
    expect(firstAlarm(meter, 16, now, 5000)).toBeNull();
    now = 5000 + 2000;
    expect(meter(now)).toBe(false);
    expect(firstAlarm(meter, 16, now + 16, 60_000)).toBeNull();
  });

  it("wertet eine lange Lücke als Pause", () => {
    const meter = createSlowFrameMeter();
    expect(firstAlarm(meter, 100, 0, 2500)).toBeNull();
    // Ohne Pause käme die Meldung bei rund 3 s, nach der Lücke läuft alles neu an.
    expect(firstAlarm(meter, 100, 10_000, 12_500)).toBeNull();
    expect(firstAlarm(meter, 100, 12_600, 14_000)).not.toBeNull();
  });

  it("meldet weiter, solange das Gerät langsam bleibt", () => {
    const meter = createSlowFrameMeter();
    const first = firstAlarm(meter, 100, 0, 60_000)!;
    expect(firstAlarm(meter, 100, first + 100, first + 2300)).not.toBeNull();
  });
});

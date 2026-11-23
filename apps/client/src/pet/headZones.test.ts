import { describe, expect, it } from "vitest";

import { followStroke, handLean, headZone, startStroke, type HeadSpots } from "./headZones";

/** Ein Kopf mit 60 px Radius, die Nase 5 px unter der Mitte. */
const HEAD: HeadSpots = { center: { x: 200, y: 100 }, nose: { x: 200, y: 105 }, radius: 60 };

describe("headZone", () => {
  it("finds the nose within a quarter of the head radius", () => {
    expect(headZone(HEAD, { x: 200, y: 105 })).toBe("nose");
    expect(headZone(HEAD, { x: 214, y: 105 })).toBe("nose");
    expect(headZone(HEAD, { x: 216, y: 105 })).toBeNull();
  });
  it("keeps the eyes outside the nose", () => {
    // Die Augen liegen 0,19 von 0,62 Radien neben der Mitte.
    expect(headZone(HEAD, { x: 200 + (60 * 0.19) / 0.62, y: 100 })).not.toBe("nose");
  });
  it("keeps the nose easy to hit on a small jelly", () => {
    const small = { ...HEAD, radius: 30 };
    expect(headZone(small, { x: 209, y: 105 })).toBe("nose");
    expect(headZone(small, { x: 211, y: 105 })).toBeNull();
  });
  it("takes the upper half of the head as the crown, a little beyond its outline", () => {
    expect(headZone(HEAD, { x: 200, y: 45 })).toBe("crown");
    expect(headZone(HEAD, { x: 150, y: 80 })).toBe("crown");
    expect(headZone(HEAD, { x: 200, y: 25 })).toBeNull();
    expect(headZone(HEAD, { x: 170, y: 130 })).toBeNull();
  });
});

describe("followStroke", () => {
  /** Streicht auf Höhe `y` über die Punkte `xs` und meldet, wann daraus ein Streicheln wurde. */
  function swipe(xs: number[], y = 70) {
    const stroke = startStroke({ x: xs[0]!, y });
    const began = xs.slice(1).map((x) => followStroke(stroke, { x, y }, HEAD));
    return { stroke, began };
  }
  it("pets once the stroke over the crown reaches 0.6 head radii", () => {
    const { stroke, began } = swipe([180, 190, 200, 210, 220]);
    expect(began).toEqual([false, false, false, true]);
    expect(stroke.petting).toBe(true);
  });
  it("keeps petting back and forth, but only reports it once", () => {
    expect(swipe([190, 210, 190, 210, 190]).began.filter(Boolean)).toHaveLength(1);
  });
  it("leaves a click and a jitter as a click", () => {
    expect(swipe([200, 200]).stroke.petting).toBe(false);
    expect(swipe([200, 203, 199, 202]).stroke.petting).toBe(false);
  });
  it("does not count a stroke below the crown", () => {
    expect(swipe([150, 200, 250, 200], 160).stroke.petting).toBe(false);
  });
  it("leans the head toward the hand", () => {
    expect(handLean(HEAD, { x: 230, y: 70 })).toBeCloseTo(0.5);
    expect(handLean(HEAD, { x: 0, y: 70 })).toBe(-1);
  });
});

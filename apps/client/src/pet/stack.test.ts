import { describe, expect, it } from "vitest";

import { stackChange, type ServerEvent, type StackPlace } from ".";

/** Das eigene Jelly. */
const OWN = 7;

/** Ein `stack.changed` von `by`, mit Jellies nach dem Hinaufklettern oder nur mit der ID. */
function changed(by: number | null, memberIds?: number[]): ServerEvent {
  const payload = memberIds
    ? { id: 4, x: 10, y: 20, ends_at: 1000, member_ids: memberIds }
    : { id: 4 };
  return { id: 1, type: "stack.changed", player_id: by, payload, created_at: 0 };
}

/** Der Stapel 4 mit diesen Jellies. */
const on = (...memberIds: number[]): StackPlace => ({ id: 4, memberIds });

describe("the own stack", () => {
  it("starts a tower alone at the bottom", () => {
    expect(stackChange(null, changed(OWN, [OWN]), OWN)).toEqual({
      place: on(OWN),
      message: "Ich fang einen Turm an.",
      climbed: false,
    });
  });

  it("climbs on top of a tower and hops", () => {
    expect(stackChange(null, changed(OWN, [8, 9, OWN]), OWN)).toEqual({
      place: on(8, 9, OWN),
      message: "Ich kletter rauf, 3 Jellies hoch!",
      climbed: true,
    });
  });

  it("notices someone climbing on top of it", () => {
    const change = stackChange(on(OWN), changed(8, [OWN, 8]), OWN);
    expect(change.place).toEqual(on(OWN, 8));
    expect(change.message).toBe("Huch, da klettert wer auf mich drauf!");
    expect(change.climbed).toBe(false);
  });

  it("slides down when someone below it leaves", () => {
    const change = stackChange(on(8, OWN, 9), changed(8), OWN);
    expect(change.place).toEqual(on(OWN, 9));
    expect(change.message).toBe("Hoppla, ich rutsch ein Stück runter.");
  });

  it("stays quiet when someone above it leaves", () => {
    expect(stackChange(on(8, OWN, 9), changed(9), OWN)).toEqual({
      place: on(8, OWN),
      message: null,
      climbed: false,
    });
  });

  it("is back on the floor after climbing down or walking away", () => {
    expect(stackChange(on(8, OWN), changed(OWN), OWN)).toEqual({
      place: null,
      message: "Ich kletter wieder runter.",
      climbed: false,
    });
  });

  it("falls with the tower when its time is over", () => {
    expect(stackChange(on(8, OWN), changed(null), OWN)).toEqual({
      place: null,
      message: "Hui, unser Turm fällt auseinander!",
      climbed: false,
    });
  });
});

describe("what is no news to the jelly", () => {
  it("ignores a stack it does not know", () => {
    expect(stackChange(null, changed(OWN), OWN)).toEqual({
      place: null,
      message: null,
      climbed: false,
    });
    expect(stackChange(null, changed(null), OWN).message).toBeNull();
    const elsewhere: StackPlace = { id: 5, memberIds: [OWN] };
    expect(stackChange(elsewhere, changed(8), OWN).place).toBe(elsewhere);
  });

  it("ignores someone it never saw leaving", () => {
    const place = on(OWN, 9);
    expect(stackChange(place, changed(8), OWN)).toEqual({ place, message: null, climbed: false });
  });

  it("ignores other events", () => {
    const place = on(OWN);
    const xp: ServerEvent = { ...changed(OWN, [OWN]), type: "xp.gained" };
    expect(stackChange(place, xp, OWN).place).toBe(place);
  });
});

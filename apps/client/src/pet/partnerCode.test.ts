import { describe, expect, it } from "vitest";

import {
  emptyPartnerCode,
  enterPartnerDigits,
  erasePreviousDigit,
  partnerClock,
  typedDigit,
} from ".";

describe("Partner-Uhr", () => {
  it("läuft leer und drängt erst im letzten Viertel", () => {
    expect(partnerClock(120_000, 120_000)).toEqual({ left: 1, urgent: false });
    expect(partnerClock(60_000, 120_000)).toEqual({ left: 0.5, urgent: false });
    expect(partnerClock(30_000, 120_000)).toEqual({ left: 0.25, urgent: true });
  });

  it("bleibt bei Abweichungen der Uhr im Bereich", () => {
    expect(partnerClock(130_000, 120_000).left).toBe(1);
    expect(partnerClock(-5_000, 120_000).left).toBe(0);
  });
});

describe("Partner-Code", () => {
  it("springt nach einer Ziffer weiter und bleibt im letzten Feld", () => {
    const first = enterPartnerDigits(emptyPartnerCode(), 0, "6");
    expect(first).toEqual({ digits: ["6", "", "", ""], focus: 1 });
    expect(enterPartnerDigits(["6", "5", "0", ""], 3, "9").focus).toBe(3);
  });

  it("verteilt mehrere Ziffern nach rechts und schneidet am Ende ab", () => {
    expect(enterPartnerDigits(emptyPartnerCode(), 1, "12").digits).toEqual(["", "1", "2", ""]);
    expect(enterPartnerDigits(emptyPartnerCode(), 2, "123").digits).toEqual(["", "", "1", "2"]);
  });

  it("füllt mit einem ganzen Code alle Felder, egal wo er landet", () => {
    const pasted = enterPartnerDigits(["9", "9", "9", "9"], 2, " 65-09 ");
    expect(pasted).toEqual({ digits: ["6", "5", "0", "9"], focus: 3 });
  });

  it("löscht bei leerem Text und ignoriert anderes als Ziffern", () => {
    const digits = ["1", "2", "", ""];
    expect(enterPartnerDigits(digits, 1, "").digits).toEqual(["1", "", "", ""]);
    expect(enterPartnerDigits(digits, 1, "x")).toEqual({ digits, focus: 1 });
  });

  it("nimmt beim Tippen neben einer alten Ziffer nur die neue", () => {
    expect(typedDigit("1", "17")).toBe("7");
    expect(typedDigit("1", "71")).toBe("7");
    expect(typedDigit("1", "11")).toBe("1");
    expect(typedDigit("1", "1")).toBe("1");
    expect(typedDigit("", "42")).toBe("42");
  });

  it("geht mit der Rücktaste zurück und löscht dort", () => {
    expect(erasePreviousDigit(["1", "2", "", ""], 2)).toEqual({
      digits: ["1", "", "", ""],
      focus: 1,
    });
    expect(erasePreviousDigit(["", "", "", ""], 0).focus).toBe(0);
  });
});

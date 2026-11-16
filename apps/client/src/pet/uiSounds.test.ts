import { describe, expect, it } from "vitest";

import {
  gameSoundFor,
  isUiSound,
  uiSoundFor,
  type ClickedControl,
  type GameMoment,
} from "./uiSounds";

const button: ClickedControl = {
  sound: null,
  blocked: false,
  expanded: null,
  role: null,
};

describe("uiSoundFor", () => {
  it("taps a plain button", () => {
    expect(uiSoundFor(button)).toBe("tap");
  });
  it("opens and closes what a button holds open", () => {
    expect(uiSoundFor({ ...button, expanded: "false" })).toBe("open");
    expect(uiSoundFor({ ...button, expanded: "true" })).toBe("close");
  });
  it("selects a tab", () => {
    expect(uiSoundFor({ ...button, role: "tab" })).toBe("select");
  });
  it("follows data-sound, but a locked button sounds locked", () => {
    expect(uiSoundFor({ ...button, sound: "windowClose" })).toBe("windowClose");
    expect(uiSoundFor({ ...button, sound: "select", blocked: true })).toBe("blocked");
  });
  it("stays silent for none and ignores unknown names", () => {
    expect(uiSoundFor({ ...button, sound: "none", blocked: true })).toBeNull();
    expect(uiSoundFor({ ...button, sound: "boom" })).toBe("tap");
    expect(isUiSound("toggleOn")).toBe(true);
    expect(isUiSound("constructor")).toBe(false);
  });
});

describe("gameSoundFor", () => {
  const calm: GameMoment = { xp: 100, honors: 2, invited: false, hatching: false };
  it("chimes for new XP, honors, invites and hatching", () => {
    expect(gameSoundFor(calm, { ...calm, xp: 110 })).toBe("coin");
    expect(gameSoundFor(calm, { ...calm, honors: 3 })).toBe("achievement");
    expect(gameSoundFor(calm, { ...calm, invited: true })).toBe("invite");
    expect(gameSoundFor(calm, { ...calm, hatching: true })).toBe("hatch");
  });
  it("prefers the rarer moment when several come at once", () => {
    expect(gameSoundFor(calm, { ...calm, xp: 150, honors: 3 })).toBe("achievement");
    expect(gameSoundFor(calm, { ...calm, xp: 150, hatching: true })).toBe("hatch");
  });
  it("stays silent on the first load and when nothing rose", () => {
    const empty: GameMoment = { xp: null, honors: null, invited: false, hatching: false };
    expect(gameSoundFor(empty, calm)).toBeNull();
    expect(gameSoundFor(calm, { ...calm, xp: 90, invited: false })).toBeNull();
  });
});

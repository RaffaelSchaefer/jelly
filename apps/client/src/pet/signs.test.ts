import { describe, expect, it } from "vitest";

import {
  boardAngle,
  boardPose,
  createBoardMotion,
  fitSignLines,
  PREVIEW_CATALOG,
  shortSignLabel,
  signIcon,
  signLabel,
  stepBoard,
} from ".";

/** Etwa die Breite der Schrift auf der Tafel: 55 Pixel je Zeichen bei Schriftgröße 100. */
const widthAt100 = (text: string) => text.length * 55;

/** Eine Tafel, die schon oben steht und `shown` zeigt. */
function raisedBoard(shown: string) {
  return { ...createBoardMotion(), raise: 1, shown };
}

describe("sign texts", () => {
  it("knows an icon for every sign of the catalog", () => {
    expect(PREVIEW_CATALOG.signs).toHaveLength(8);
    for (const { key } of PREVIEW_CATALOG.signs) expect(signIcon(key)).not.toBe("sign");
  });
  it("falls back for signs of a newer server", () => {
    expect(signIcon("future")).toBe("sign");
    expect(signIcon("constructor")).toBe("sign");
    expect(signLabel("future", PREVIEW_CATALOG)).toBeNull();
    expect(signLabel(null, PREVIEW_CATALOG)).toBeNull();
  });
  it("finds the full text of a sign", () => {
    expect(signLabel("cs2", PREVIEW_CATALOG)).toBe("Suche CS2");
  });
  it("leaves the search word to the heading of the picker", () => {
    expect(shortSignLabel("Suche Rocket League")).toBe("Rocket League");
    expect(shortSignLabel("Wer holt mit Essen?")).toBe("Wer holt mit Essen?");
  });
});

describe("fitSignLines", () => {
  it("keeps a short sign on one big line", () => {
    expect(fitSignLines("Suche CS2", widthAt100)).toEqual({ lines: ["Suche CS2"], size: 68 });
  });
  it("breaks a long sign where the longest line stays shortest", () => {
    const fitted = fitSignLines("Suche Rocket League", widthAt100);
    expect(fitted.lines).toEqual(["Suche", "Rocket League"]);
    expect(fitted.size).toBe(54);
    expect(fitSignLines("Wer holt mit Essen?", widthAt100).lines).toEqual([
      "Wer holt",
      "mit Essen?",
    ]);
  });
  it("shrinks what fits in no size", () => {
    const fitted = fitSignLines("Donaudampfschifffahrtsgesellschaftskapitän", widthAt100);
    expect(fitted.lines).toHaveLength(1);
    expect(fitted.size * 42 * 0.55).toBeCloseTo(452);
  });
});

describe("boardPose", () => {
  it("rests between the hands", () => {
    const pose = boardPose({ x: -1.1, y: -0.4 }, { x: 1.1, y: -0.4 });
    expect(pose).toEqual({ x: 0, y: -0.4, tilt: 0 });
  });
  it("stays below the face and only leans when a hand waves or cheers", () => {
    const waving = boardPose({ x: -1.1, y: -0.4 }, { x: 1.05, y: 0.8 });
    expect(waving.y).toBe(-0.15);
    expect(waving.tilt).toBe(0.22);
    expect(boardPose({ x: -0.85, y: 1 }, { x: 0.85, y: 1 }).y).toBe(-0.15);
  });
});

describe("stepBoard", () => {
  it("shows the first sign without turning and overshoots like the hands", () => {
    const board = createBoardMotion();
    stepBoard(board, "Suche CS2", 1 / 30, false);
    expect(board.shown).toBe("Suche CS2");
    expect(board.flip).toBe(1);
    let highest = 0;
    for (let frame = 0; frame < 60; frame++) {
      stepBoard(board, "Suche CS2", 1 / 30, false);
      highest = Math.max(highest, board.raise);
    }
    expect(highest).toBeGreaterThan(1);
    expect(board.raise).toBeCloseTo(1, 2);
  });
  it("changes the text only when the board stands edge-on", () => {
    const board = raisedBoard("Suche CS2");
    stepBoard(board, "Suche LoL", 0.1, false);
    expect(board.shown).toBe("Suche CS2");
    stepBoard(board, "Suche LoL", 0.1, false);
    expect(board.shown).toBe("Suche LoL");
    for (let frame = 0; frame < 3; frame++) stepBoard(board, "Suche LoL", 0.1, false);
    expect(board.flip).toBe(1);
  });
  it("lets the newest choice win during a turn", () => {
    const board = raisedBoard("Suche CS2");
    stepBoard(board, "Suche LoL", 0.05, false);
    stepBoard(board, "Suche Minecraft", 0.1, false);
    expect(board.shown).toBe("Suche CS2");
    stepBoard(board, "Suche Minecraft", 0.1, false);
    expect(board.shown).toBe("Suche Minecraft");
  });
  it("turns again for a choice in the second half of a turn", () => {
    const board = raisedBoard("Suche CS2");
    stepBoard(board, "Suche LoL", 0.1, false);
    stepBoard(board, "Suche LoL", 0.1, false);
    expect(board.shown).toBe("Suche LoL");
    stepBoard(board, "Suche Minecraft", 0.1, false);
    expect(board.shown).toBe("Suche LoL");
    for (let frame = 0; frame < 4; frame++) stepBoard(board, "Suche Minecraft", 0.1, false);
    expect(board.shown).toBe("Suche Minecraft");
  });
  it("keeps the text while it is lowered", () => {
    const board = raisedBoard("Suche CS2");
    for (let frame = 0; frame < 60; frame++) stepBoard(board, null, 1 / 30, false);
    expect(board.raise).toBeCloseTo(0, 2);
    expect(board.shown).toBe("Suche CS2");
  });
  it("jumps straight to the result with reduced motion", () => {
    const board = raisedBoard("Suche CS2");
    stepBoard(board, "Suche LoL", 0, true);
    expect(board).toEqual({ raise: 1, raiseSpeed: 0, flip: 1, shown: "Suche LoL" });
    stepBoard(board, null, 0, true);
    expect(board).toEqual({ raise: 0, raiseSpeed: 0, flip: 1, shown: "Suche LoL" });
  });
});

describe("boardAngle", () => {
  it("rests face-on and passes edge-on in the middle without a jump", () => {
    expect(boardAngle(1)).toBe(0);
    expect(boardAngle(0)).toBe(0);
    expect(Math.abs(boardAngle(0.499))).toBeCloseTo(Math.PI / 2, 1);
    expect(Math.abs(boardAngle(0.501))).toBeCloseTo(Math.PI / 2, 1);
    expect(boardAngle(0.999)).toBeCloseTo(0, 2);
  });
});

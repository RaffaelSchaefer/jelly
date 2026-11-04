import { describe, expect, it } from "vitest";

import { EMOTE_CLIPS, HOP_CLIPS, mouthAt, speechNotes, type VoiceNote } from ".";

/** Eine Note mit den Werten, die der Mund liest. */
function note(at: number, duration: number, extra: Partial<VoiceNote> = {}): VoiceNote {
  return { at, duration, from: 500, to: 500, vowel: "a", gain: 1, ...extra };
}

/** Die Formen eines Lauts bei 30 Bildern je Sekunde, ohne Wiederholungen. */
function shapesOf(notes: VoiceNote[]) {
  const last = notes.at(-1)!;
  const shapes: (string | undefined)[] = [];
  for (let time = 0; time < last.at + last.duration + 0.1; time += 1 / 30) {
    const shape = mouthAt(notes, time)?.shape;
    if (shapes.at(-1) !== shape) shapes.push(shape);
  }
  return shapes;
}

describe("the shape", () => {
  it("smiles before the first and after the last note", () => {
    const notes = [note(0.3, 0.2)];
    expect(mouthAt(notes, -0.1)).toBeUndefined();
    expect(mouthAt(notes, 0.1)).toBeUndefined();
    expect(mouthAt(notes, 0.5)).toBeUndefined();
    expect(mouthAt(notes, 5)).toBeUndefined();
    expect(mouthAt([], 0)).toBeUndefined();
  });
  it("shows the vowel of the note", () => {
    const notes = [note(0, 0.1, { vowel: "e" }), note(0.11, 0.1, { vowel: "o" })];
    expect(mouthAt(notes, 0.05)?.shape).toBe("e");
    expect(mouthAt(notes, 0.15)?.shape).toBe("o");
  });
  it("treats a short gap as the start of the next note", () => {
    const notes = [note(0, 0.1, { vowel: "e" }), note(0.13, 0.1, { vowel: "o" })];
    expect(mouthAt(notes, 0.12)?.shape).toBe("o");
  });
  it("closes in a pause after punctuation and smiles in a long silence", () => {
    const pause = [note(0, 0.1), note(0.2, 0.1)];
    expect(mouthAt(pause, 0.15)?.shape).toBe("m");
    const silence = [note(0, 0.1), note(0.4, 0.1)];
    expect(mouthAt(silence, 0.25)).toBeUndefined();
  });
  it("closes for a hard consonant only", () => {
    const tick = [note(0, 0.1, { onset: "tick", vowel: "i" })];
    expect(mouthAt(tick, 0.01)?.shape).toBe("m");
    expect(mouthAt(tick, 0.05)?.shape).toBe("i");
    const hiss = [note(0, 0.1, { onset: "hiss", vowel: "e" })];
    expect(mouthAt(hiss, 0.01)?.shape).toBe("e");
  });
});

describe("the animation on top", () => {
  it("springs open, overshoots and settles", () => {
    const notes = [note(0, 0.5)];
    expect(mouthAt(notes, 0)?.width).toBeCloseTo(0.75);
    expect(mouthAt(notes, 0.052)?.width).toBeGreaterThan(1);
    expect(mouthAt(notes, 0.3)?.width).toBeCloseTo(1, 2);
  });
  it("keeps quiet notes smaller", () => {
    const loud = mouthAt([note(0, 0.5)], 0.3)!;
    const quiet = mouthAt([note(0, 0.5, { gain: 0.35 })], 0.3)!;
    expect(quiet.width).toBeLessThan(loud.width * 0.85);
  });
  it("closes a little towards the end of a note, also between equal vowels", () => {
    const notes = [note(0, 0.3)];
    const middle = mouthAt(notes, 0.15)!.height;
    const end = mouthAt(notes, 0.299)!.height;
    expect(end).toBeLessThan(middle * 0.7);
    expect(end).toBeGreaterThan(0.5);
  });
  it("trembles on a long note, height and width against each other", () => {
    const notes = [note(0, 0.5, { shake: 26 })];
    const frame = mouthAt(notes, 0.043)!;
    expect(frame.height).toBeGreaterThan(frame.width);
    expect(mouthAt([note(0, 0.5)], 0.043)!.height).toBeCloseTo(
      mouthAt([note(0, 0.5)], 0.043)!.width,
    );
  });
  it("nods at the start of a word and not inside it", () => {
    expect(mouthAt([note(0, 0.5)], 0)?.nod).toBe(1);
    expect(mouthAt([note(0, 0.5)], 0.2)?.nod).toBeLessThan(0.01);
    expect(mouthAt([note(0, 0.5, { gain: 0.82 })], 0)?.nod).toBe(0);
  });
});

describe("real voices", () => {
  it("change the shape while speaking and end with a smile", () => {
    const shapes = shapesOf(speechNotes("Hallo du, wie geht es dir?"));
    expect(new Set(shapes).size).toBeGreaterThan(3);
    expect(shapes.at(-1)).toBeUndefined();
  });
  it("close after a comma", () => {
    expect(shapesOf(speechNotes("Ja, gut."))).toContain("m");
  });
  it("show a hop and let the laugh run without flicker", () => {
    expect(shapesOf(HOP_CLIPS[0]!)).toEqual(["i", "a", undefined]);
    expect(shapesOf(EMOTE_CLIPS.laugh).filter((shape) => shape === "i")).toEqual([]);
  });
  it("smile between the jumps of a cheer", () => {
    expect(mouthAt(EMOTE_CLIPS.cheer, 0.55)).toBeUndefined();
    expect(mouthAt(EMOTE_CLIPS.cheer, 0.3)?.shape).toBe("a");
  });
  it("stay finite for everything the jelly says", () => {
    for (const notes of [speechNotes("Wer holt mit Essen?"), ...Object.values(EMOTE_CLIPS)]) {
      for (let time = 0; time < 3; time += 1 / 30) {
        const frame = mouthAt(notes, time);
        if (!frame) continue;
        for (const value of [frame.width, frame.height, frame.nod]) {
          expect(Number.isFinite(value)).toBe(true);
        }
        expect(frame.width).toBeGreaterThan(0);
        expect(frame.height).toBeGreaterThan(0);
      }
    }
  });
});

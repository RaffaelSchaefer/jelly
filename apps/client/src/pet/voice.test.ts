import { EMOTE_GLYPHS, EMOTE_SECONDS } from "@jelly/scene/emotes";
import { PARTNER_EMOTE_SECONDS, partnerPose } from "@jelly/scene/partner-emotes";
import { describe, expect, it } from "vitest";

import {
  EMOTE_CLIPS,
  HELLO,
  HOP_CLIPS,
  LEVEL_UP,
  PARTNER_CLIPS,
  pickClip,
  speechNotes,
  speechSyllables,
  volumeGain,
  type VoiceMoment,
  type VoiceNote,
} from ".";

/** Was das Jelly wirklich sagt, dazu ein paar harte Fälle. */
const SENTENCES = [
  "Bereit für die nächste Runde.",
  "+3 XP. Schön, dass du da bist!",
  "Hihi! Neue XP gibt’s in 12 min.",
  "Die Orga hat mich gerade von der Bühne genommen.",
  "Schild ist oben. Die Bühne sieht’s!",
  "Wer holt mit Essen?",
  "❤️ Herz",
  "XP",
  "",
];

/** Prüft, was WebAudio sonst mit einem Fehler quittiert. */
function expectPlayable(notes: VoiceNote[]) {
  notes.forEach((note, index) => {
    for (const value of [note.at, note.duration, note.from, note.to, note.gain]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(note.duration).toBeGreaterThan(0);
    expect(note.from).toBeGreaterThan(0);
    expect(note.to).toBeGreaterThan(0);
    expect(note.gain).toBeGreaterThan(0);
    expect(note.gain).toBeLessThanOrEqual(1);
    const next = notes[index + 1];
    if (next) expect(note.at + note.duration).toBeLessThanOrEqual(next.at);
  });
}

/** Ein ruhiger Stand, von dem aus sich ein Feld ändert. */
const MOMENT: VoiceMoment = {
  sound: true,
  message: "Bereit.",
  messageId: 0,
  pulse: 0,
  level: 3,
  volume: 100,
  emote: null,
};

describe("speechSyllables", () => {
  it.each(SENTENCES)("gives back exactly the text of %j", (sentence) => {
    expect(
      speechSyllables(sentence)
        .map((part) => part.text)
        .join(""),
    ).toBe(sentence);
  });
  it("splits German words the way they are spoken", () => {
    const parts = speechSyllables("Hallo du").map((part) => part.text);
    expect(parts).toEqual(["Hal", "lo ", "du"]);
  });
  it("keeps an emoji whole", () => {
    expect(speechSyllables("❤️ Herz")[0]?.text).toBe("❤️ Herz");
  });
  it("moves on in time, with a pause after punctuation", () => {
    const parts = speechSyllables("Ja, gut.");
    expect(parts.map((part) => part.text)).toEqual(["Ja, ", "gut."]);
    expect(parts[1]?.at).toBeGreaterThan(0.1);
  });
  it("never speaks longer than about 2.6 s", () => {
    const long = "Das ist ein ganz besonders langer Satz, ".repeat(5);
    const end = speechNotes(long).at(-1)!;
    expect(end.at + end.duration).toBeLessThanOrEqual(2.7);
    expect(speechNotes("Ja.").at(-1)!.duration).toBeLessThan(0.3);
  });
});

describe("speechNotes", () => {
  it.each(SENTENCES)("stays playable for %j", (sentence) => {
    const notes = speechNotes(sentence);
    expect(notes.length).toBeGreaterThan(0);
    expectPlayable(notes);
  });
  it("says the same sentence the same way and another one differently", () => {
    expect(speechNotes("Hallo du!")).toEqual(speechNotes("Hallo du!"));
    expect(speechNotes("Hallo du!")).not.toEqual(speechNotes("Hallo ihr!"));
  });
  it("sings the vowels of the text", () => {
    expect(speechNotes("Hallo du").map((note) => note.vowel)).toEqual(["a", "o", "u"]);
    expect(speechNotes("Schön").map((note) => note.vowel)).toEqual(["e"]);
  });
  it("adds consonants at the start of a syllable", () => {
    expect(speechNotes("Schön")[0]?.onset).toBe("hiss");
    expect(speechNotes("Tag")[0]?.onset).toBe("tick");
    expect(speechNotes("Mal")[0]?.onset).toBeUndefined();
  });
  it("rises on a question and falls on a statement", () => {
    const question = speechNotes("Wer holt mit Essen?").at(-1)!;
    expect(question.to).toBeGreaterThan(question.from);
    const statement = speechNotes("Wer holt mit Essen.").at(-1)!;
    expect(statement.to).toBeLessThan(statement.from);
  });
  it("starts higher on an exclamation", () => {
    expect(speechNotes("Hallo!")[1]?.to).not.toBe(speechNotes("Hallo.")[1]?.to);
    expect(speechNotes("Hi!")[0]?.to).toBeGreaterThan(0);
  });
});

describe("clips", () => {
  it("are all playable", () => {
    for (const notes of [HELLO, LEVEL_UP, ...HOP_CLIPS, ...Object.values(EMOTE_CLIPS)]) {
      expectPlayable(notes);
    }
  });
  it("cover every gesture within its time", () => {
    expect(Object.keys(EMOTE_CLIPS).sort()).toEqual(Object.keys(EMOTE_GLYPHS).sort());
    for (const notes of Object.values(EMOTE_CLIPS)) {
      const end = notes.at(-1)!;
      expect(end.at + end.duration).toBeLessThanOrEqual(EMOTE_SECONDS);
    }
  });
});

describe("partner clips", () => {
  const keys = ["hop", "spin", "wiggle"] as const;
  it.each(keys)("%s is playable and ends with the duet", (key) => {
    for (const notes of [PARTNER_CLIPS[key].pair, PARTNER_CLIPS[key].solo]) {
      expectPlayable(notes);
      const end = notes.at(-1)!;
      expect(end.at + end.duration).toBeLessThanOrEqual(PARTNER_EMOTE_SECONDS);
    }
  });
  it.each(keys)("%s sounds while the jelly that sings it is moving", (key) => {
    const beats = PARTNER_CLIPS[key].pair.filter((note) => note.at >= 0.5 && note.at < 3.5);
    expect(new Set(beats.map((note) => note.by))).toEqual(new Set([undefined, "partner"]));
    for (const note of beats) {
      const elapsed = note.at + note.duration / 2;
      const role = note.by ?? "own";
      const { lift, turn, tilt } = partnerPose({ key, elapsed, role }, false);
      expect(Math.abs(lift) + Math.abs(turn) + Math.abs(tilt)).toBeGreaterThan(0);
    }
  });
  it("lets the partner hop in and out, and leaves that out when alone", () => {
    const { pair, solo } = PARTNER_CLIPS.hop;
    expect(pair[0]?.by).toBe("partner");
    expect(pair.at(-1)?.by).toBe("partner");
    expect(solo.every((note) => !note.by && note.at >= 0.5 && note.at < 3.5)).toBe(true);
  });
  it("picks the version that fits who is there", () => {
    const pair = { key: "spin", partner: { color: "mint" } };
    expect(pickClip(MOMENT, { ...MOMENT, emote: pair })).toBe(PARTNER_CLIPS.spin.pair);
    const solo = { key: "spin", partner: null };
    expect(pickClip(MOMENT, { ...MOMENT, emote: solo })).toBe(PARTNER_CLIPS.spin.solo);
  });
});

describe("pickClip", () => {
  it("stays silent without a change and with the sound off", () => {
    expect(pickClip(MOMENT, { ...MOMENT })).toBeNull();
    const off = { ...MOMENT, sound: false };
    expect(pickClip(off, { ...off, message: "Neu.", messageId: 1, pulse: 1 })).toBeNull();
  });
  it("says hello when the sound comes on", () => {
    expect(pickClip({ ...MOMENT, sound: false }, MOMENT)).toBe(HELLO);
  });
  it("plays the clip of a new gesture, and none for an unknown one", () => {
    expect(pickClip(MOMENT, { ...MOMENT, emote: { key: "wave" } })).toBe(EMOTE_CLIPS.wave);
    expect(pickClip(MOMENT, { ...MOMENT, emote: { key: "future" } })).toEqual([]);
    const emote = { key: "wave" };
    expect(pickClip({ ...MOMENT, emote }, { ...MOMENT, emote })).toBeNull();
  });
  it("prefers the fanfare to the words of a level-up", () => {
    const after = { ...MOMENT, level: 4, message: "Level 4!", messageId: 1, pulse: 1 };
    expect(pickClip(MOMENT, after)).toBe(LEVEL_UP);
  });
  it("plays no fanfare while the state of the server is still loading", () => {
    expect(pickClip({ ...MOMENT, level: null }, { ...MOMENT, level: 7 })).toBeNull();
    expect(pickClip({ ...MOMENT, level: 7 }, { ...MOMENT, level: null })).toBeNull();
    expect(pickClip(MOMENT, { ...MOMENT, level: 2 })).toBeNull();
  });
  it("speaks a new text instead of hopping", () => {
    const after = { ...MOMENT, message: "Hallo!", messageId: 1, pulse: 1 };
    expect(pickClip(MOMENT, after)).toEqual(speechNotes("Hallo!"));
  });
  it("hops when the text stays the same, in turns", () => {
    const hop = (pulse: number) => pickClip(MOMENT, { ...MOMENT, messageId: 1, pulse });
    expect(hop(1)).toBe(HOP_CLIPS[1]);
    expect(hop(2)).toBe(HOP_CLIPS[2]);
    expect(hop(3)).toBe(HOP_CLIPS[0]);
  });
  it("says the same text again without a hop", () => {
    expect(pickClip(MOMENT, { ...MOMENT, messageId: 1 })).toEqual(speechNotes("Bereit."));
  });
});

describe("volume", () => {
  it("follows the ear: half way on the slider is a quarter of the signal", () => {
    expect(volumeGain(100)).toBe(1);
    expect(volumeGain(50)).toBe(0.25);
    expect(volumeGain(10)).toBeCloseTo(0.01);
  });
  it("gives a sample when the slider rests, also before speaking", () => {
    expect(pickClip(MOMENT, { ...MOMENT, volume: 50 })).toBe(HELLO);
  });
  it("stays silent while the saved volume loads and with the sound off", () => {
    expect(pickClip({ ...MOMENT, volume: null }, { ...MOMENT, volume: 40 })).toBeNull();
    expect(pickClip({ ...MOMENT, volume: 40 }, { ...MOMENT, volume: null })).toBeNull();
    const off = { ...MOMENT, sound: false };
    expect(pickClip(off, { ...off, volume: 40 })).toBeNull();
  });
});

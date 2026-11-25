import type { NewsBeat } from "@jelly/stage/news";

import { describe, expect, it } from "vitest";

import {
  anchorNotes,
  anchorVoice,
  contourOf,
  JELLY_TIMBRE,
  noteHz,
  notesSeconds,
  pickAnchor,
  type AnchorLine,
  type VoiceNote,
} from ".";

const NEXT = { starts_at: 0, ends_at: null, detail: null };

/** Jede Art Beitrag einmal. */
const BEATS: NewsBeat[] = [
  { kind: "intro" },
  { kind: "top_xp", playerId: 2, xp: 420 },
  { kind: "achievement", playerId: 3, key: "hydrated" },
  { kind: "stack", memberIds: [20, 21, 22] },
  { kind: "extra" },
  { kind: "next", item: { ...NEXT, title: "CS2-Turnier", kind: "tournament" } },
  { kind: "next", item: { ...NEXT, title: "Yoga", kind: "yoga" } },
  { kind: "outro" },
];

/** Prüft, was WebAudio sonst mit einem Fehler quittiert, und dass sich Noten nicht überlappen. */
function expectPlayable(notes: VoiceNote[]) {
  notes.forEach((note, index) => {
    expect(note.duration).toBeGreaterThan(0);
    expect(note.from).toBeGreaterThan(0);
    expect(note.to).toBeGreaterThan(0);
    expect(note.gain).toBeGreaterThan(0);
    expect(note.gain).toBeLessThanOrEqual(1);
    const next = notes[index + 1];
    if (next) expect(note.at + note.duration).toBeLessThanOrEqual(next.at);
  });
}

/** Halbtöne einer Frequenz über dem Grundton der Stimme. */
const semitones = (hz: number) => 12 * Math.log2(hz / noteHz(0));

describe("the phrase of a beat", () => {
  it.each(BEATS)("is the same for the same beat and seed ($kind)", (beat) => {
    const first = anchorNotes(beat, { seed: 7, seconds: 4, pitch: -5 });
    expect(anchorNotes(beat, { seed: 7, seconds: 4, pitch: -5 })).toEqual(first);
    expect(anchorNotes(beat, { seed: 8, seconds: 4, pitch: -5 })).not.toEqual(first);
    expectPlayable(first);
  });

  it.each(BEATS)("fits the room of the shortest and the longest beat ($kind)", (beat) => {
    // Ein Beitrag hat 5,4 bis 10,8 s, Vorspann und Abspann 60 % davon. Abzüglich Vorlauf und Rest.
    for (const seconds of [1.6, 2.4, 3.7, 7.7]) {
      const notes = anchorNotes(beat, { seed: 3, seconds, pitch: -5 });
      expect(notes.length).toBeGreaterThan(1);
      expect(notesSeconds(notes)).toBeLessThanOrEqual(seconds);
    }
  });

  it("drops words when the room is short and stays silent when not even two fit", () => {
    const beat: NewsBeat = { kind: "stack", memberIds: [1, 2, 3, 4] };
    const long = anchorNotes(beat, { seed: 3, seconds: 10, pitch: 0 });
    const short = anchorNotes(beat, { seed: 3, seconds: 1.6, pitch: 0 });
    expect(short.length).toBeLessThan(long.length);
    expect(anchorNotes(beat, { seed: 3, seconds: 0.3, pitch: 0 })).toEqual([]);
  });

  it("grows with what the server counts", () => {
    const tower = (height: number) =>
      anchorNotes(
        { kind: "stack", memberIds: Array.from({ length: height }, (_, id) => id) },
        {
          seed: 3,
          seconds: 10,
          pitch: 0,
        },
      ).length;
    expect(tower(4)).toBeGreaterThan(tower(2));
  });
});

describe("the tone of a phrase", () => {
  it("falls at the end of a report and rises at the end of the color report", () => {
    const ending = (beat: NewsBeat) => {
      const last = anchorNotes(beat, { seed: 5, seconds: 5, pitch: 0 }).at(-1)!;
      return semitones(last.to) - semitones(last.from);
    };
    expect(ending({ kind: "top_xp", playerId: 2, xp: 420 })).toBeLessThan(-4);
    expect(ending({ kind: "outro" })).toBeLessThan(-4);
    expect(ending({ kind: "extra" })).toBeGreaterThan(4);
  });

  it("sinks over the sentence like a newsreader", () => {
    const notes = anchorNotes(BEATS[1]!, { seed: 5, seconds: 5, pitch: 0 });
    const head = notes.slice(0, 3).map((note) => semitones(note.from));
    const tail = notes.slice(-4, -1).map((note) => semitones(note.from));
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(tail)).toBeLessThan(mean(head));
  });

  it("greets, reports, urges, muses and signs off", () => {
    expect(BEATS.map(contourOf)).toEqual([
      "greeting",
      "report",
      "report",
      "report",
      "musing",
      "urgent",
      "report",
      "farewell",
    ]);
    const loudness = (beat: NewsBeat) => {
      const notes = anchorNotes(beat, { seed: 5, seconds: 5, pitch: 0 });
      return notes.reduce((sum, note) => sum + note.gain, 0) / notes.length;
    };
    expect(loudness(BEATS[5]!)).toBeGreaterThan(loudness(BEATS[6]!));
  });
});

describe("the voice of the presenter", () => {
  it("is the same for the same presenter on every machine", () => {
    expect(anchorVoice(7, 2)).toEqual(anchorVoice(7, 3));
  });

  it("differs clearly from the own everyday voice", () => {
    for (const presenter of [1, 7, 42, 1000, null]) {
      const voice = anchorVoice(presenter, 2);
      expect(voice.own).toBe(false);
      expect(voice.pitch).toBeLessThanOrEqual(-4);
      expect(voice.timbre.formants.a[0]).toBeLessThan(JELLY_TIMBRE.formants.a[0]);
    }
  });

  it("varies between presenters", () => {
    const voices = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((id) => JSON.stringify(anchorVoice(id, 0))),
    );
    expect(voices.size).toBeGreaterThan(3);
  });

  it("is the own voice when the own jelly presents, also with ID 0", () => {
    expect(anchorVoice(0, 0)).toEqual({ own: true, pitch: 0, timbre: JELLY_TIMBRE });
    expect(anchorVoice(null, 0).own).toBe(false);
  });
});

describe("who speaks first", () => {
  const line = (): AnchorLine => ({
    notes: anchorNotes({ kind: "outro" }, { seed: 1, seconds: 3, pitch: -5 }),
    timbre: JELLY_TIMBRE,
    own: false,
  });

  it("plays each new line once", () => {
    const next = line();
    expect(pickAnchor(null, next, true, false)).toBe(next);
    expect(pickAnchor(next, next, true, false)).toBeNull();
  });

  it("pauses for this beat while the own jelly speaks", () => {
    expect(pickAnchor(null, line(), true, true)).toBeNull();
  });

  it("stays silent with the sound off", () => {
    expect(pickAnchor(null, line(), false, false)).toBeNull();
  });

  it("says nothing for an empty line", () => {
    expect(pickAnchor(null, { ...line(), notes: [] }, true, false)).toBeNull();
  });
});

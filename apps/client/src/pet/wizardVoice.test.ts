/**
 * Die Stimme des Zauberers: im Takt der Sprechblase, in D-Dur-Pentatonik, zitternd und mit
 * gedehnter letzter Silbe.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { noteHz, speechNotes } from "./voice";
import { WIZARD_TEMPO } from "./wizardScripts";
import { WIZARD_PITCH, wizardTempo, wizardVoice } from "./wizardVoice";

/** Sätze, wie er sie sagt. */
const TEXTS = [
  "Willkommen in meinem Laden, Pixel!",
  "Die Pixel-Brille! Acht Bit voller Stil.",
  "Oh! Wo war ich … ach ja, der Laden.",
  "Hast du noch Münzen?",
];

/** D-Dur-Pentatonik (D E F♯ A B) als Halbtöne über D. */
const D_PENTATONIC = [0, 2, 4, 7, 9];

/** Wie weit `hz` vom nächsten Ton der D-Pentatonik entfernt liegt, in Cent. */
function centsOffKey(hz: number) {
  const d = noteHz(-10);
  const semitones = 12 * Math.log2(hz / d);
  const step = ((Math.round(semitones) % 12) + 12) % 12;
  return D_PENTATONIC.includes(step) ? Math.abs(semitones - Math.round(semitones)) * 100 : Infinity;
}

describe("seine Stimme", () => {
  it.each(TEXTS)("singt „%s“ im Takt der Sprechblase", (text) => {
    const own = speechNotes(text);
    const wizard = wizardVoice(text);
    expect(wizard.map((note) => note.at)).toEqual(
      own.map((note) => expect.closeTo(note.at / WIZARD_TEMPO, 9)),
    );
  });

  it.each(TEXTS)("singt „%s“ in D-Dur-Pentatonik, um höchstens 15 Cent verfehlt", (text) => {
    const notes = wizardVoice(text);
    for (const note of notes.slice(0, -1)) expect(centsOffKey(note.to)).toBeLessThanOrEqual(15);
  });

  it.each(TEXTS)("zittert in „%s“ in jeder Silbe und dehnt die letzte", (text) => {
    const own = speechNotes(text);
    const notes = wizardVoice(text);
    for (const note of notes) {
      expect(note.shake).toBeGreaterThanOrEqual(note.duration >= 0.2 ? 16 : 12);
    }
    const last = notes.at(-1)!;
    expect(last.duration).toBeCloseTo((own.at(-1)!.duration / WIZARD_TEMPO) * 1.5);
    const fall = 12 * Math.log2(last.from / last.to);
    const ownFall = 12 * Math.log2(own.at(-1)!.from / own.at(-1)!.to);
    expect(fall - ownFall).toBeCloseTo(1, 0);
  });

  it("verfehlt die Töne immer gleich, abhängig vom Text", () => {
    expect(wizardVoice(TEXTS[0]!)).toEqual(wizardVoice(TEXTS[0]!));
    const exact = speechNotes(TEXTS[0]!).map((note) => note.to * 2 ** (WIZARD_PITCH / 12));
    const jittered = wizardVoice(TEXTS[0]!).slice(0, -1);
    expect(jittered.some((note, index) => Math.abs(note.to - exact[index]!) > 0.01)).toBe(true);
  });

  it("denkt leiser und flotter, zaubert langsamer und bebender", () => {
    const text = TEXTS[1]!;
    const said = wizardVoice(text, "speech");
    const thought = wizardVoice(text, "thought");
    const spell = wizardVoice(text, "incantation");
    thought.forEach((note, index) => expect(note.gain).toBeLessThan(said[index]!.gain));
    expect(thought.at(-1)!.at).toBeLessThan(said.at(-1)!.at);
    expect(spell.at(-1)!.at).toBeGreaterThan(said.at(-1)!.at);
    for (const note of spell) expect(note.shake).toBeGreaterThanOrEqual(24);
    expect([wizardTempo("speech"), wizardTempo("thought"), wizardTempo("incantation")]).toEqual([
      WIZARD_TEMPO,
      1.05,
      0.85,
    ]);
  });

  it("spricht Beiläufiges leiser und schnarcht ohne Worte", () => {
    const text = TEXTS[0]!;
    const loud = wizardVoice(text, "speech", 1);
    wizardVoice(text, "speech", 3).forEach((note, index) =>
      expect(note.gain).toBeCloseTo(loud[index]!.gain * 0.55),
    );
    expect(wizardVoice("Zzz …", "snore")).toEqual([]);
  });

  it("liegt zehn Halbtöne unter dem Jelly", () => {
    const first = speechNotes(TEXTS[2]!)[0]!;
    const wizard = wizardVoice(TEXTS[2]!)[0]!;
    expect(12 * Math.log2(wizard.from / first.from)).toBeCloseTo(WIZARD_PITCH, 0);
  });
});

/**
 * Die Laute des Zauberers: geordnet, ohne Überlappung, so lang wie ihr Platz im Skript, das
 * Schnarchen im Takt seines Atems.
 *
 * @module
 */

import { SNORE_PERIOD_SECONDS } from "@jelly/scene/wizard-timing";
import { describe, expect, it } from "vitest";

import { WIZARD_CLIP_NOTES, wizardClip } from "./wizardClips";
import { CLIP_MS, WIZARD_CLIPS } from "./wizardScripts";

describe("seine Laute", () => {
  it.each(WIZARD_CLIPS)("%s ist geordnet, überlappt nicht und passt in seinen Platz", (key) => {
    const notes = wizardClip(key);
    expect(notes.length).toBeGreaterThan(0);
    notes.forEach((note, index) => {
      expect(note.duration).toBeGreaterThan(0);
      expect(note.gain).toBeGreaterThan(0);
      const next = notes[index + 1];
      if (next) expect(note.at + note.duration).toBeLessThanOrEqual(next.at + 1e-9);
    });
    const last = notes.at(-1)!;
    expect((last.at + last.duration) * 1000).toBeLessThanOrEqual(CLIP_MS[key] + 1e-6);
  });

  it("kennt genau die Laute der Skripte", () => {
    expect(Object.keys(WIZARD_CLIP_NOTES).sort()).toEqual([...WIZARD_CLIPS].sort());
  });

  it("atmet beim Schnarchen ein und aus, in einem Atemzug", () => {
    const [inhale, exhale] = wizardClip("snore");
    expect(CLIP_MS.snore / 1000).toBe(SNORE_PERIOD_SECONDS);
    expect([inhale!.at, inhale!.at + inhale!.duration]).toEqual([0.15, expect.closeTo(1.75)]);
    expect([exhale!.at, exhale!.at + exhale!.duration]).toEqual([2.1, expect.closeTo(3.7)]);
    expect(inhale!.to).toBeGreaterThan(inhale!.from);
    expect(exhale!.to).toBeLessThan(exhale!.from);
    expect(exhale!.shake).toBeGreaterThanOrEqual(30);
  });

  it("murmelt und summt leise, ruft „Oh“ laut", () => {
    for (const note of wizardClip("mumble")) expect(note.gain).toBeLessThanOrEqual(0.3);
    for (const note of wizardClip("hum")) expect(note.gain).toBeLessThanOrEqual(0.35);
    expect(wizardClip("hum")).toHaveLength(8);
    expect(wizardClip("oh")[0]!.gain).toBe(1);
  });
});

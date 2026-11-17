/**
 * Die Laute des Zauberers ohne Worte: Brummen, Kichern, Gähnen, Schnarchen, Murmeln, Summen und ein
 * erschrockenes „Oh“. Von Hand geschriebene Noten wie in `voiceClips.ts`, die Tonhöhen in Halbtönen
 * vor seiner tieferen Stimme (`WIZARD_PITCH`).
 *
 * Das Schnarchen dauert genau einen Atemzug (`SNORE_PERIOD_SECONDS` in
 * `@jelly/scene/wizard-timing`): Einatmen von 0,15 bis 1,75 s, Ausatmen von 2,1 bis 3,7 s. Die
 * Brust hebt und senkt sich im selben Takt.
 *
 * @module
 */

import type { WizardClipKey } from "./wizardScripts";

import { inMood, noteHz, type VoiceNote, type Vowel } from "./voice";
import { WIZARD_PITCH } from "./wizardVoice";

/**
 * Eine Note als Tabellenzeile: Beginn, Länge, Tonhöhe von und nach, Vokal, Lautstärke, Vibrato,
 * Geräusch.
 */
type Row = [number, number, number, number, Vowel, number?, number?, VoiceNote["onset"]?];

/** Baut aus Tabellenzeilen die Noten eines Lauts in seiner Stimmlage. */
function clip(rows: Row[]): VoiceNote[] {
  const notes = rows.map(([at, duration, from, to, vowel, gain = 1, shake, onset]) => ({
    at,
    duration,
    from: noteHz(from),
    to: noteHz(to),
    vowel,
    gain,
    shake,
    onset,
  }));
  return inMood(notes, { pitch: WIZARD_PITCH, tempo: 1 });
}

/** Seine Laute. */
export const WIZARD_CLIP_NOTES: Readonly<Record<WizardClipKey, VoiceNote[]>> = {
  // „Hmm“, nachdenklich: erst steigend, dann sinkend.
  hmm: clip([
    [0, 0.25, -2, 0, "u", 0.5, 12],
    [0.25, 0.35, 0, -3, "u", 0.5, 16],
  ]),
  // „Ho-ho-ho“, dreimal fallend.
  hoho: clip([
    [0, 0.16, 4, 2, "o", 0.9, 14, "tick"],
    [0.18, 0.16, 2, 0, "o", 0.85, 14, "tick"],
    [0.36, 0.24, 0, -3, "o", 0.8, 18, "tick"],
  ]),
  // Ein langes, bebendes Gähnen: „Aaaah-oh“.
  yawn: clip([
    [0.2, 1.3, 5, -5, "a", 0.8, 20],
    [1.52, 0.46, -5, -9, "o", 0.55, 16],
  ]),
  // Ein Atemzug: zischend ein, rasselnd aus.
  snore: clip([
    [0.15, 1.6, -6, -2, "u", 0.35, 10, "hiss"],
    [2.1, 1.6, -4, -9, "o", 0.5, 30],
  ]),
  // Murmeln im Halbschlaf.
  mumble: clip([
    [0, 0.09, 0, 1, "u", 0.3],
    [0.115, 0.09, 2, 1, "o", 0.3],
    [0.23, 0.09, -1, 0, "u", 0.3],
    [0.345, 0.09, 1, 2, "o", 0.3],
    [0.46, 0.09, -2, -1, "u", 0.3],
    [0.575, 0.09, -2, -4, "o", 0.3],
  ]),
  // Ein Liedchen über die Pentatonik, gesummt.
  hum: clip([
    [0, 0.4, 0, 0, "u", 0.35, 12],
    [0.425, 0.4, 2, 2, "u", 0.35, 12],
    [0.85, 0.4, 4, 4, "u", 0.35, 12],
    [1.275, 0.4, 7, 7, "u", 0.35, 14],
    [1.7, 0.4, 4, 4, "u", 0.35, 12],
    [2.125, 0.4, 2, 2, "u", 0.35, 12],
    [2.55, 0.4, 0, 0, "u", 0.35, 12],
    [2.975, 0.4, -3, -3, "u", 0.35, 18],
  ]),
  // „Oh!“, erschrocken steigend.
  oh: clip([[0, 0.18, 2, 9, "o", 1, 12, "tick"]]),
};

/** Die Noten eines Lauts. */
export function wizardClip(key: WizardClipKey): VoiceNote[] {
  return WIZARD_CLIP_NOTES[key];
}

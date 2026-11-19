/**
 * Die Klangfarbe einer Stimme als reine Zahlen: Formanten je Vokal, Filter, Schwebung, Vibrato,
 * Atem und Clipping. Der Synthesizer in `src/voice.ts` liest sie, die Noten kommen aus
 * `pet/voice.ts`. Dazu die Typen, mit denen eine Stimme Schichten bekommt und in einen fremden
 * Mischer singt.
 *
 * Das Jelly klingt klein und hell ({@link JELLY_TIMBRE}), der Zauberer im Shop alt und dunkel
 * ({@link WIZARD_TIMBRE}): tiefere Formanten wie bei einem Erwachsenen, mehr Atem und ein breiteres
 * Vibrato.
 *
 * @module
 */

import type { VoiceNote, Vowel } from "./voice";

/** Drei Werte je Formant-Filter, vom tiefsten zum höchsten. */
type Three = readonly [number, number, number];

/** Wie eine Stimme klingt. */
export interface VoiceTimbre {
  /** Die drei Formanten je Vokal in Hertz. */
  formants: Readonly<Record<Vowel, Three>>;
  /** Lautstärke der drei Formant-Filter. */
  formantGains: Three;
  /** Schärfe der drei Formant-Filter. */
  formantQ: Three;
  /** Wie schnell die Filter zum nächsten Vokal gleiten, als Zeitkonstante in Sekunden. */
  vowelGlide: number;
  /**
   * Anteil des ungefilterten Tons: Er hält die Stimme auch dort, wo kein Oberton einen Formanten
   * trifft.
   */
  bodyGain: number;
  /** Tiefpass dieses Anteils in Hertz. */
  bodyCutoff: number;
  /** Abstand der zwei Oszillatoren in Cent. Etwas Schwebung nimmt dem Ton das Piepsige. */
  detuneCents: number;
  /** Grundstärke des Vibratos in Cent. Lange Töne bringen ihre eigene Stärke mit. */
  vibratoCents: number;
  /** Lautstärke des Atems. */
  breath: number;
  /** Stärke des weichen Clippings. */
  drive: number;
  /** Pegel des Tons vor dem Clipping. Weit darüber würde das Clipping hart und die Stimme kratzig. */
  voiceLevel: number;
}

/** Die kleine, helle Stimme des Jellys. Genau die Werte der ersten Fassung. */
export const JELLY_TIMBRE: VoiceTimbre = {
  formants: {
    a: [950, 1500, 3100],
    e: [560, 2200, 3200],
    i: [340, 2700, 3700],
    o: [560, 1000, 3000],
    u: [360, 800, 2700],
  },
  formantGains: [1, 0.75, 0.35],
  formantQ: [4, 6, 8],
  vowelGlide: 0.015,
  bodyGain: 0.16,
  bodyCutoff: 2400,
  detuneCents: 7,
  vibratoCents: 5,
  breath: 0.05,
  drive: 1.8,
  voiceLevel: 0.38,
};

/**
 * Die Stimme des Zauberers: Formanten 60 % auf dem Weg zu einem Erwachsenen, weichere Filter, mehr
 * Körper unter 1,6 kHz, mehr Schwebung, ein zitterndes Vibrato und hörbarer Atem.
 */
export const WIZARD_TIMBRE: VoiceTimbre = {
  formants: {
    a: [820, 1250, 2700],
    e: [540, 1980, 2770],
    i: [300, 2450, 3290],
    o: [565, 905, 2645],
    u: [325, 840, 2425],
  },
  formantGains: [1, 0.7, 0.28],
  formantQ: [3, 5, 6.5],
  vowelGlide: 0.022,
  bodyGain: 0.24,
  bodyCutoff: 1600,
  detuneCents: 11,
  vibratoCents: 9,
  breath: 0.14,
  drive: 2.2,
  voiceLevel: 0.36,
};

/** Was jeder Baustein einer Phrase braucht. */
export interface PhraseSetup {
  context: BaseAudioContext;
  notes: VoiceNote[];
  /** Beginn der ersten Note auf der Kontext-Uhr. */
  start: number;
  timbre: VoiceTimbre;
}

/** Klänge neben der Stimme, etwa eine Brust. Sie singen in `output` und liefern ihre Quellen. */
export type VoiceLayers = (setup: PhraseSetup, output: AudioNode) => AudioScheduledSourceNode[];

/** Wohin eine Stimme in einem fremden Mischer singt, und wer erfährt, wann sie spricht. */
export interface VoiceRoute {
  context: BaseAudioContext;
  /** Eingang an ihrem Platz. Pegel und Kompressor der Stimme kommen noch davor. */
  output: AudioNode;
  onPhrase: (start: number, end: number) => void;
}

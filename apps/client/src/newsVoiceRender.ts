/**
 * Rendert eine ganze Sendung der Jelly-News, wie ein Pet sie hört: den Jingle, die leise Musik
 * darunter und alle Sätze des Vorlesers, mit denselben Noten, Zeiten, Abschnitten, Klangfarben und
 * Pegeln wie live bei voller Lautstärke. Die Sätze kommen aus `listAnchorPhrases`, das dieselbe
 * Rechnung macht wie `nextAnchorStep` im Pet, gespielt von `phrasePlayer` wie in `createVoice`, der
 * Jingle über `scheduleUiSound` mit der Kette der Oberfläche, die Musik über `scheduleNewsBed` wie
 * `playNewsBed`. Für die Hörprobe `scripts/news-voice-check.html`.
 *
 * Jingle und Musik beginnen hier genau mit der Sendung. Im Pet beginnen sie, sobald das Ereignis da
 * ist, also einen Hauch später.
 *
 * @module
 */

import { scheduleNewsBed } from "./newsBedSound";
import {
  anchorVoice,
  contourOf,
  listAnchorPhrases,
  notesSeconds,
  planAnchor,
  type ServerEvent,
} from "./pet";
import { scheduleUiSound } from "./uiSound";
import { createVoiceOutput, phrasePlayer } from "./voice";

/** So lange klingt es nach dem Ende der Sendung noch nach, in Sekunden. */
const TAIL_SECONDS = 1;

/** Ein Satz der gerenderten Sendung, Zeiten in Sekunden ab ihrem Beginn. */
export interface RenderedPhrase {
  at: number;
  seconds: number;
  /** Bis wann sein Beitrag läuft. */
  beatEnd: number;
  kind: string;
  contour: string;
  syllables: number;
}

/** Was {@link renderNewsVoice} kann. */
export interface NewsVoiceOptions {
  /** Das eigene Jelly. Liest es vor, spricht es mit eigener Stimme. */
  ownId: number;
  /** Abtastrate in Hertz. */
  rate: number;
  /** Ob der Jingle mitklingt. Ohne bleibt nur die Stimme. */
  jingle: boolean;
  /** Ob der Vorleser spricht. */
  voice: boolean;
  /** Ob die leise Musik unter der Sendung liegt. */
  bed: boolean;
}

/**
 * Rendert die Sendung, die `event` beginnt, in Mono. `null`, wenn es keine Jelly-News beginnt. Die
 * Zeiten der Sätze kommen mit, für Tabellen und Prüfungen.
 */
export async function renderNewsVoice(event: ServerEvent, options: NewsVoiceOptions) {
  const plan = planAnchor(event);
  if (!plan) return null;
  const voice = anchorVoice(plan.show.presenterId, options.ownId);
  const phrases = listAnchorPhrases(plan, voice);
  const seconds = (plan.show.endsAt - plan.startedAt) / 1000 + TAIL_SECONDS;
  const context = new OfflineAudioContext(1, Math.ceil(seconds * options.rate), options.rate);
  if (options.jingle) await scheduleUiSound(context, "news", 0);
  if (options.bed) await scheduleNewsBed(context, 0, seconds - TAIL_SECONDS);
  const output = createVoiceOutput(context);
  const sing = phrasePlayer(voice.timbre);
  const timed: RenderedPhrase[] = phrases.map((phrase) => ({
    at: (phrase.at - plan.startedAt) / 1000,
    seconds: notesSeconds(phrase.notes),
    beatEnd: (phrase.beatEndsAt - plan.startedAt) / 1000,
    kind: phrase.beat.kind,
    contour: contourOf(phrase.beat),
    syllables: phrase.notes.length,
  }));
  if (options.voice) {
    phrases.forEach((phrase, index) => sing(context, output, phrase.notes, timed[index]?.at ?? 0));
  }
  return { buffer: await context.startRendering(), phrases: timed, own: voice.own };
}

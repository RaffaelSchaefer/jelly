/**
 * Wann der Vorleser der Jelly-News spricht: Zu Beginn jedes Beitrags sagt er einen Satz, der lange
 * vor dem Ende des Beitrags fertig ist. Die Beiträge und ihre Zeiten rechnet dasselbe `planShow`
 * wie auf Bühne und Karte (`@jelly/stage/news`), mit demselben Beginn: `starts_at`, solange der
 * Server keins schickt `created_at` des Ereignisses. So spricht er auf jedem Rechner zum selben
 * Beitrag, auch in der Wiederholung einer langen Sendung.
 *
 * Er beginnt mit dem Schnitt. Auch zum Jingle spricht er, der liegt gut 15 dB unter ihm: Die kurze
 * Begrüßung sitzt in seiner leisen Eröffnung und ist vor seinem Schlag fertig, nur um den Schlag
 * herum ({@link JINGLE_ACCENT_MS}) schweigt er.
 *
 * @module
 */

import type { StageGathering } from "@jelly/stage";

import {
  findMoment,
  planShow,
  scramble,
  type NewsBeat,
  type NewsMoment,
  type NewsShow,
} from "@jelly/stage/news";

import type { ServerEvent } from "./types";
import type { VoiceNote } from "./voice";

import { anchorNotes, notesSeconds, type AnchorVoice } from "./newsAnchor";
import { readNewsGathering } from "./newsPayload";

/** Eine Sendung, wie sie der Vorleser spricht. */
export interface AnchorPlan {
  show: NewsShow;
  /** Serverzeit, zu der sie begann. */
  startedAt: number;
}

/** Ein Satz des Vorlesers zu einem Beitrag. */
export interface AnchorPhrase {
  /** Sendung, Durchlauf und Beitrag, wie der Regisseur der Bühne sie zählt. */
  key: string;
  beat: NewsBeat;
  /** Serverzeit, zu der er beginnt. */
  at: number;
  /** Serverzeit, zu der sein Beitrag endet. */
  beatEndsAt: number;
  notes: VoiceNote[];
}

/** Was der Vorleser jetzt tut: einen Satz beginnen und wann er wieder nachsieht. */
export interface AnchorStep {
  phrase: AnchorPhrase | null;
  /** Serverzeit des nächsten Blicks auf die Uhr, `null`, wenn die Sendung vorbei ist. */
  wakeAt: number | null;
}

/**
 * So lange nach dem Schnitt beginnt ein Satz, in Millisekunden: eine, damit er sicher im Beitrag
 * liegt. Der Wecker kommt genau dann, die Stimme braucht danach nur ihre 20 ms bis zum ersten Ton.
 */
const LEAD_MS = 1;
/** So viel vom Beitrag bleibt am Ende still: ein Anteil, mindestens so viele Millisekunden. */
const TAIL = { share: 0.25, leastMs: 800 } as const;
/** Kürzer als so viele Millisekunden lohnt kein Satz. */
const SHORTEST_MS = 1000;
/**
 * Um den Schlag des Jingles nach 2,6 Sekunden schweigt der Vorleser, in Millisekunden ab dem Beginn
 * der Sendung: Ein Satz davor ist vorher fertig, einer darin wartet bis danach. Das Fenster reicht
 * über den Schlag hinaus, denn beim Pet beginnt der Jingle erst, wenn das Ereignis da ist.
 */
export const JINGLE_ACCENT_MS = { from: 2400, to: 3200 } as const;
/** Ein Satz beginnt höchstens so früh vor seiner Zeit und so spät danach, in Millisekunden. */
const SLACK = { earlyMs: 30, lateMs: 1000 } as const;

/**
 * Die Sendung, die `event` beginnt, oder `null`. Andere Ereignisse und ein Gathering, das kein
 * vollständiges News-Gathering ist, ergeben keine.
 */
export function planAnchor(event: ServerEvent): AnchorPlan | null {
  if (event.type !== "gathering.changed") return null;
  const gathering: StageGathering | null = readNewsGathering(event.payload);
  if (!gathering) return null;
  const startedAt = gathering.starts_at ?? event.created_at;
  const show = planShow({ ...gathering, starts_at: startedAt });
  return show ? { show, startedAt } : null;
}

/**
 * Wo ein Satz im Beitrag Platz hat: ab dem Schnitt bis vor sein Ende, nie über den Schlag des
 * Jingles.
 */
function roomFor(plan: AnchorPlan, moment: NewsMoment) {
  let at = moment.startedAt + LEAD_MS;
  const beatMs = moment.endsAt - moment.startedAt;
  let until = moment.endsAt - Math.max(beatMs * TAIL.share, TAIL.leastMs);
  const accentFrom = plan.startedAt + JINGLE_ACCENT_MS.from;
  const accentTo = plan.startedAt + JINGLE_ACCENT_MS.to;
  if (at < accentFrom) until = Math.min(until, accentFrom);
  else if (at < accentTo) at = accentTo;
  return { at, until };
}

/**
 * Der Satz zum Beitrag `moment` in der Stimme `voice`, oder `null`, wenn keiner hineinpasst: Er
 * beginnt mit dem Schnitt, nie über dem Schlag des Jingles, und endet lange vor dem Beitrag.
 */
export function phraseFor(
  plan: AnchorPlan,
  moment: NewsMoment,
  voice: AnchorVoice,
): AnchorPhrase | null {
  const { at, until } = roomFor(plan, moment);
  if (until - at < SHORTEST_MS) return null;
  // Je Beitrag derselbe Satz, auch in der Wiederholung.
  const seed = scramble(plan.show.seed + moment.index + 1);
  const notes = anchorNotes(moment.beat, {
    seed,
    seconds: (until - at) / 1000,
    pitch: voice.pitch,
  });
  if (notes.length === 0) return null;
  const key = `${plan.show.key}:${moment.run}:${moment.index}`;
  return { key, beat: moment.beat, at, beatEndsAt: moment.endsAt, notes };
}

/** Alle Sätze der Sendung in ihrer Reihenfolge, für das Rendern einer ganzen Sendung. */
export function listAnchorPhrases(plan: AnchorPlan, voice: AnchorVoice): AnchorPhrase[] {
  const { show } = plan;
  const length = show.marks.at(-1) ?? 0;
  if (length <= 0) return [];
  const runs = Math.round((show.endsAt - plan.startedAt) / length);
  const phrases: AnchorPhrase[] = [];
  for (let run = 0; run < runs; run++) {
    const runStart = show.endsAt - (runs - run) * length;
    for (const mark of show.marks.slice(0, -1)) {
      // Kurz nach dem Schnitt: dieselbe Rechnung, die das Pet zu dieser Zeit macht.
      const moment = findMoment(show, runStart + mark + 1);
      const phrase = moment && phraseFor(plan, moment, voice);
      if (phrase) phrases.push(phrase);
    }
  }
  return phrases;
}

/**
 * Was der Vorleser zur Serverzeit `now` tut. Jeder Blick rechnet den Beitrag neu aus der Uhr, so
 * läuft nichts auseinander, auch wenn ein Wecker spät kommt. Ein Satz, der schon begonnen hat
 * (`done`), kommt nicht noch einmal. Ein verspäteter Satz fällt aus, wenn er nicht mehr in seinen
 * Beitrag passt.
 */
export function nextAnchorStep(
  plan: AnchorPlan,
  now: number,
  done: string | null,
  voice: AnchorVoice,
): AnchorStep {
  if (now < plan.startedAt) return { phrase: null, wakeAt: plan.startedAt };
  const moment = findMoment(plan.show, now);
  if (!moment) return { phrase: null, wakeAt: null };
  const next = moment.endsAt + 1;
  const phrase = phraseFor(plan, moment, voice);
  if (!phrase || phrase.key === done) return { phrase: null, wakeAt: next };
  if (now < phrase.at - SLACK.earlyMs) return { phrase: null, wakeAt: phrase.at };
  const late = now - phrase.at > SLACK.lateMs;
  const fits = now + notesSeconds(phrase.notes) * 1000 <= moment.endsAt;
  return { phrase: !late && fits ? phrase : null, wakeAt: next };
}

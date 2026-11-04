/**
 * Die festen Laute des Jellys und die Entscheidung, was gerade erklingt.
 *
 * Alle Laute sind von Hand geschriebene Noten. Tonhöhen stehen in Halbtönen über dem Grundton aus
 * `voice.ts`, sie lassen sich also ohne Nachmessen verschieben.
 *
 * @module
 */

import { isEmoteKey, type EmoteKey } from "@jelly/scene/emotes";
import { isPartnerMotionKey, type PartnerMotionKey } from "@jelly/scene/partner-emotes";

import { noteHz, speechNotes, type VoiceNote, type Vowel } from "./voice";

/**
 * Eine Note als Tabellenzeile: Beginn, Länge, Tonhöhe von und nach, Vokal, Lautstärke, Vibrato,
 * Geräusch.
 */
type Row = [number, number, number, number, Vowel, number?, number?, VoiceNote["onset"]?];

/** Baut aus Tabellenzeilen die Noten eines Lauts. */
function clip(rows: Row[]): VoiceNote[] {
  return rows.map(([at, duration, from, to, vowel, gain = 1, shake, onset]) => ({
    at,
    duration,
    from: noteHz(from),
    to: noteHz(to),
    vowel,
    gain,
    shake,
    onset,
  }));
}

/** Kurze Laute zum Hüpfen. Sie wechseln sich ab, damit wiederholtes Stupsen nicht nervt. */
export const HOP_CLIPS = [
  // „mya!“
  clip([
    [0, 0.05, -4, 2, "i", 0.7],
    [0.05, 0.12, 3, 5, "a"],
  ]),
  // „pu!“
  clip([[0, 0.13, 0, 7, "u", 0.9, undefined, "tick"]]),
  // „mi-ya“
  clip([
    [0, 0.07, 4, 7, "i", 0.8],
    [0.08, 0.13, 9, 7, "a"],
  ]),
];

/** „mi-a-u“, wenn die Geräusche eingeschaltet werden. */
export const HELLO = clip([
  [0, 0.09, 0, 2, "i", 0.8],
  [0.09, 0.16, 4, 7, "a"],
  [0.25, 0.26, 7, 4, "u", 0.9, 22],
]);

/** Die kleine Fanfare beim Levelaufstieg. */
export const LEVEL_UP = clip([
  [0, 0.1, 0, 0, "a", 0.85],
  [0.11, 0.1, 4, 4, "a", 0.85],
  [0.22, 0.1, 7, 7, "e", 0.9],
  [0.33, 0.1, 12, 12, "a"],
  [0.45, 0.1, 9, 9, "e", 0.85],
  [0.56, 0.48, 12, 14, "a", 1, 26],
]);

/** Ein Laut je Geste, abgestimmt auf ihre Bewegung in `@jelly/scene`. */
export const EMOTE_CLIPS: Record<EmoteKey, VoiceNote[]> = {
  // „hi-hi … hi-ya“
  wave: clip([
    [0.3, 0.12, 4, 7, "i", 0.9, undefined, "hiss"],
    [0.46, 0.16, 7, 9, "i", 1, undefined, "hiss"],
    [0.82, 0.12, 7, 9, "i", 0.7, undefined, "hiss"],
    [0.96, 0.22, 9, 7, "a", 0.8],
  ]),
  // „du-da-du-da“ im Takt des Wiegens.
  dance: clip([
    [0.2, 0.18, 0, 0, "u", 0.8, undefined, "tick"],
    [0.42, 0.18, 4, 4, "a", 0.8, undefined, "tick"],
    [0.65, 0.18, 7, 7, "u", 0.85, undefined, "tick"],
    [0.87, 0.18, 4, 4, "a", 0.8, undefined, "tick"],
    [1.1, 0.18, 2, 2, "u", 0.8, undefined, "tick"],
    [1.32, 0.18, 7, 7, "a", 0.85, undefined, "tick"],
    [1.55, 0.18, 9, 9, "u", 0.9, undefined, "tick"],
    [1.77, 0.18, 7, 7, "a", 0.85, undefined, "tick"],
    [2, 0.18, 4, 4, "u", 0.85, undefined, "tick"],
    [2.22, 0.34, 12, 12, "a", 0.95, 18, "tick"],
  ]),
  // „ya-ya-yaaa“ zu den Hüpfern.
  cheer: clip([
    [0.2, 0.17, 0, 5, "a", 0.85],
    [0.7, 0.17, 4, 9, "a", 0.95],
    [1.2, 0.72, 9, 12, "a", 1, 28],
  ]),
  // „he-he-he“ im Takt des Schüttelns.
  laugh: clip([
    [0.15, 0.1, 9, 9, "e", 0.9, undefined, "hiss"],
    [0.28, 0.1, 7, 7, "e", 0.85, undefined, "hiss"],
    [0.41, 0.1, 9, 9, "e", 0.9, undefined, "hiss"],
    [0.54, 0.1, 7, 7, "e", 0.85, undefined, "hiss"],
    [0.67, 0.1, 4, 4, "e", 0.85, undefined, "hiss"],
    [0.8, 0.1, 7, 7, "e", 0.85, undefined, "hiss"],
    [0.93, 0.1, 4, 4, "e", 0.8, undefined, "hiss"],
    [1.06, 0.14, 2, 0, "a", 0.8, undefined, "hiss"],
    [1.5, 0.1, 7, 7, "e", 0.6, undefined, "hiss"],
    [1.63, 0.14, 4, 2, "e", 0.55, undefined, "hiss"],
  ]),
  // Ein leises, sinkendes Summen.
  sleep: clip([
    [0.4, 1, -3, -5, "u", 0.5, 10],
    [1.6, 1.1, -5, -8, "o", 0.35, 12],
  ]),
  // „mm-waa-iii“ mit viel Vibrato.
  love: clip([
    [0.3, 0.25, 0, 5, "u", 0.8],
    [0.58, 0.6, 7, 9, "a", 1, 26],
    [1.22, 0.55, 12, 7, "i", 0.8, 18],
  ]),
};

/** Die Hüpfer des Partners beim Auftritt und beim Abgang, sie landen im Takt von `partnerEmotes.ts`. */
const ARRIVING: Row[] = [
  [0.03, 0.15, -3, 2, "u", 0.7, undefined, "tick"],
  [0.28, 0.16, 0, 5, "u", 0.8, undefined, "tick"],
];
const LEAVING: Row[] = [
  [3.53, 0.15, 5, 0, "u", 0.8, undefined, "tick"],
  [3.78, 0.16, 2, -3, "u", 0.7, undefined, "tick"],
];

/** Sortiert frisch gebaute Noten nach ihrem Einsatz. */
const inOrder = (notes: VoiceNote[]) => notes.sort((first, second) => first.at - second.at);

/**
 * Beide Fassungen eines Partner-Emotes. Zu zweit kommen Auftritt und Abgang dazu, allein singt das
 * eigene Jelly auch die Takte des Partners, die es dann ja selbst tanzt.
 */
function duet(own: Row[], partner: Row[]) {
  const theirs = clip([...ARRIVING, ...partner, ...LEAVING]).map((note) => ({
    ...note,
    by: "partner" as const,
  }));
  return { pair: inOrder([...clip(own), ...theirs]), solo: inOrder(clip([...own, ...partner])) };
}

/** Die Laute im Takt der Partner-Emotes: das eigene Jelly oben, der Partner tiefer, im Wechsel. */
export const PARTNER_CLIPS: Record<PartnerMotionKey, ReturnType<typeof duet>> = {
  // „pu“ und „po“ zu den Hüpfern, jede Runde höher.
  hop: duet(
    [
      [0.52, 0.26, 2, 9, "u", 0.9, undefined, "tick"],
      [1.52, 0.26, 4, 11, "u", 0.95, undefined, "tick"],
      [2.52, 0.26, 7, 14, "u", 1, undefined, "tick"],
    ],
    [
      [1.02, 0.26, -3, 4, "o", 0.85, undefined, "tick"],
      [2.02, 0.26, -1, 6, "o", 0.9, undefined, "tick"],
      [3.02, 0.26, 2, 9, "o", 0.95, undefined, "tick"],
    ],
  ),
  // „wiii-a“ und „wooo-u“: Die Stimme steigt mit der Drehung und fällt, wenn sie ausläuft.
  spin: duet(
    [
      [0.6, 0.75, 0, 12, "i", 0.85, undefined, "hiss"],
      [1.35, 0.55, 12, 5, "a", 0.8, 14],
    ],
    [
      [2.1, 0.75, -5, 7, "o", 0.85, undefined, "hiss"],
      [2.85, 0.55, 7, 0, "u", 0.8, 14],
    ],
  ),
  // „wi-wa“ und „wu-wo“: Die Tonhöhe schwingt mit dem Wackeln hin und her.
  wiggle: duet(
    [
      [0.52, 0.21, 9, 4, "i", 0.85, undefined, "hiss"],
      [0.75, 0.21, 4, 9, "a", 0.85],
      [1.52, 0.21, 11, 7, "i", 0.85, undefined, "hiss"],
      [1.75, 0.21, 7, 11, "a", 0.85],
      [2.52, 0.21, 12, 7, "i", 0.9, undefined, "hiss"],
      [2.75, 0.21, 7, 12, "a", 0.9],
    ],
    [
      [1.02, 0.21, 4, 0, "u", 0.8, undefined, "hiss"],
      [1.25, 0.21, 0, 4, "o", 0.8],
      [2.02, 0.21, 6, 2, "u", 0.8, undefined, "hiss"],
      [2.25, 0.21, 2, 6, "o", 0.8],
      [3.02, 0.21, 7, 4, "u", 0.85, undefined, "hiss"],
      [3.25, 0.21, 4, 7, "o", 0.85],
    ],
  ),
};

/** Was für die Stimme gerade gilt. */
export interface VoiceMoment {
  /** Geräusche an? */
  sound: boolean;
  message: string;
  /** Steigt mit jeder Meldung, auch wenn derselbe Text noch einmal kommt. */
  messageId: number;
  /** Steigt mit jedem Hüpfer. */
  pulse: number;
  /** `null`, solange der Stand vom Server noch fehlt. */
  level: number | null;
  /** Lautstärke in Prozent. `null`, solange die gespeicherten Einstellungen noch fehlen. */
  volume: number | null;
  /**
   * Die laufende Geste. Jede neue Geste ist ein neues Objekt. `partner` sagt beim Partner-Emote, ob
   * ein zweites Jelly dabei ist.
   */
  emote: { key: string; partner?: unknown } | null;
}

/**
 * Ob der Regler bewegt wurde. Das Laden der gespeicherten Lautstärke zählt nicht, es kommt als
 * `null`.
 */
function volumeMoved({ volume: before }: VoiceMoment, { volume: after }: VoiceMoment) {
  return before !== null && after !== null && after !== before;
}

/** Ob das Level gestiegen ist. Vom Vorschau-Stand zum echten Stand zählt nicht, er kommt als `null`. */
function levelRose({ level: before }: VoiceMoment, { level: after }: VoiceMoment) {
  return before !== null && after !== null && after > before;
}

/**
 * Der Laut einer neuen Geste. Ein neuerer Server kann Gesten kennen, die hier noch keinen Laut
 * haben.
 */
function emoteClip(before: VoiceMoment, after: VoiceMoment) {
  if (!after.emote || after.emote === before.emote) return null;
  const { key, partner } = after.emote;
  if (isPartnerMotionKey(key)) return PARTNER_CLIPS[key][partner ? "pair" : "solo"];
  return isEmoteKey(key) ? EMOTE_CLIPS[key] : [];
}

/** Was erklingen soll, wenn der Stand von `before` zu `after` wechselt, oder `null` für nichts. */
export function pickClip(before: VoiceMoment, after: VoiceMoment): VoiceNote[] | null {
  if (!after.sound) return null;
  // Beim Einschalten und als Hörprobe, sobald der Lautstärke-Regler ruht.
  if (!before.sound || volumeMoved(before, after)) return HELLO;
  const gesture = emoteClip(before, after);
  if (gesture) return gesture;
  if (levelRose(before, after)) return LEVEL_UP;
  if (after.message !== before.message) return speechNotes(after.message);
  if (after.pulse !== before.pulse) return HOP_CLIPS[after.pulse % HOP_CLIPS.length] ?? null;
  return after.messageId === before.messageId ? null : speechNotes(after.message);
}

/**
 * Die eigenen Gesten des Zauberers als reine Zahlen: Schlüssel, Dauer, der Takt seines Zaubers,
 * seiner Tipper beim Münzenzählen, seines Atems im Schlaf und des Nervens an Hut und Bart.
 *
 * Ohne Three.js, damit der Shop sie im Hauptteil laden kann, bevor die Szene da ist. Bewegt werden
 * die Gesten in `wizardGestures.ts`. Sie stehen nicht in `EMOTE_GLYPHS`: Katalog des Servers, Bühne
 * und Emote-Auswahl kennen sie nicht.
 *
 * @module
 */

/** Seine eigenen Gesten. Sie halten die Hände dort, wo kein Sticker sie verdeckt. */
export const WIZARD_GESTURE_KEYS = [
  "hail",
  "rejoice",
  "shrug",
  "offer",
  "tip",
  "cast",
  "count",
  "stroke",
  "nod",
  "yawn",
  "startle",
  "snore",
  "peek",
  "chuckle",
  "huff",
  "guard",
  "unhat",
  "rehat",
  "yank",
] as const;

/** Eine seiner eigenen Gesten. */
export type WizardGestureKey = (typeof WIZARD_GESTURE_KEYS)[number];

/** Übliche Dauer jeder Geste in Sekunden. Das Schnarchen kreist im Takt seines Atems. */
export const WIZARD_GESTURE_SECONDS: Readonly<Record<WizardGestureKey, number>> = {
  hail: 2,
  rejoice: 2,
  shrug: 2.2,
  offer: 2,
  tip: 1.8,
  cast: 3.4,
  count: 2.8,
  stroke: 3.6,
  nod: 1.2,
  yawn: 2.4,
  startle: 0.7,
  snore: 4.2,
  peek: 1.2,
  chuckle: 1.6,
  huff: 1.8,
  guard: 1.6,
  unhat: 1.4,
  rehat: 2,
  yank: 1.3,
};

/** Erkennt seine eigenen Gesten, auch unter beliebigen Zeichenketten. */
export function isWizardGestureKey(key: string): key is WizardGestureKey {
  return Object.hasOwn(WIZARD_GESTURE_SECONDS, key);
}

/**
 * Der Zauber in Sekunden: So lange hebt sich die Kugel und lädt sich auf (`windUp`), so lange stößt
 * die Hand nach dem Lösen vor (`push`).
 */
export const CAST_TIMING = { windUp: 0.6, push: 0.45 } as const;

/** Der erste Tipper beim Münzenzählen, der Abstand der Tipper und wie viele es höchstens sind. */
const COUNT_TAPS = { first: 0.3, step: 0.285, most: 5 } as const;

/** So lange vor dem Ende tippt er nicht mehr: Die Hand kehrt zurück. */
const COUNT_SETTLE = 0.3;

/**
 * Wann der Zeigefinger beim Münzenzählen auf die Schale tippt, in Sekunden ab Beginn der Geste: bei
 * 0,3 s und dann alle 0,285 s, höchstens fünfmal und nur, solange die Geste noch läuft.
 */
export function countTapTimes(seconds: number): number[] {
  const taps: number[] = [];
  for (let index = 0; index < COUNT_TAPS.most; index++) {
    const at = COUNT_TAPS.first + index * COUNT_TAPS.step;
    if (at > seconds - COUNT_SETTLE) break;
    taps.push(at);
  }
  return taps;
}

/** Ein Atemzug im Schlaf in Sekunden. Schnarchen und Atmen laufen in diesem Takt. */
export const SNORE_PERIOD_SECONDS = 4.2;

/**
 * Das Nerven in Sekunden: So lange fliegt der geklaute Hut davon (`snatch`), so lange zaubert er,
 * bis der Hut wieder erscheint (`conjure`), so lange sinkt der Hut auf den Kopf (`land`), so lange
 * dehnt sich der Bart (`stretch`) und so lange federt er nach dem Schnalzen nach (`snap`).
 */
export const TEASE_TIMING = {
  snatch: 0.5,
  conjure: 0.7,
  land: 0.25,
  stretch: 0.4,
  snap: 0.5,
} as const;

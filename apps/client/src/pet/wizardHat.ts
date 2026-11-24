/**
 * Funkelbarts Hut beim Server: Wer ihn ihm im Shop stiehlt, trägt ihn `wizard_hat_seconds` lang, je
 * LAN höchstens ein Jelly. Hier steht, was der Stand darüber sagt, auf die Uhr des Fensters
 * umgerechnet, und wie der Shop die Zeit bis zur Rückkehr nennt.
 *
 * Ob der Zauberer dabei ohne Hut dasteht, entscheidet sein Gehirn (`wizardBrain.ts` mit
 * `wizardTease.ts`), dieses Modul rechnet nur.
 *
 * @module
 */

import type { Me } from "./types";

import { TEASE } from "./shopTimeline";

/** Der Hut als Cosmetic: Solange das eigene Jelly ihn trägt, steht er als `head` in `equipped`. */
export const WIZARD_HAT_KEY = "wizard-hat";

/** Wer den Hut laut Server trägt. */
export interface HatHolder {
  /** Ob es das eigene Jelly ist. */
  mine: boolean;
  /** Sein Name, für Satz und Schild. */
  name: string;
}

/** Der Hut beim Server: wer ihn trägt und wie lange noch. */
export interface ServerHat extends HatHolder {
  /** So lange noch, bis er von selbst zurückgeht. */
  remainingMs: number;
}

/**
 * Was der Stand über den Hut sagt, `null`, solange ihn niemand trägt. Bleibt ihm weniger als
 * `TEASE.ending`, gilt er schon als zurück: So zieht ihn ein später Stand nicht noch einmal weg.
 *
 * @param serverNow - Die Uhrzeit des Servers, `Date.now() + offset` aus `useGameState`.
 */
export function serverHat(me: Me | null, serverNow: number): ServerHat | null {
  const hat = me?.wizard_hat;
  if (!me || !hat) return null;
  const remainingMs = hat.ends_at - serverNow;
  if (remainingMs < TEASE.ending) return null;
  return { mine: hat.holder_id === me.id, name: hat.holder_name, remainingMs };
}

/** Ganze Sekunden bis zur Rückkehr, mindestens eine. */
function secondsLeft(ms: number) {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Die Zeit bis zur Rückkehr in Worten für seinen Satz: Sekunden, Minuten, ab zwei Stunden Stunden.
 * Höchstens elf Zeichen, auch bei den 30 Tagen, die die Regel erlaubt.
 */
export function hatTimeWords(ms: number) {
  const seconds = secondsLeft(ms);
  if (seconds < 60) return seconds === 1 ? "1 Sekunde" : `${seconds} Sekunden`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return minutes === 1 ? "1 Minute" : `${minutes} Minuten`;
  return `${Math.round(minutes / 60)} Stunden`;
}

/** Die Zeit bis zur Rückkehr für das Schild, als `m:ss`, ab einer Stunde als `h:mm:ss`. */
export function hatClock(ms: number) {
  const seconds = secondsLeft(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = `${pad(seconds % 60)}`;
  return hours > 0 ? `${hours}:${pad(minutes)}:${rest}` : `${minutes}:${rest}`;
}

/** Was das Schild am Hut sagt: bei wem er ist und wie lange noch. */
export function hatSignText(hat: ServerHat) {
  return `bei ${hat.mine ? "dir" : hat.name} · ${hatClock(hat.remainingMs)}`;
}

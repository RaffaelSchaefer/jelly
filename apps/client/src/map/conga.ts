/**
 * Die Polonaise auf der Karte: Dazustellen bleibt der Auslöser, aber wo daraus eine Polonaise wird
 * (`findCongaLines` der Bühne, mindestens drei Jellies in einem Folge-Baum), nennen Knopf, Meldung
 * und Leiste sie beim Namen. Reine Rechnung aus den Jellies vom letzten Lesen und der Serverzeit.
 *
 * @module
 */

import { findCongaLines, type CongaPlayer } from "@jelly/stage/conga";

const TEXT_FOLLOW = "Dazustellen";
const TEXT_LEAVE = "Weggehen";
const TEXT_CONGA_JOIN = "Polonaise mitmachen";
const TEXT_CONGA_LEAVE = "Polonaise verlassen";
/** „Ihr seid zu dritt“: die Wörter ab drei Jellies. Darüber steht die Zahl. */
const TOGETHER = [
  "dritt",
  "viert",
  "fünft",
  "sechst",
  "siebt",
  "acht",
  "neunt",
  "zehnt",
  "elft",
  "zwölft",
];
const FIRST_TOGETHER = 3;

/** Was die Karte für die Rechnung weiß. */
export interface CongaScene {
  /** Die Jellies vom letzten Lesen. */
  players: CongaPlayer[];
  /** `null`, bevor das eigene Jelly bekannt ist. */
  ownId: number | null;
  serverTime: number;
}

/** Was der Knopf zum Dazustellen an einem fremden Jelly sagt. */
export interface FollowChoice {
  label: string;
  /** Das eigene Jelly steht mit diesem Ziel in einer Polonaise oder stünde dann in einer. */
  isConga: boolean;
}

/**
 * Wie viele Jellies die Polonaise hat, in der das eigene steht, sobald es `targetId` folgt. 0 ohne
 * Polonaise und ohne Ziel: Wer nur vorangeht, folgt niemandem und kann nichts verlassen.
 */
export function countConga(scene: CongaScene, targetId: number | null): number {
  const { ownId, serverTime } = scene;
  if (ownId === null || targetId === null) return 0;
  // Das Ziel ersetzt, was im Stand steht: Der hinkt dem eigenen Klick hinterher.
  const players = scene.players.map((player) =>
    player.id === ownId
      ? { id: ownId, follow: { player_id: targetId, ends_at: Infinity } }
      : player,
  );
  const line = findCongaLines(players, serverTime).find((found) => found.memberIds.includes(ownId));
  return line?.memberIds.length ?? 0;
}

/** Beschriftet den Knopf: dazustellen oder weggehen, in einer Polonaise mit ihrem Namen. */
export function chooseFollow(scene: CongaScene, playerId: number, isTarget: boolean): FollowChoice {
  const isConga = countConga(scene, playerId) > 0;
  if (isTarget) return { label: isConga ? TEXT_CONGA_LEAVE : TEXT_LEAVE, isConga };
  return { label: isConga ? TEXT_CONGA_JOIN : TEXT_FOLLOW, isConga };
}

/** Die Meldung nach dem Dazustellen. `count` kommt aus {@link countConga}. */
export function describeFollow(count: number, targetName: string): string {
  if (count < FIRST_TOGETHER) return `Dein Jelly stellt sich zu ${targetName}.`;
  const together = TOGETHER[count - FIRST_TOGETHER];
  return together ? `Polonaise! Ihr seid zu ${together}.` : `Polonaise! Ihr seid ${count} Jellies.`;
}

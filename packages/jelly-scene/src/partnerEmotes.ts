/**
 * Partner-Emotes als Duett: Der Partner hüpft von links herein, beide machen die Geste abwechselnd,
 * dann hüpft er wieder hinaus. Nur reine Rechnung, ohne Renderer.
 *
 * Die Posen gehören auf eine Hülle um `jelly.root`, denn die Grundanimation setzt `root` selbst.
 *
 * @module
 */

import { EMOTE_SECONDS } from "./emotes.ts";

/** Dauer des Auftritts in Sekunden, ebenso die des Abgangs. */
const TRAVEL_SECONDS = 0.5;

/** Wie lange das Duett läuft: Auftritt, die Geste so lang wie ein Emote, Abgang. */
export const PARTNER_EMOTE_SECONDS = TRAVEL_SECONDS + EMOTE_SECONDS + TRAVEL_SECONDS;

/** Abstand der beiden Jellies von der Mitte. Bei dieser Größe bleiben ihre Hände im Fenster. */
export const DUET_OFFSET_X = 1;

/** Größe der beiden Jellies, solange sie sich den Platz teilen. */
export const DUET_SCALE = 0.85;

/** Wo der Partner außerhalb des Fensters wartet. */
export const OFFSTAGE_X = -3.6;

/** Höhe eines Hüpfers beim Auftritt und Abgang, in Szeneneinheiten. */
const TRAVEL_HOP = 0.3;

/** Höhe eines Hüpfers der Geste. Mehr stieße in die Sprechblase. */
const HOP_LIFT = 0.4;

/** Größte Neigung beim Wackeln im Bogenmaß. */
const WIGGLE_ANGLE = 0.3;

/** Takte je Geste. Beide kommen im Wechsel dran, ein Takt beginnt und endet in Ruhe. */
const PARTNER_BEATS = { hop: 6, spin: 2, wiggle: 6 } as const;

/** Schlüssel eines Partner-Emotes, das dieses Jelly darstellen kann. */
export type PartnerMotionKey = keyof typeof PARTNER_BEATS;

/** Wer tanzt. `solo` ist das eigene Jelly ohne sichtbaren Partner: Es bleibt in der Mitte. */
export type DuetRole = "own" | "partner" | "solo";

/** Ein Partner-Emote, seine bisherige Laufzeit in Sekunden und wer es tanzt. */
export interface PartnerFrame {
  key: PartnerMotionKey;
  elapsed: number;
  role: DuetRole;
}

/** Wo die Hülle um ein Jelly in diesem Bild steht. */
export interface DuetPose {
  /** Seitlich in Szeneneinheiten. */
  x: number;
  /** Nach oben in Szeneneinheiten. */
  lift: number;
  /** Um die Hochachse im Bogenmaß. */
  turn: number;
  /** Zur Seite im Bogenmaß. */
  tilt: number;
  /** Größe, gleich in alle Richtungen. */
  scale: number;
}

const STILL = { lift: 0, turn: 0, tilt: 0 };

/** Erkennt bekannte Partner-Emotes, auch bei einem neueren Server-Katalog. */
export function isPartnerMotionKey(key: string): key is PartnerMotionKey {
  return Object.hasOwn(PARTNER_BEATS, key);
}

/** Wie lange die Geste zu `key` in Sekunden läuft. */
export function emoteSeconds(key: string) {
  return isPartnerMotionKey(key) ? PARTNER_EMOTE_SECONDS : EMOTE_SECONDS;
}

/** Wo eine Rolle vor und nach dem Duett steht. */
export function restPose(role: DuetRole): DuetPose {
  if (role === "partner") return { ...STILL, x: OFFSTAGE_X, scale: DUET_SCALE };
  return { ...STILL, x: 0, scale: 1 };
}

/** Wo eine Rolle steht, solange sich beide den Platz teilen. */
function parkedPose(role: DuetRole): DuetPose {
  if (role === "solo") return restPose(role);
  const x = role === "own" ? DUET_OFFSET_X : -DUET_OFFSET_X;
  return { ...STILL, x, scale: DUET_SCALE };
}

/** Weicher Verlauf von 0 nach 1. */
function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

/** Auftritt und Abgang. `arrival` läuft von 0 (Ruhe) nach 1 (geparkt), der Abgang rückwärts. */
function travelPose(role: DuetRole, arrival: number): DuetPose {
  if (role === "solo") return restPose(role);
  if (role === "own") {
    const eased = smoothstep(arrival);
    return {
      ...STILL,
      x: DUET_OFFSET_X * eased,
      scale: 1 + (DUET_SCALE - 1) * eased,
    };
  }
  const eased = 1 - (1 - arrival) ** 2;
  return {
    ...STILL,
    x: OFFSTAGE_X + (-DUET_OFFSET_X - OFFSTAGE_X) * eased,
    // Zwei kleine Hüpfer, die beim Warten und beim Ankommen auf dem Boden enden.
    lift: TRAVEL_HOP * Math.abs(Math.sin(2 * Math.PI * arrival)),
    scale: DUET_SCALE,
  };
}

/** Was eine Geste im laufenden Takt verändert. `phase` läuft von 0 nach 1. */
const BEAT_MOTIONS: Record<PartnerMotionKey, (phase: number) => Partial<DuetPose>> = {
  hop: (phase) => ({ lift: HOP_LIFT * Math.sin(Math.PI * phase) }),
  spin: (phase) => ({ turn: 2 * Math.PI * smoothstep(phase) }),
  wiggle: (phase) => ({ tilt: WIGGLE_ANGLE * Math.sin(2 * Math.PI * phase) }),
};

/** Die Geste selbst. `progress` läuft von 0 nach 1. Das eigene Jelly beginnt, solo tanzt es allein. */
function beatPose(key: PartnerMotionKey, role: DuetRole, progress: number): DuetPose {
  const position = progress * PARTNER_BEATS[key];
  const beat = Math.floor(position);
  const parked = parkedPose(role);
  const onTurn = role === "solo" || (beat % 2 === 0) === (role === "own");
  return onTurn ? { ...parked, ...BEAT_MOTIONS[key](position - beat) } : parked;
}

/**
 * Die Pose einer Rolle in diesem Bild. Außerhalb der Laufzeit steht sie in Ruhe, bei reduzierter
 * Bewegung geparkt und still.
 */
export function partnerPose({ key, elapsed, role }: PartnerFrame, reducedMotion: boolean) {
  const running = Number.isFinite(elapsed) && elapsed >= 0 && elapsed < PARTNER_EMOTE_SECONDS;
  if (!running) return restPose(role);
  if (reducedMotion) return parkedPose(role);
  if (elapsed < TRAVEL_SECONDS) return travelPose(role, elapsed / TRAVEL_SECONDS);
  const left = PARTNER_EMOTE_SECONDS - elapsed;
  if (left < TRAVEL_SECONDS) return travelPose(role, left / TRAVEL_SECONDS);
  return beatPose(key, role, (elapsed - TRAVEL_SECONDS) / EMOTE_SECONDS);
}

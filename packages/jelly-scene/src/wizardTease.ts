/**
 * Die Gesten des Zauberers, wenn man ihn nervt: Er hält den Hut fest, verliert ihn, zaubert ihn
 * zurück, und sein Bart dehnt sich und schnalzt zurück. Dazu, wie weit der Hut gerade fort ist.
 *
 * Ob er den Hut trägt, ist ein Stand und keine Geste ({@link HatState}): Eine unterbrochene Geste
 * setzt ihm den Hut nicht wieder auf. Die Zeiten stehen in `wizardTiming.ts`.
 *
 * @module
 */

import { MathUtils } from "three";

import { poseHand, poseHands, type HandPose } from "./emoteAnimation.ts";
import { EXPRESSIONS, type Expression } from "./expression.ts";
import { express } from "./wizardFace.ts";
import { bump, type Move } from "./wizardMove.ts";
import { TEASE_TIMING } from "./wizardTiming.ts";

/** Ob der Hut fort ist und seit wie vielen Sekunden das so ist. */
export interface HatState {
  off: boolean;
  since: number;
}

/**
 * Wie weit der Hut fort ist, 0 auf dem Kopf, 1 weg: Geklaut fliegt er in `snatch` davon,
 * zurückgezaubert erscheint er nach `conjure` und sinkt in `land` auf den Kopf. Bei reduzierter
 * Bewegung ist er sofort da oder fort.
 */
export function hatAway(hat: HatState | null | undefined, reducedMotion: boolean) {
  if (!hat) return 0;
  if (reducedMotion) return hat.off ? 1 : 0;
  const { snatch, conjure, land } = TEASE_TIMING;
  if (hat.off) return MathUtils.smoothstep(hat.since, 0, snatch);
  return 1 - MathUtils.smoothstep(hat.since, conjure, conjure + land);
}

/** Der Griff an die Krempe von außen, mit geschlossenen Fingern. */
const BRIM_GRIP: HandPose = { at: [1.3, 0.92, 0.55], turn: [0, 0, 0.9], curl: [0.7, 0.8, 0.5] };

/** Ausdrücke beim Nerven. */
const GUARDING: Expression = { ...EXPRESSIONS.angry, mouthScale: [0.8, 1] };
const YELPING: Expression = { eyes: "squint", brows: { lift: 0.04, tilt: 0.4 }, mouth: "o" };

/** Hält den Hut mit beiden Händen fest: Ein Ruck hebt ihn an, er zerrt ihn zurück auf den Kopf. */
export function guard({ jelly, strength, t, moving, face, out }: Move) {
  const tug = moving ? bump(t, [0, 0.12, 0.3, 0.6]) : 0.4;
  const shake = Math.sin(t * 34) * 0.015 * tug * moving;
  const [x, y, z] = BRIM_GRIP.at;
  poseHands(jelly, () => ({ ...BRIM_GRIP, at: [x + shake, y + 0.06 * tug, z] }), strength);
  jelly.head.position.y -= 0.03 * (1 - tug) * strength;
  out.hatLift = 0.1 * tug * strength;
  out.hatTilt = 0.14 * tug * strength;
  express(jelly, GUARDING, strength, face);
}

/** Der Hut ist weg: Er fährt hoch und greift mit beiden Händen über dem Kopf ins Leere. */
export function unhat({ jelly, strength, t, moving, face }: Move) {
  const jump = bump(t, [0, 0.08, 0.2, 0.5]) * moving;
  const grasp = 0.5 + 0.5 * Math.sin(t * 16) * moving;
  poseHands(
    jelly,
    () => ({ at: [1.12, 1.2, 0.3], turn: [0, 0, -0.5], curl: [grasp, grasp, 0.3] }),
    strength,
  );
  jelly.root.position.y += 0.1 * jump * strength;
  express(jelly, EXPRESSIONS.shout, strength, face);
}

/**
 * Zaubert den Hut zurück: Die rechte Hand kreist erhoben, bis er landet, dann rückt sie ihn
 * zurecht.
 */
export function rehat({ jelly, strength, elapsed, t, moving, out }: Move) {
  const { conjure, land } = TEASE_TIMING;
  const landed = moving ? MathUtils.smoothstep(elapsed, conjure, conjure + land) : 1;
  const twirl = 0.08 * (1 - landed);
  const [x, y, z] = BRIM_GRIP.at;
  const pose: HandPose = {
    at: [
      MathUtils.lerp(1.15 + twirl * Math.cos(t * 14), x, landed),
      MathUtils.lerp(1.25 + twirl * Math.sin(t * 14), y, landed),
      MathUtils.lerp(0.3, z, landed),
    ],
    turn: [0, 0, MathUtils.lerp(-0.2, BRIM_GRIP.turn[2], landed)],
    curl: [0.5 * landed, 0.8 - 0.3 * landed, 0.4],
  };
  poseHand(jelly, 1, pose, strength);
  // Der Hut federt nach, wenn er gelandet ist.
  out.hatLift = 0.05 * bump(elapsed - conjure - land, [0, 0.08, 0.1, 0.35]) * moving * strength;
}

/** Am Bart gezogen: Er dehnt sich, der Kopf kommt mit, dann schnalzt er zurück und federt nach. */
export function yank({ jelly, strength, elapsed, moving, face, out }: Move) {
  const { stretch, snap } = TEASE_TIMING;
  const since = elapsed - stretch;
  // Nach dem Loslassen schwingt der Bart gedämpft um seine Ruhelage.
  const spring = Math.exp((-3 * since) / snap) * Math.cos(since * 28);
  const swing = since < 0 ? MathUtils.smoothstep(elapsed, 0, stretch) : spring;
  const pull = moving ? swing : 0.5;
  const flail = moving ? MathUtils.smoothstep(since, 0, 0.1) : 1;
  poseHands(jelly, () => ({ at: [1.2, 0.5, 0.4], turn: [0, 0, -0.6] }), strength * flail);
  jelly.head.position.y -= 0.05 * pull * strength;
  jelly.head.rotation.x += 0.1 * pull * strength;
  out.beardPull = pull * strength;
  out.lean = 0.05 * Math.max(0, pull) * strength;
  express(jelly, YELPING, strength, face);
}

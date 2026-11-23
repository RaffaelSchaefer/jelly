/**
 * Die eigenen Gesten des Zauberers und alles, was er Bild für Bild über die Grundanimation legt:
 * Gesten, Stimmung, schwere Lider, Schlaf, dazu Hut, Bart und Kugel als Zahlen für den Shop. Die
 * Gesten beim Nerven stehen in `wizardTease.ts`.
 *
 * Sticker malen über die gezeichneten Hände. Seine Hände zeigen sich deshalb nur, wo kein Sticker
 * liegt: seitlich neben Robe und Bart (|x| ≥ 1,05, y von −0,2 bis 1,3) oder knapp daneben in
 * Brusthöhe (|x| von 0,72 bis 1,05, y von 0,25 bis 0,72). Nur beim Bartstreichen liegen die Finger
 * im Bart. Unter y −0,26 verdeckt ihn die Theke. Und der Körper wird nur in seinem Kasten
 * gezeichnet (`BOUNDS` in `body.ts`, |x| ≤ 1,65, z ≤ 1,08): Keine Hand reicht darüber hinaus.
 *
 * @module
 */

import { MathUtils } from "three";

import type { Jelly } from "./jelly.ts";

import { gestureStrength, poseHand, poseHands, type HandPose } from "./emoteAnimation.ts";
import { EXPRESSIONS, type Expression } from "./expression.ts";
import {
  applyMood,
  express,
  shapeEyes,
  sleepDepth,
  type FaceContext,
  type WizardMood,
} from "./wizardFace.ts";
import { bump, type GestureOut, type Move, type WizardExtras } from "./wizardMove.ts";
import { guard, hatAway, rehat, unhat, yank, type HatState } from "./wizardTease.ts";
import {
  CAST_TIMING,
  countTapTimes,
  isWizardGestureKey,
  SNORE_PERIOD_SECONDS,
  type WizardGestureKey,
} from "./wizardTiming.ts";

/** Eine seiner Gesten in diesem Bild, Zeiten in Sekunden ab ihrem Beginn. */
export interface WizardGestureFrame {
  key: WizardGestureKey;
  elapsed: number;
  /** Wie lange sie läuft. Unendlich kreist sie, etwa das Schnarchen. */
  seconds: number;
  /** Wann der Zauber losbricht. Ohne Angabe bleibt er geladen. */
  releaseAt?: number;
}

/** Was {@link animateWizard} pro Bild braucht. */
export interface WizardFrame {
  /** Zeit der Szenenuhr in Sekunden. */
  time: number;
  gesture?: WizardGestureFrame | null;
  mood: WizardMood;
  /** Wie lange er schon schläft, in Sekunden. Der Takt seines Atems. */
  asleepFor?: number | null;
  /** Spricht er? Dann formt die Stimme den Mund. */
  speaking: boolean;
  /** Ob sein Hut fort ist. Ohne Angabe trägt er ihn. */
  hat?: HatState | null;
}

export type { HatState, WizardExtras };

/**
 * Über der Kugel: Sie steht bei x 1,68, außerhalb des Kastens, in dem der Körper gezeichnet wird.
 * Die Hand schwebt deshalb links über ihr und stößt nach vorn, nicht weiter nach außen. Gehoben
 * reicht die Kugel bis y 0,43, die Hand schwebt knapp darüber.
 */
const OVER_ORB = { charged: [1.42, 0.58, 0.78], pushed: [1.45, 0.5, 0.86] } as const;

/**
 * Die Handfläche über der Kugel: zur Kamera gedreht und ein wenig zur Kugel hinab geneigt, die
 * Finger nach oben und außen. Flach nach unten sähe die Kamera auf Augenhöhe die Hand nur von der
 * Kante, als Klumpen.
 */
const OVER_ORB_TURN = { charged: [0.3, 0, -0.5], pushed: [0.2, 0, -0.5] } as const;

/**
 * Am Hut: Die Hand greift die Krempe von außen, die Finger zeigen schräg nach innen auf ihre
 * Spitze. Weiter innen läge sie unter den Stickern von Krempe und Locken und bliebe unsichtbar.
 */
const AT_BRIM: HandPose = { at: [1.3, 0.92, 0.55], turn: [0, 0, 0.9], curl: [0.45, 0.5, 0.35] };

/** Handfläche nach oben, die Finger zum Kunden. */
const PALM_UP: HandPose["turn"] = [-1, 0, -1.45];

/** Ausdrücke der Gesten. */
const SHRUGGING: Expression = { ...EXPRESSIONS.skeptic, mouth: "sad" };
const OFFERING: Expression = { brows: { lift: 0.02, tilt: 0.05 } };
const STROKING: Expression = { squeeze: 0.15, brows: { lift: 0.01, tilt: -0.1 } };
const YAWNING: Expression = { eyes: "closed", mouth: "o", mouthScale: [1.1, 1.6] };
const HUFFING: Expression = { ...EXPRESSIONS.angry, squeeze: 0.3, mouthScale: [0.8, 1] };

/** Hebt die Hand zum Gruß neben den Kopf und winkt gemächlich. */
function hail({ jelly, strength, t, moving }: Move) {
  const swing = Math.sin(t * 6) * moving;
  const pose: HandPose = {
    at: [1.25 + swing * 0.06, 0.62, 0.35],
    turn: [0, 0, -0.25 - swing * 0.35],
  };
  poseHand(jelly, 1, pose, strength);
  jelly.head.rotation.z -= 0.05 * strength;
}

/** Beide Hände hoch, die Finger zappeln, er hüpft ein wenig, der Hut wippt. */
function rejoice({ jelly, strength, t, moving, face, out }: Move) {
  const hop = Math.abs(Math.sin(t * Math.PI * 2)) * moving;
  const wiggle = Math.sin(t * 14) * 0.2 * moving;
  poseHands(jelly, () => ({ at: [1.15, 1.15, 0.3], turn: [0, 0, -0.45 + wiggle] }), strength);
  jelly.root.position.y += hop * 0.12 * strength;
  express(jelly, EXPRESSIONS.joy, strength, face);
  out.hatLift = hop * 0.03 * strength;
}

/** Zuckt mit den Schultern, die Hände weit draußen, eine Braue skeptisch. */
function shrug({ jelly, strength, t, moving, face }: Move) {
  const lift = Math.max(0, Math.sin(t * 5)) * 0.08 * moving;
  poseHands(jelly, () => ({ at: [1.1, 0.12 + lift, 0.4], turn: [-0.8, 0, -1.35] }), strength);
  jelly.root.position.y += lift * 0.4 * strength;
  jelly.head.rotation.z += 0.12 * strength;
  express(jelly, SHRUGGING, strength, face);
}

/** Bietet mit offener Hand an, beugt sich vor und nickt einmal. */
function offer({ jelly, strength, t, moving, face, out }: Move) {
  const nod = moving ? bump(t, [0.3, 0.55, 0.75, 1.05]) : 0.5;
  poseHand(jelly, 1, { at: [1.15, 0.35, 0.8], turn: PALM_UP }, strength);
  jelly.head.rotation.x += 0.06 * nod * strength;
  jelly.head.position.y -= 0.02 * nod * strength;
  express(jelly, OFFERING, strength, face);
  out.lean = 0.04 * strength;
}

/** Greift an die Krempe und lüpft den Hut, mit einer kleinen Verbeugung. */
function tip({ jelly, strength, t, out }: Move) {
  const lift = MathUtils.smoothstep(t, 0.25, 0.55) * strength;
  poseHand(jelly, 1, AT_BRIM, strength);
  jelly.head.rotation.z -= 0.04 * strength;
  out.hatLift = 0.07 * lift;
  out.hatTilt = -0.12 * lift;
  out.lean = 0.03 * strength;
}

/**
 * Der Zauber: Die linke Hand hebt sich, die rechte schwebt über der Kugel, die Finger zappeln, bis
 * er losbricht. Dann stößt die Hand vor. Die Kugel steigt beim Laden aus ihren Krallen und glüht.
 */
function cast({ jelly, strength, elapsed, releaseAt, moving, out }: Move) {
  const released = releaseAt !== undefined && elapsed >= releaseAt;
  const charged = moving ? MathUtils.smoothstep(elapsed, 0, CAST_TIMING.windUp) : 1;
  const since = released ? elapsed - releaseAt : 0;
  const push = released ? (moving ? MathUtils.smoothstep(since, 0, CAST_TIMING.push) : 1) : 0;
  const wiggle = released ? 0 : moving;
  const phase = elapsed * Math.PI * 2 * 6;
  poseHand(jelly, 0, { at: [1.15, 0.55, 0.5], turn: [0, 0, 0.25], curl: [0.2, 0.2, 0] }, strength);
  const at = OVER_ORB.charged.map((from, axis) =>
    MathUtils.lerp(from, OVER_ORB.pushed[axis]!, push),
  );
  const turn = OVER_ORB_TURN.charged.map((from, axis) =>
    MathUtils.lerp(from, OVER_ORB_TURN.pushed[axis]!, push),
  );
  // Leicht gebeugt und nur ein wenig zappelnd: Stärker gekrümmt wirkte die Hand wie ein Knäuel.
  const curl = 0.2 + 0.1 * Math.sin(phase) * wiggle;
  const right: HandPose = {
    at: at as [number, number, number],
    turn: turn as [number, number, number],
    curl: [curl * (1 - push), (0.25 + 0.08 * Math.sin(phase + 1.3) * wiggle) * (1 - push), 0.15],
  };
  poseHand(jelly, 1, right, strength);
  out.orbLift = 0.22 * charged * strength;
  out.orbGlow = MathUtils.lerp(0.4, 1, charged) * strength;
  out.lean = 0.05 * push * strength;
}

/** Zählt Münzen: Der Zeigefinger tippt über der Schale, er beugt sich darüber. */
function count({ jelly, strength, elapsed, seconds, moving, out }: Move) {
  const taps = moving ? countTapTimes(seconds) : [];
  const tap = taps.reduce(
    (most, at) => Math.max(most, bump(elapsed - at, [0, 0.05, 0.07, 0.13])),
    0,
  );
  const pose: HandPose = {
    at: [1.2, -0.15 - 0.04 * tap, 0.85],
    turn: [1.35, 0, 0],
    curl: [0, 0.85, 0.6],
  };
  poseHand(jelly, 1, pose, strength);
  jelly.head.rotation.x += 0.04 * strength;
  out.lean = 0.03 * strength;
}

/**
 * Streicht sich zweimal den Bart, den Kopf geneigt. Die Hand liegt am Rand von Bart und Locken, die
 * Finger zeigen hinein: Weiter innen verdeckten Bart und Locken sie ganz.
 */
function stroke({ jelly, strength, elapsed, seconds, moving, face }: Move) {
  const run = MathUtils.clamp((elapsed - 0.3) / Math.max(0.1, seconds - 0.6), 0, 1);
  const down = moving ? 0.5 - 0.5 * Math.cos(run * Math.PI * 4) : 0.5;
  const pose: HandPose = {
    at: [0.76, 0.48 - 0.18 * down, 0.8],
    turn: [0, Math.PI, -2.4],
    curl: [0.35, 0.45, 0.3],
  };
  poseHand(jelly, 1, pose, strength);
  jelly.head.rotation.z += 0.07 * strength;
  express(jelly, STROKING, strength, face);
}

/** Nickt zweimal. */
function nod({ jelly, strength, t, moving }: Move) {
  const dip = moving ? Math.sin((Math.PI * t) / 0.6) ** 2 : 0.7;
  jelly.head.rotation.x += 0.07 * dip * strength;
  jelly.head.position.y -= 0.02 * dip * strength;
}

/** Gähnt herzhaft: Kopf zurück, die Arme strecken sich zwischen 0,6 und 1,6 s nach oben. */
function yawn({ jelly, strength, t, face }: Move) {
  const arms = bump(t, [0.45, 0.75, 1.45, 1.85]);
  const stretch: HandPose = {
    at: [1.12, 0.6 + 0.5 * arms, 0.25],
    turn: [0, 0, -0.3 + 0.3 * arms],
    curl: [0.3, 0.3, 0.2],
  };
  poseHands(jelly, () => stretch, strength * arms);
  jelly.head.rotation.x -= 0.08 * strength;
  jelly.head.position.y += 0.03 * strength;
  express(jelly, YAWNING, strength, face);
}

/** Fährt hoch: ein Ruck nach oben, die Hände fliegen hinaus, der Hut springt. */
function startle({ jelly, strength, out }: Move) {
  jelly.root.position.y += 0.12 * strength;
  poseHands(jelly, () => ({ at: [1.2, 0.5, 0.4], turn: [0, 0, -0.6] }), strength);
  out.hatLift = 0.09 * strength;
}

/**
 * Wie weit die Brust im Schlaf gefüllt ist, −1 leer, 1 voll: Einatmen von 0,15 bis 1,75 s, Ausatmen
 * von 2,1 bis 3,7 s, wie das Schnarchen.
 */
function breathing(seconds: number) {
  const t = MathUtils.euclideanModulo(seconds, SNORE_PERIOD_SECONDS);
  return -1 + 2 * bump(t, [0.15, 1.75, 2.1, 3.7]);
}

/** Schläft und schnarcht: Kopf gesunken, die Brust hebt und senkt sich im Takt. */
function snore({ jelly, strength, breath, moving, out }: Move) {
  const chest = breathing(breath) * moving * strength;
  jelly.root.scale.x *= 1 + 0.015 * chest;
  jelly.root.scale.y *= 1 + 0.03 * chest;
  jelly.root.scale.z *= 1 + 0.015 * chest;
  out.sink = Math.max(out.sink, strength);
  out.closed = strength > 0.5;
}

/** Das blinzelnde Auge hebt seine Braue, sonst verdeckte sie es. */
const PEEKING: Expression = { brows: { lift: 0, tilt: 0, raise: 0.05 } };

/** Ein Auge geht im Schlaf kurz auf, halb, dann wieder zu, die Braue darüber hebt sich. */
function peek({ jelly, strength, face, out }: Move) {
  express(jelly, PEEKING, strength, face);
  out.sink = Math.max(out.sink, strength);
  out.peek = strength;
  out.closed = strength > 0;
}

/** Kichert in sich hinein: die Schultern hüpfen, die Hände am Bauch. */
function chuckle({ jelly, strength, t, moving, face }: Move) {
  const bob = moving ? Math.abs(Math.sin(t * 9)) : 0.5;
  const pose: HandPose = {
    at: [1.1, 0.1 + 0.03 * bob, 0.45],
    turn: [0, 0, -0.9],
    curl: [0.3, 0.3, 0.2],
  };
  poseHands(jelly, () => pose, strength);
  jelly.root.position.y += 0.04 * bob * strength;
  jelly.root.scale.y *= 1 - 0.03 * bob * strength;
  express(jelly, EXPRESSIONS.joy, strength, face);
}

/** Schnaubt mit geballten Fäusten und plustert sich auf. */
function huff({ jelly, strength, t, moving, face }: Move) {
  const tremble = Math.sin(t * 40) * 0.01 * moving;
  poseHands(
    jelly,
    () => ({ at: [1.2 + tremble, 0.5, 0.4], turn: [0, 0, -0.25], curl: [1, 1, 1] }),
    strength,
  );
  jelly.root.scale.x *= 1 + 0.04 * strength;
  jelly.root.scale.z *= 1 + 0.04 * strength;
  jelly.head.rotation.z += Math.sin(t * 30) * 0.02 * moving * strength;
  express(jelly, HUFFING, strength, face);
}

/** Jede seiner Gesten hat genau eine Darstellung. */
const GESTURES: Record<WizardGestureKey, (move: Move) => void> = {
  hail,
  rejoice,
  shrug,
  offer,
  tip,
  cast,
  count,
  stroke,
  nod,
  yawn,
  startle,
  snore,
  peek,
  chuckle,
  huff,
  guard,
  unhat,
  rehat,
  yank,
};

/** Wie schnell eine Geste einsetzt, wenn nicht in 0,3 s. Ein Schreck kommt sofort. */
const FADE_IN: Partial<Record<WizardGestureKey, number>> = {
  startle: 0.06,
  peek: 0.15,
  guard: 0.08,
  unhat: 0.06,
  yank: 0.08,
};

/** Bei reduzierter Bewegung steht jede Geste in dem Moment, der sie zeigt, in Sekunden. */
const SHOWN_AT: Partial<Record<WizardGestureKey, number>> = { tip: 0.9, yawn: 1.1, offer: 0.6 };

/** Was eine Geste ohne eigenes Zutun bewirkt: nichts. */
function restOut(): GestureOut {
  return {
    hatLift: 0,
    hatTilt: 0,
    beardPull: 0,
    orbLift: 0,
    orbGlow: 0,
    lean: 0,
    sink: 0,
    peek: 0,
    closed: false,
  };
}

/** Spielt eine Geste, wenn sie gerade läuft. */
function moveGesture(jelly: Jelly, frame: WizardFrame, face: FaceContext, out: GestureOut) {
  const gesture = frame.gesture;
  if (!gesture || !isWizardGestureKey(gesture.key)) return;
  const { key, elapsed, seconds, releaseAt } = gesture;
  const calm = face.reducedMotion;
  const strength = gestureStrength(elapsed, seconds, calm, FADE_IN[key]);
  if (strength === 0) return;
  const t = calm ? (SHOWN_AT[key] ?? 0) : elapsed;
  const breath = frame.asleepFor ?? elapsed;
  const moving = calm ? 0 : 1;
  GESTURES[key]({ jelly, strength, elapsed, seconds, releaseAt, t, moving, breath, face, out });
}

/** Der Kopf sinkt im Schlaf und neigt sich, der Hut rutscht schief. */
function sleepPose(jelly: Jelly, sink: number, out: GestureOut) {
  jelly.head.position.y -= 0.12 * sink;
  jelly.head.rotation.z += 0.16 * sink;
  out.hatTilt += 0.1 * sink;
}

/**
 * Legt seine Geste, Stimmung und Lider über die frisch berechnete Grundpose: nach `animateJelly`,
 * jedes Bild. Was das Paket sonst nicht zurücksetzt (Tiefe und Vorbeugen der Wurzel), setzt es
 * selbst zurück, so sammelt sich nichts an. Liefert, was der Shop an Hut, Bart und Kugel bewegt.
 *
 * @param reducedMotion - Ruhige, stehende Posen ohne Schwingen und Blinzeln.
 */
export function animateWizard(
  jelly: Jelly,
  frame: WizardFrame,
  reducedMotion: boolean,
): WizardExtras {
  jelly.root.position.z = 0;
  jelly.root.rotation.x = 0;
  const { face } = jelly;
  const mouthFree = !frame.speaking && face.mouth.geometry === face.smile;
  const ctx: FaceContext = { mouthFree, time: frame.time, reducedMotion };
  const out = restOut();
  moveGesture(jelly, frame, ctx, out);
  const lid = applyMood(jelly, frame.mood, ctx);
  const asleep = frame.mood === "asleep";
  shapeEyes(jelly, { lid, closed: out.closed || asleep, peek: out.peek });
  sleepPose(jelly, Math.max(out.sink, sleepDepth(frame.mood, frame.asleepFor, reducedMotion)), out);
  jelly.root.rotation.x += out.lean;
  const { hatLift, hatTilt, beardPull, orbLift, orbGlow, lean } = out;
  const away = hatAway(frame.hat, reducedMotion);
  return { hatLift, hatTilt, hatAway: away, beardPull, orbLift, orbGlow, lean };
}

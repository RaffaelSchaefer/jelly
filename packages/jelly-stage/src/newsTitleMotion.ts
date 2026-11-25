/**
 * How the 3D opening title of the Jelly-News moves: the globe flies in from far away spinning fast
 * and slows down, the orbit rings swing open around it, the two plates of the logo come round the
 * globe from behind and lock into place with a little overshoot, sparkles pop up, a glint runs over
 * the logo, and as the band of the logo sweeps out the camera pushes in while the plates fly apart.
 * With less motion the title stands still as it lands.
 *
 * Every pose is a pure function of the progress through the opening title and its length, both
 * read from the report on air and the server time: all screens show the same frame, also one that
 * joins in the middle. Without three, so it can be tested by itself.
 *
 * @module
 */

import { measureSweeps } from "./newsBarTiming.ts";
import { placePlates, TITLE_LAYOUT, type TitlePoint, type TitleTurn } from "./newsTitleLayout.ts";

/** Where a part stands, how it is turned and how large it is, 1 for its landed size. */
export interface PartPose {
  at: TitlePoint;
  turn: TitleTurn;
  scale: number;
}

/** The whole title in one frame. */
export interface TitlePose {
  /** The globe: `turn` leans its axis, `spin` turns it around that axis. */
  globe: PartPose & { spin: number };
  /** The orbit rings, around the middle of the globe. `streak` is where their light runs, 0 to 1. */
  rings: (PartPose & { streak: number })[];
  /** JELLY and NEWS, each with its letters. */
  plates: PartPose[];
  /** How large each sparkle is, as a share of its size in the layout. */
  sparkles: number[];
  /** Where the glint runs across the logo, in units of the title along its slant, null for none. */
  glint: number | null;
  /** How far the camera stands, as a share of the distance the title is fitted at. */
  dolly: number;
  /** The light behind the globe: its strength from 0 to 1 and the turn of its rays in radians. */
  halo: { strength: number; turn: number };
  /** How far the line under the logo is in, from 0 to 1. */
  tagline: number;
}

/**
 * The globe comes from this far behind its place and turns this often before it slows down. It
 * keeps turning by `drift` radians while the title stands, ending on the side it faces.
 */
const FLIGHT = { depth: 60, rise: 1.1, turns: 1.4, drift: 0.5 };
/** As it lands it swells this much and falls back, like it hit something. */
const THUMP = 0.07;
/**
 * The plates come round the globe from this far behind it, in radians from the front, from a
 * little higher and rolled. As they lock they come this much toward the camera and go back.
 */
const ORBIT = { from: 1.3 * Math.PI, rise: 1, roll: 0.35, thud: 0.22 };
/** How far the plates swing past their place before they lock, as with `easeOutBack`. */
const OVERSHOOT = 1.7;
/**
 * While the band of the logo leaves: how far the camera pushes in, how far the plates fly apart
 * and toward it, how far they turn like doors and how far the globe spins on. It all starts `lead`
 * of the sweep of the band before the band does, and the camera winds up with a small pull back.
 */
const LEAVE = { dolly: 0.55, apart: 2.2, forward: 1.6, turn: 0.75, spin: 2.2, lead: 0.4 };
/** How far the camera winds up before the push: the push dips to `-WIND_UP² / (4 + 4 WIND_UP)`. */
const WIND_UP = 0.35;
/** The glint runs between these places along its slant, past both ends of the logo. */
const GLINT = { from: -2.6, to: 2.6 };
/** The rays behind the globe turn this far while the title stands, in radians. */
const RAY_TURN = 0.9;
/**
 * When each part moves, as shares of the time from the band of the logo coming in until the title
 * stands complete: the globe flies and slows, rings swing open one after the other, JELLY comes
 * first, NEWS follows, sparkles pop up one by one, and the glint runs once everything has landed.
 */
const CUES = {
  flight: [0, 0.5],
  spin: [0, 0.8],
  thump: [0.4, 0.6],
  rings: [0.18, 0.55],
  ringStep: 0.08,
  plates: [0.22, 0.62],
  plateStep: 0.1,
  sparkles: [0.46, 0.62],
  sparkleStep: 0.05,
  halo: [0.05, 0.5],
  glint: [0.7, 0.97],
  tagline: [0.62, 0.78],
  /** The line under the logo is gone after this share of the leaving. */
  taglineOut: [0, 0.35],
} as const;
/** A sparkle twinkles by this share of its size, this often while the title stands. */
const TWINKLE = { amount: 0.18, rate: 2.4 };

/** Keeps a share between 0 and 1. */
function clamp(share: number): number {
  return Math.min(1, Math.max(0, share));
}

/** How far `time` is between `start` and `end`, from 0 to 1. */
function between(time: number, [start, end]: readonly [number, number]): number {
  return clamp((time - start) / (end - start));
}

/** Starts fast and settles. */
function easeOut(share: number, power = 3): number {
  return 1 - (1 - clamp(share)) ** power;
}

/** Smooth at both ends. */
function easeInOut(share: number): number {
  const value = clamp(share);
  return value * value * (3 - 2 * value);
}

/** Goes a little past 1 and settles back, like something that locks into place. */
function easeOutBack(share: number): number {
  const value = clamp(share) - 1;
  return 1 + (OVERSHOOT + 1) * value ** 3 + OVERSHOOT * value ** 2;
}

/** Starts slowly and speeds up. */
function easeIn(share: number): number {
  return clamp(share) ** 2;
}

/** Goes a little below 0 first and then speeds up to 1, like a push that winds up. */
function windUp(share: number): number {
  const value = clamp(share);
  return (WIND_UP + 1) * value ** 2 - WIND_UP * value;
}

/**
 * The two clocks of a pose: `stand` runs from when the band of the logo comes until the title
 * stands complete, `leave` from then, shortly before the band leaves, until the band is gone.
 */
interface TitleClock {
  stand: number;
  leave: number;
}

/** Returns when the title stands complete and still, as progress through the opening title. */
export function findLanded(length: number): number {
  const sweeps = measureSweeps(length);
  return sweeps.leave - LEAVE.lead * sweeps.out;
}

/** Reads the clocks of the title from the progress through the opening title. */
function readClock(progress: number, length: number): TitleClock {
  const sweeps = measureSweeps(length);
  // The band of the logo starts to sweep in after the other two.
  const arrive = 2 * sweeps.delay;
  const landed = findLanded(length);
  return {
    stand: between(progress, [arrive, landed]),
    leave: between(progress, [landed, sweeps.leave + sweeps.out]),
  };
}

/** The globe flies in from far away and spins fast, slows down, and spins up again as it leaves. */
function poseGlobe({ stand, leave }: TitleClock): TitlePose["globe"] {
  const { middle, tilt, facing } = TITLE_LAYOUT.globe;
  const flight = 1 - easeOut(between(stand, CUES.flight), 4);
  const turns = FLIGHT.turns * (1 - easeOut(between(stand, CUES.spin)));
  const thump = Math.sin(Math.PI * between(stand, CUES.thump));
  return {
    at: { x: middle.x, y: middle.y + FLIGHT.rise * flight, z: middle.z - FLIGHT.depth * flight },
    turn: tilt,
    scale: 1 + THUMP * thump,
    spin: -facing - 2 * Math.PI * turns + FLIGHT.drift * (stand - 1) + LEAVE.spin * easeIn(leave),
  };
}

/**
 * A ring swings open around the globe `at`, from facing the camera into its tilt, growing with a
 * little overshoot.
 */
function poseRing(clock: TitleClock, index: number, at: TitlePoint): TitlePose["rings"][number] {
  const { tilt } = TITLE_LAYOUT.rings[index] ?? TITLE_LAYOUT.rings[0];
  const step = index * CUES.ringStep;
  const swing = between(clock.stand, [CUES.rings[0] + step, CUES.rings[1] + step]);
  const unturned = 1 - easeOut(swing);
  const side = index % 2 === 0 ? 1 : -1;
  return {
    at,
    turn: {
      x: tilt.x + (Math.PI / 2 - tilt.x) * unturned,
      y: tilt.y,
      z: tilt.z + side * unturned,
    },
    scale: Math.max(0, easeOutBack(swing)),
    // Each light runs round its ring a little more than once, the two half a turn apart.
    streak: (clock.stand * 1.3 + index * 0.5) % 1,
  };
}

/**
 * A plate comes round the globe `globe` from behind on its own side, JELLY on the left and NEWS on
 * the right, faces the camera as it arrives, swings a little past and locks with a thud toward the
 * camera. Only its turn swings past: on its way it stays on its own side, so the plates never cut
 * through each other. While the band of the logo leaves, they fly apart toward the camera like doors.
 */
function posePlate(clock: TitleClock, index: number, globe: TitlePoint): PartPose {
  const rest = placePlates()[index] ?? { x: 0, y: 0, z: 0 };
  const { middle } = TITLE_LAYOUT.globe;
  const side = index === 0 ? -1 : 1;
  const step = index * CUES.plateStep;
  const swing = between(clock.stand, [CUES.plates[0] + step, CUES.plates[1] + step]);
  const around = side * ORBIT.from * (1 - easeOut(swing));
  const turn = side * ORBIT.from * (1 - easeOutBack(swing));
  const thud = ORBIT.thud * Math.sin(Math.PI * between(swing, [0.55, 1]));
  const away = easeIn(clock.leave);
  // Round the globe where it is now: while it still flies, the plates fly with it.
  const orbit = {
    x: globe.x - middle.x + rest.z * Math.sin(around) + rest.x * easeOut(swing),
    z: globe.z - middle.z + rest.z * Math.cos(around) + thud,
  };
  return {
    at: {
      x: orbit.x + side * LEAVE.apart * away,
      y: globe.y - middle.y + rest.y + ORBIT.rise * (1 - easeOut(swing)),
      z: orbit.z + LEAVE.forward * away,
    },
    turn: { x: 0, y: turn + side * LEAVE.turn * away, z: side * ORBIT.roll * (1 - easeOut(swing)) },
    scale: easeOut(between(swing, [0, 0.3])),
  };
}

/** The sparkles pop up one after the other and twinkle. */
function poseSparkles(stand: number): number[] {
  return TITLE_LAYOUT.sparkles.map((_, index) => {
    const step = index * CUES.sparkleStep;
    const pop = Math.max(
      0,
      easeOutBack(between(stand, [CUES.sparkles[0] + step, CUES.sparkles[1] + step])),
    );
    const twinkle =
      1 -
      TWINKLE.amount * (0.5 + 0.5 * Math.sin(2 * Math.PI * (stand * TWINKLE.rate + index * 0.37)));
    return pop * twinkle;
  });
}

/** Returns where the glint runs, null before and after it. */
function findGlint(stand: number): number | null {
  const run = between(stand, CUES.glint);
  if (run <= 0 || run >= 1) return null;
  return GLINT.from + (GLINT.to - GLINT.from) * easeInOut(run);
}

/** Returns how far the line under the logo is in: once the plates have locked, gone as they leave. */
function showTagline({ stand, leave }: TitleClock): number {
  return easeOut(between(stand, CUES.tagline)) * (1 - between(leave, CUES.taglineOut));
}

/** The title as it stands once the logo has landed, for less motion. */
function poseStill(): TitlePose {
  const landed = { stand: 1, leave: 0 };
  const globe = poseGlobe(landed);
  return {
    globe,
    rings: TITLE_LAYOUT.rings.map((_, index) => ({
      ...poseRing(landed, index, globe.at),
      streak: 0.15,
    })),
    plates: [posePlate(landed, 0, globe.at), posePlate(landed, 1, globe.at)],
    sparkles: TITLE_LAYOUT.sparkles.map(() => 1),
    glint: null,
    dolly: 1,
    halo: { strength: 1, turn: 0 },
    tagline: 1,
  };
}

/**
 * Returns the title at `progress` through an opening title `length` milliseconds long. The same
 * moment gives the same pose on every screen.
 */
export function poseTitle(progress: number, length: number, reducedMotion: boolean): TitlePose {
  if (reducedMotion) return poseStill();
  const clock = readClock(progress, length);
  const globe = poseGlobe(clock);
  return {
    globe,
    rings: TITLE_LAYOUT.rings.map((_, index) => poseRing(clock, index, globe.at)),
    plates: [posePlate(clock, 0, globe.at), posePlate(clock, 1, globe.at)],
    sparkles: poseSparkles(clock.stand),
    glint: findGlint(clock.stand),
    dolly: 1 - LEAVE.dolly * windUp(clock.leave),
    halo: {
      strength: easeOut(between(clock.stand, CUES.halo)),
      turn: RAY_TURN * clock.stand + RAY_TURN * clock.leave,
    },
    tagline: showTagline(clock),
  };
}

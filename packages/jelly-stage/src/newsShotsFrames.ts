/**
 * The framings of the news camera: the presenter in the studio, one jelly close up, a group, a tower
 * from its foot to its top and the hall from above. Each turns a point of its move into a pose, from
 * where the jellies stand now, the props of the room and the direction its take chose, so every
 * screen shows the same picture. The studio counts the others where their moves end: jellies that
 * pass in front of the presenter walk through the shot and do not move the camera. Without three.
 *
 * @module
 */

import type { NewsActor, NewsTower } from "./newsCameraCast.ts";
import type { NewsAngle } from "./newsShotsAngles.ts";
import type { FloorPoint, ScenePoint } from "./world.ts";

import {
  aimFrom,
  easeInOut,
  measureSpan,
  standOffInBand,
  toDirection,
  type NewsPose,
} from "./newsCamera.ts";
import { findSightHeight, liftOverCrowd } from "./newsCameraClear.ts";
import {
  CLOSE,
  CORE,
  findRoom,
  GROUP,
  OVER,
  PUSH,
  STUDIO,
  TOWER,
  viewGroup,
  type Framing,
  type NewsFrameScene,
  type StudioFraming,
} from "./newsShotsLooks.ts";

/** Without a presenter the studio shot shows the middle of the stage, at most this wide. */
const STAGE_LOOK = { fov: 28, aim: 1.7, eye: 3, base: 0.5, widest: 12, down: 0.4 };
/** The hall from above: pitch in degrees, distance per length of the crowd, the least distance. */
const HALL = { pitch: 58, fov: 38, reach: 1.9, least: 24, drift: 0.1, follow: 0.4, down: 0.4 };
/**
 * The stage and the front of the hall from high up: at most this wide with this much room, this
 * steep in degrees, turning this far around the stage while it drifts, aimed this high.
 */
const ESTABLISHING = { fov: 32, widest: 24, room: 1.25, pitch: 24, turn: 8, aim: 1.6, down: 0.42 };
/** A sideways travel moves this share of its distance to each side. */
const TRAVEL = 0.14;
/** While a tower tilts up, the camera rises by this share of it. The whole tower gets this room. */
const TOWER_RISE = 0.3;
const TOWER_ROOM = 1.35;
/** A screen farther than this is not over the shoulder, one nearer than this beside is behind it. */
const SCREEN_REACH = { far: 16, beside: 1 };
/** Where a screen beside the presenter should show, and the turns the camera may take for it. */
const SCREEN_ACROSS = 0.45;
const STUDIO_TURNS = [0, 5, 10, 15, 20];
/**
 * The studio looks down on the presenter at most this steeply, in degrees. A crowd right in front
 * of the desk then shows its heads at the bottom instead of shrinking the presenter.
 */
const STUDIO_STEEPEST = 40;
/** Where the studio counts the others: where their moves end. */
const SETTLED = Number.POSITIVE_INFINITY;

/** Where the camera stands in front of a jelly, and which jellies it keeps clear of. */
interface ActorPlace {
  azimuth: number;
  push: number;
  /** The server time the others count at, null for now. */
  at: number | null;
  /** The camera looks down on the jelly at most this steeply, in degrees. */
  steepest: number;
  /** How steeply the camera looks down for the whole take, in degrees, null to find it per frame. */
  pitch: number | null;
}

/** Returns the presenter, if it is in the room. */
function findPresenter(scene: NewsFrameScene): NewsActor | undefined {
  return scene.presenterId === null ? undefined : scene.actors.get(scene.presenterId);
}

/** Returns the angle at `from` between the way to `first` and the way to `second`, right positive. */
function measureApart(from: FloorPoint, first: FloorPoint, second: FloorPoint): number {
  const toFirst = Math.atan2(first.x - from.x, -(first.z - from.z));
  const toSecond = Math.atan2(second.x - from.x, -(second.z - from.z));
  return toSecond - toFirst;
}

/**
 * Returns the turn of the studio camera in degrees that shows the nearest screen right of the
 * presenter over its shoulder, 0 without one. Measured where the presenter will stand.
 */
function findScreenTurn(scene: NewsFrameScene, presenter: NewsActor, distance: number): number {
  const { goal } = presenter;
  const reach = (screen: ScenePoint) => Math.hypot(screen.x - goal.x, screen.z - goal.z);
  const screen = scene.set.screens
    .filter((candidate) => candidate.z < goal.z && candidate.x - goal.x > SCREEN_REACH.beside)
    .filter((candidate) => reach(candidate) < SCREEN_REACH.far)
    .sort((first, second) => reach(first) - reach(second))[0];
  if (!screen) return 0;
  const span = scene.view.aspect * measureSpan(STUDIO.medium.fov);
  const wanted = Math.atan(SCREEN_ACROSS * span) - Math.atan(STUDIO.medium.across * span);
  const miss = (turn: number) => {
    const direction = toDirection(turn);
    const camera = { x: goal.x + direction.x * distance, z: goal.z + direction.z * distance };
    return Math.abs(measureApart(camera, goal, screen) - wanted);
  };
  return STUDIO_TURNS.reduce((best, turn) => (miss(turn) < miss(best) ? turn : best));
}

/** Puts the camera in front of one jelly from `azimuth` degrees, over everything in the way. */
function frameActor(
  scene: NewsFrameScene,
  actor: NewsActor,
  framing: Framing,
  place: ActorPlace,
): NewsPose {
  const { height, floor } = actor;
  const shown = framing.frame * height * (1 - PUSH * place.push);
  const distance = standOffInBand(shown, framing.fov, scene.view);
  const direction = toDirection(place.azimuth);
  const room = findRoom(scene, [actor.id], place.at);
  const sight = {
    from: actor.now,
    base: floor + framing.base * height,
    over: floor + OVER * height,
    direction,
    distance,
    half: actor.half * CORE,
  };
  const aim = { x: actor.now.x, y: floor + framing.aim * height, z: actor.now.z };
  const rise = (degrees: number) => aim.y + distance * Math.tan((degrees * Math.PI) / 180);
  const clear = place.pitch === null ? findSightHeight(sight, room) : rise(place.pitch);
  const position = {
    x: aim.x + direction.x * distance,
    y: Math.min(rise(place.steepest), Math.max(floor + framing.eye * height, clear)),
    z: aim.z + direction.z * distance,
  };
  return aimFrom(liftOverCrowd(position, room), aim, framing, scene.view);
}

/** Returns the floor the hall shot has to show: every jelly where it will stand and the stage. */
function listHallPoints(scene: NewsFrameScene): FloorPoint[] {
  const goals = [...scene.actors.values()].map((actor) => actor.goal);
  const { stage } = scene.set;
  if (!stage) return goals;
  // Its back edge too, where the screens stand.
  const back = 2 * stage.middle.z - stage.front;
  return [...goals, { x: stage.middle.x, z: back }, { x: stage.middle.x, z: stage.front }];
}

/** Returns how far some values reach and their middle, 0 for none. */
function measureSpread(values: number[]): { spread: number; middle: number } {
  if (values.length === 0) return { spread: 0, middle: 0 };
  const [low, high] = [Math.min(...values), Math.max(...values)];
  return { spread: high - low, middle: (low + high) / 2 };
}

/** The hall from above with the crowd and the stage, drifting sideways from `drift` -1 to 1. */
export function frameHall(scene: NewsFrameScene, drift: number): NewsPose {
  const points = listHallPoints(scene);
  const across = measureSpread(points.map((point) => point.x));
  const along = measureSpread(points.map((point) => point.z));
  const middle = { x: across.middle, z: along.middle };
  const wide = (HALL.reach * across.spread) / scene.view.aspect;
  const distance = Math.max(HALL.least, HALL.reach * along.spread, wide);
  const pitch = (HALL.pitch * Math.PI) / 180;
  const slide = drift * HALL.drift * distance;
  const position = {
    x: middle.x + slide,
    y: Math.sin(pitch) * distance,
    z: middle.z + Math.cos(pitch) * distance,
  };
  const aim = { x: middle.x + slide * HALL.follow, y: 0, z: middle.z };
  return aimFrom(position, aim, { fov: HALL.fov, across: 0, down: HALL.down }, scene.view);
}

/**
 * The stage with its screens and the front of the hall from high up, while the presenter is still
 * on its way and the screens already show the broadcast. It turns a little around the stage from
 * `drift` -1 to 1. Without a stage it shows the hall from above.
 */
export function frameEstablishing(scene: NewsFrameScene, drift: number): NewsPose {
  const { stage } = scene.set;
  if (!stage) return frameHall(scene, drift);
  const width = Math.min(stage.width, ESTABLISHING.widest) * ESTABLISHING.room;
  const distance = width / (2 * measureSpan(ESTABLISHING.fov) * scene.view.aspect);
  const aim = { x: stage.middle.x, y: stage.floor + ESTABLISHING.aim, z: stage.middle.z };
  const direction = toDirection(drift * ESTABLISHING.turn);
  const pitch = (ESTABLISHING.pitch * Math.PI) / 180;
  const position = {
    x: aim.x + direction.x * distance * Math.cos(pitch),
    y: aim.y + distance * Math.sin(pitch),
    z: aim.z + direction.z * distance * Math.cos(pitch),
  };
  const look = { fov: ESTABLISHING.fov, across: 0, down: ESTABLISHING.down };
  return aimFrom(liftOverCrowd(position, findRoom(scene, [], null)), aim, look, scene.view);
}

/** The stage without a presenter: its middle with the screens, or the hall without a stage. */
function frameStage(scene: NewsFrameScene, push: number): NewsPose {
  const { stage } = scene.set;
  if (!stage) return frameHall(scene, 0);
  const width = Math.min(stage.width, STAGE_LOOK.widest) * (1 - PUSH * push);
  const distance = width / (2 * measureSpan(STAGE_LOOK.fov) * scene.view.aspect);
  const from = { x: stage.middle.x, z: stage.middle.z };
  const base = stage.floor + STAGE_LOOK.base;
  const sight = { from, base, over: base, direction: toDirection(0), distance, half: width / 2 };
  const room = findRoom(scene, [], null);
  const aim = { x: from.x, y: stage.floor + STAGE_LOOK.aim, z: from.z };
  const height = Math.max(stage.floor + STAGE_LOOK.eye, findSightHeight(sight, room));
  const position = { x: from.x, y: height, z: from.z + distance };
  const look = { fov: STAGE_LOOK.fov, across: 0, down: STAGE_LOOK.down };
  return aimFrom(liftOverCrowd(position, room), aim, look, scene.view);
}

/**
 * The presenter in the studio, pushed in by `push` from 0 to 1. It stands left of the middle, and
 * the medium shot turns a little so the nearest screen right of it shows over its shoulder. The
 * camera keeps clear of the others where their moves end, so it holds still while they pass.
 */
export function frameStudio(scene: NewsFrameScene, framing: StudioFraming, push: number): NewsPose {
  const presenter = findPresenter(scene);
  if (!presenter) return frameStage(scene, push);
  const look = STUDIO[framing];
  const distance = standOffInBand(look.frame * presenter.height, look.fov, scene.view);
  const azimuth = framing === "medium" ? findScreenTurn(scene, presenter, distance) : 0;
  const place = { azimuth, push, at: SETTLED, steepest: STUDIO_STEEPEST, pitch: null };
  return frameActor(scene, presenter, look, place);
}

/**
 * One jelly close up from the direction its take chose, pushed in by `push` from 0 to 1. The camera
 * keeps the height the take needs at worst, so it holds still while the jelly walks past a prop.
 */
export function frameSubject(
  scene: NewsFrameScene,
  subject: NewsActor,
  angle: NewsAngle,
  push: number,
): NewsPose {
  const place = { azimuth: angle.azimuth, push, at: SETTLED, steepest: 90, pitch: angle.pitch };
  return frameActor(scene, subject, CLOSE, place);
}

/** Some jellies together from `azimuth` degrees, travelling sideways from `travel` -1 to 1. */
export function frameGroup(
  scene: NewsFrameScene,
  subjects: NewsActor[],
  azimuth: number,
  travel: number,
): NewsPose {
  const direction = toDirection(azimuth);
  const across = { x: direction.z, z: -direction.x };
  const spots = subjects.map((subject) => subject.now);
  const { middle, spread, height, floor, distance } = viewGroup(scene, subjects, spots, direction);
  const ids = subjects.map((subject) => subject.id);
  const room = findRoom(scene, ids, null);
  const base = floor + GROUP.base * height;
  const over = floor + OVER * height;
  const sight = { from: middle, base, over, direction, distance, half: spread };
  const slide = travel * TRAVEL * distance;
  const position = {
    x: middle.x + direction.x * distance + across.x * slide,
    y: Math.max(floor + GROUP.eye * height, findSightHeight(sight, room)),
    z: middle.z + direction.z * distance + across.z * slide,
  };
  const aim = { x: middle.x, y: floor + GROUP.aim * height, z: middle.z };
  return aimFrom(liftOverCrowd(position, room), aim, GROUP, scene.view);
}

/**
 * A standing tower from `azimuth` degrees: the camera tilts from its foot at `tilt` 0 up to its top
 * at 1 and rises a little meanwhile. Null shows the whole tower at once.
 */
export function frameTower(
  scene: NewsFrameScene,
  tower: NewsTower,
  azimuth: number,
  tilt: number | null,
): NewsPose {
  const members = tower.memberIds.flatMap((id) => scene.actors.get(id) ?? []);
  const height = Math.max(0, ...members.map((member) => member.height));
  const half = Math.max(0, ...members.map((member) => member.half * CORE));
  const top = (tower.memberIds.length - 1) * tower.step;
  const frame = tilt === null ? TOWER_ROOM * (top + height) : TOWER.frame * height;
  const distance = standOffInBand(frame, TOWER.fov, scene.view);
  const direction = toDirection(azimuth);
  const room = findRoom(scene, tower.memberIds, null);
  const base = tower.floor + TOWER.base * height;
  const over = tower.floor + OVER * height;
  const sight = { from: tower.foot, base, over, direction, distance, half };
  const up = tilt === null ? 0.5 : easeInOut(tilt);
  const aimHeight = tilt === null ? (top + height) / 2 : TOWER.aim * height + top * up;
  const position = {
    x: tower.foot.x + direction.x * distance,
    y:
      Math.max(tower.floor + TOWER.eye * height, findSightHeight(sight, room)) +
      top * TOWER_RISE * up,
    z: tower.foot.z + direction.z * distance,
  };
  const aim = { x: tower.foot.x, y: tower.floor + aimHeight, z: tower.foot.z };
  return aimFrom(liftOverCrowd(position, room), aim, TOWER, scene.view);
}

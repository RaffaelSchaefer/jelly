import assert from "node:assert/strict";
import { test } from "node:test";

import type { NewsActor } from "./newsCameraCast.ts";
import type { NewsFrameScene } from "./newsShotsLooks.ts";
import type { ScenePoint } from "./world.ts";

import { bendToLens, LENS_RANGE } from "./lens.ts";
import { layoutNewsBar } from "./newsBarLayout.ts";
import { projectNews } from "./newsCamera.ts";
import { DESK } from "./newsSetPlan.ts";
import { frameStudio } from "./newsShotsFrames.ts";

/** The presenter grows like the winner of a ceremony, and its desk with it. */
const GROWN = 1.8;
const HEIGHT = 2.33;
const FLOOR = 0.35;
const SPOT = { x: 0, z: -28.9 };
/** Arms up and bouncing, a cheering presenter reaches this share of its height over its floor. */
const CHEER_REACH = 1.19;
/**
 * The hands of `cheer` in `emoteAnimation.ts` of the scene, in units of the jelly before it grows:
 * beside and above the middle of the body, which is 1.05 over the feet, plus the radius of a hand,
 * at the top of the bounce.
 */
const CHEER_HANDS = { side: 0.85 + 0.2, up: 1.05 + 1 + 0.2 + 0.35, forward: 0.3 };
/** The lead of a report ends this far into its push-in, the closest the studio shot gets. */
const END_OF_LEAD = 0.3;
const SCREENS = [
  { width: 1920, height: 1080, insets: { top: 0, bottom: 0 } },
  { width: 720, height: 600, insets: { top: 0, bottom: 0 } },
  { width: 520, height: 460, insets: { top: 44, bottom: 70 } },
];

function actor(
  id: number,
  spot: { x: number; z: number },
  floor: number,
  scale: number,
): NewsActor {
  return {
    id,
    now: spot,
    goal: spot,
    walk: () => spot,
    arrival: Number.NEGATIVE_INFINITY,
    floor,
    height: HEIGHT * scale,
    half: 0.85 * scale,
    reach: 1.65 * scale,
  };
}

/** The studio of the news, with or without the spectators standing right in front of the stage. */
function createScene(screen: (typeof SCREENS)[number], withCrowd: boolean): NewsFrameScene {
  const actors = [actor(1, SPOT, FLOOR, GROWN)];
  for (let index = 0; withCrowd && index < 16; index++) {
    actors.push(actor(10 + index, { x: -9 + index * 1.2, z: -25.5 + (index % 2) * 1.1 }, 0, 1));
  }
  const { top, bottom } = screen.insets;
  return {
    actors: new Map(actors.map((entry) => [entry.id, entry])),
    towers: [],
    blocks: [],
    set: {
      stage: { middle: { x: 0, z: -30.6 }, front: -27.2, width: 30, floor: FLOOR },
      screens: [],
    },
    presenterId: 1,
    home: { position: { x: 0, y: 80, z: 70 }, target: { x: 0, y: 0, z: 0 }, fov: 30, lift: 0 },
    view: {
      aspect: screen.width / screen.height,
      top: top / screen.height,
      bottom: (screen.height - bottom) / screen.height,
    },
  };
}

/** Returns where a point shows through the lens, as shares of the width and the height. */
function locate(scene: NewsFrameScene, screen: (typeof SCREENS)[number], point: ScenePoint) {
  const pose = frameStudio(scene, "close", END_OF_LEAD);
  const seen = projectNews(pose, point, scene.view.aspect);
  const flat = { x: ((seen.x + 1) / 2) * screen.width, y: ((1 - seen.y) / 2) * screen.height };
  const bent = bendToLens(flat, screen, LENS_RANGE.usual);
  return { x: bent.x / screen.width, y: bent.y / screen.height };
}

test("the close studio shot keeps a cheering presenter in the free picture, the desk under the headline", () => {
  const reach = { ...SPOT, y: FLOOR + CHEER_REACH * HEIGHT * GROWN };
  // The front edge of the desk top, grown with the presenter like the view grows it.
  const desk = {
    x: SPOT.x,
    y: FLOOR + (DESK.top.bottom + DESK.top.height) * GROWN,
    z: SPOT.z + (DESK.center + DESK.top.outer) * GROWN,
  };
  for (const screen of SCREENS) {
    const headline = layoutNewsBar(screen, screen.insets)!.headline.y / screen.height;
    for (const withCrowd of [false, true]) {
      const scene = createScene(screen, withCrowd);
      const label = `${screen.width}x${screen.height} crowd ${withCrowd}`;
      assert.ok(locate(scene, screen, reach).y > scene.view.top + 0.02, `${label}: head cut off`);
      for (const side of [-1, 1]) {
        const hand = locate(scene, screen, {
          x: SPOT.x + side * CHEER_HANDS.side * GROWN,
          y: FLOOR + CHEER_HANDS.up * GROWN,
          z: SPOT.z + CHEER_HANDS.forward * GROWN,
        });
        assert.ok(hand.y > scene.view.top + 0.01, `${label}: hand ${side} cut off at the top`);
        assert.ok(hand.x > 0.01 && hand.x < 0.99, `${label}: hand ${side} cut off at the side`);
      }
      assert.ok(locate(scene, screen, desk).y > headline, `${label}: desk over the headline`);
    }
  }
});

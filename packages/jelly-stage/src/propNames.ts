/**
 * The models a zone can show, by the names the server uses in `prop`. The list mirrors `ListProps`
 * in `apps/server/internal/rules/maps.go`, a test keeps the two together. Whole sets stand next to
 * their parts, so a map can use one large model or place many small ones.
 *
 * @module
 */

/** The stage and what stands on it. */
export const STAGE_PROPS = [
  "stage-set",
  "stage-platform",
  "screen",
  "speaker",
  "pedestal",
  "trophy",
  "par-light",
  "sockets",
  "desk",
  "cable",
] as const;

/** The lounge and what stands in it. */
export const LOUNGE_PROPS = [
  "lounge-set",
  "rug",
  "sign-wall",
  "lava-lamp",
  "beanbag",
  "couch",
  "snake-plant",
  "bush",
  "cactus",
  "string-lights",
] as const;

/** The snack bar and what stands on it. */
export const SNACK_PROPS = [
  "snack-bar-set",
  "counter",
  "marquee",
  "fridge",
  "slush-machine",
  "popcorn-machine",
  "pizza-stack",
  "donut-stand",
  "cups",
] as const;

/** Every model the stage can draw. */
export const PROP_NAMES = [...STAGE_PROPS, ...LOUNGE_PROPS, ...SNACK_PROPS] as const;

/** A model the stage can draw. */
export type PropName = (typeof PROP_NAMES)[number];

/** Props with a raised floor: jellies and lights on them stand higher. */
const PLATFORM_PROPS: ReadonlySet<string> = new Set(["stage-platform", "stage-set"]);

/** Reports whether a prop raises the floor of its zone. */
export function isPlatformProp(prop: string): boolean {
  return PLATFORM_PROPS.has(prop);
}

/**
 * The 3D stage for the server page and the app: the room with all jellies on a canvas. Each of them
 * brings its own {@link StageSource}, the stage itself never talks to a network.
 *
 * @module
 */

export { LENS_RANGE, type ScreenPoint } from "./lens.ts";
export { ANIMATION_EVENTS, STATE_EVENTS, type StageSource, type StreamListener } from "./source.ts";
export type {
  AreaKind,
  CatalogEntry,
  EventPayload,
  StageArea,
  StageCatalog,
  StageEvent,
  StagePlayer,
  StageState,
} from "./types.ts";
export { createStageView, type StageMarks, type StageView, type StageViewOptions } from "./view.ts";

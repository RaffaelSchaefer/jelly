/**
 * The 3D stage for the server page and the app: the room with all jellies on a canvas. Each of them
 * brings its own {@link StageSource}, the stage itself never talks to a network.
 *
 * @module
 */

export type { FrameLimit } from "./framePacing.ts";
export { LENS_RANGE, type ScreenPoint } from "./lens.ts";
export type { StageHighlight } from "./moves.ts";
export { ANIMATION_EVENTS, STATE_EVENTS, type StageSource, type StreamListener } from "./source.ts";
export type {
  AreaKind,
  CatalogEntry,
  EquippedCosmetic,
  EventPayload,
  MovePoint,
  StageArea,
  StageCatalog,
  StageEvent,
  StageFollow,
  StageGathering,
  StageMove,
  StagePlayer,
  StagePoint,
  StageRoom,
  StageStack,
  StageState,
  StageTrip,
} from "./types.ts";
export type { CameraReading } from "./cameraControls.ts";
export type { JellyOnScreen, StageMarks } from "./overlay.ts";
export type { StageInsets } from "./insets.ts";
export { createStageView, type StageView, type StageViewOptions } from "./view.ts";

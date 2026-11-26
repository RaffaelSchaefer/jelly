/**
 * What a stage view is made of: its options and everything it keeps between two frames.
 *
 * @module
 */

import type { StageEffect } from "./effects.ts";
import type { EdgeHint } from "./edgeHints.ts";
import type { FrameLimit } from "./framePacing.ts";
import type { JellyCast } from "./jellies.ts";
import type { LabelAnchor } from "./labels.ts";
import type { ScreenPoint } from "./lens.ts";
import type { NewsCameraMode } from "./newsCameraRig.ts";
import type { StageScene, StageScreen } from "./scene.ts";
import type { StageSource } from "./source.ts";
import type { StageCatalog, StageMove, StageState } from "./types.ts";

import { createViewCamera, type ViewCamera } from "./cameraControls.ts";
import { createHall, type Hall } from "./hall.ts";
import { NO_INSETS, type StageInsets } from "./insets.ts";
import { createJellyCast } from "./jellies.ts";
import { LENS_RANGE } from "./lens.ts";
import { createLensPass, type LensPass } from "./lensPass.ts";
import { createNewsDirector, type NewsDirector } from "./newsDirector.ts";
import { createNewsSet, type NewsSet } from "./newsSet.ts";
import { createNewsTitle, type NewsTitle } from "./newsTitle.ts";
import { NOTHING_HOVERED, type Hovered, type StageMarks } from "./overlay.ts";
import { createRoomMarks, type RoomMarks } from "./roomMarks.ts";
import { createStageScene } from "./scene.ts";

/** What a view is shown on, where its data comes from and how it looks. */
export interface StageViewOptions {
  canvas: HTMLCanvasElement;
  source: StageSource;
  /** After every read of the state. */
  onState?: (state: StageState) => void;
  /** After a read of the state failed. */
  onError?: (error: unknown) => void;
  /** When the event stream opens or breaks. */
  onConnectionChange?: (isOpen: boolean) => void;
  /** Strength of the fisheye, see {@link LENS_RANGE}. */
  lensStrength?: number;
  /** Detail of the 3D picture relative to the canvas. */
  renderScale?: number;
  /** Canvas pixels per screen pixel. 1 costs far less, 2 also smooths the raymarched jellies. */
  supersampling?: number;
  /** How long events gather before the state is read again. */
  reloadDelayMs?: number;
  /** Frames per second, null for every screen refresh. Without a value it stays at 30. */
  frameLimit?: FrameLimit;
  /** Bands the page covers with its own buttons. The room fits between them. */
  insets?: StageInsets;
  /** After every frame, for things the page keeps next to a jelly. */
  onFrame?: () => void;
  /**
   * Whether the news camera films a show of the Jelly-News by itself (`auto`, the default, for a
   * view nobody steers) or only after `watchNews(true)` (`manual`, for the map). A hand on the
   * camera ends it in both.
   */
  newsCamera?: NewsCameraMode;
  /**
   * Whether a show of the Jelly-News opens with the 3D title, the default. Without it the logo of
   * the opening title stands in, as it does while the model loads.
   */
  newsTitle3d?: boolean;
}

/** What changes while the view runs. */
export interface StageMemory {
  options: StageViewOptions;
  state: StageState | null;
  catalog: StageCatalog | null;
  /**
   * The newest move of each jelly, by player ID, as the server sent it. The stage plays them as
   * `readMoves` of `viewData.ts` returns them.
   */
  moves: Map<number, StageMove>;
  clockOffset: number;
  signLabels: Map<string, string>;
  effects: StageEffect[];
  /** The Jelly-News, while a gathering of that kind runs. */
  news: NewsDirector;
  /** Their studio: the desk in front of the presenter and the broadcast on the screens. */
  newsSet: NewsSet;
  /** Their 3D opening title, painted over everything while a show opens. */
  newsTitle: NewsTitle;
  reloadPending: boolean;
  /** A read is running, so a further one has to wait for it. */
  reloading: boolean;
  /** Something changed during the running read, which may not have seen it. */
  reloadAgain: boolean;
  streamOpened: boolean;
  /** The screen as last fitted, null before the first frame. */
  screen: StageScreen | null;
  stage: StageScene;
  hall: Hall;
  lens: LensPass;
  cast: JellyCast;
  roomMarks: RoomMarks;
  marks: StageMarks;
  camera: ViewCamera;
  pointer: ScreenPoint | null;
  /** What lay under the pointer in the last frame. */
  hovered: Hovered;
  /** The hints at the edge in the last frame. */
  hints: EdgeHint[];
  /** Where the jellies were in the last frame, from back to front. */
  anchors: LabelAnchor[];
  /** The jellies that light up in this frame. */
  highlighted: Set<number>;
  reducedMotion: boolean;
}

/** Creates everything a view needs and puts the empty room into the scene. */
export function createMemory(options: StageViewOptions): StageMemory {
  const stage = createStageScene();
  const cast = createJellyCast();
  const hall = createHall(stage.scene);
  const lens = createLensPass(options.lensStrength ?? LENS_RANGE.usual);
  stage.scene.add(cast.root);
  const roomMarks = createRoomMarks(stage.scene);
  const readInsets = () => options.insets ?? NO_INSETS;
  return {
    options,
    state: null,
    catalog: null,
    moves: new Map(),
    clockOffset: 0,
    signLabels: new Map(),
    effects: [],
    news: createNewsDirector(),
    newsSet: createNewsSet(stage.scene),
    newsTitle: createNewsTitle(stage.renderer, options.newsTitle3d ?? true),
    reloadPending: false,
    reloading: false,
    reloadAgain: false,
    streamOpened: false,
    screen: null,
    stage,
    hall,
    lens,
    cast,
    roomMarks,
    marks: { ownId: null, targetId: null },
    camera: createViewCamera({
      stage,
      hall,
      canvas: options.canvas,
      lens,
      readInsets,
      newsCamera: options.newsCamera ?? "auto",
    }),
    pointer: null,
    hovered: NOTHING_HOVERED,
    hints: [],
    anchors: [],
    highlighted: new Set(),
    reducedMotion: false,
  };
}

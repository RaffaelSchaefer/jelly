/**
 * Decides which screen refreshes become frames. Pure and without three.js, so the stage, the pet and
 * the glass of the map share one rate without loading each other.
 *
 * @module
 */

/** Frames per second. Null draws every refresh the screen offers. */
export type FrameLimit = number | null;

/** Enough for smooth jellies, and the raymarched bodies cost a lot per frame. */
export const DEFAULT_FRAME_LIMIT = 30;

/** A frame may come this much early, because the screen refresh does not match the rate exactly. */
const FRAME_TOLERANCE_MS = 4;

/** Asked once per screen refresh. */
export interface FramePacer {
  /** Reports whether the refresh at `now`, in milliseconds, becomes a frame. */
  isDue: (now: number) => boolean;
  /** Takes over a new rate. The next refresh becomes a frame, so the change shows at once. */
  setLimit: (limit: FrameLimit) => void;
}

/** Creates a pacer. Without a limit it runs at {@link DEFAULT_FRAME_LIMIT}, null means no limit. */
export function createFramePacer(initial: FrameLimit = DEFAULT_FRAME_LIMIT): FramePacer {
  let limit = initial;
  let dueAt = Number.NEGATIVE_INFINITY;
  return {
    isDue: (now) => {
      if (limit === null) {
        return true;
      }
      if (now < dueAt - FRAME_TOLERANCE_MS) {
        return false;
      }
      const interval = 1000 / limit;
      // The next frame counts from the last due time, so 45 FPS on a 60 Hz screen stay 45 instead of
      // falling to 30. After a slow frame it counts from now: Missed frames are not made up for.
      dueAt = dueAt + interval < now ? now + interval : dueAt + interval;
      return true;
    },
    setLimit: (next) => {
      limit = next;
      dueAt = Number.NEGATIVE_INFINITY;
    },
  };
}

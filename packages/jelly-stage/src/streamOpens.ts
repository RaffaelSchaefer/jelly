/**
 * Counts the openings of one stream. The first opening follows the read that started the stream,
 * so it must not read the state again. Every later opening can have missed moves, which the stream
 * does not replay.
 *
 * @module
 */

/** Counts the openings of one stream. */
export interface StreamOpenings {
  /** Notes an opening and reports whether the state has to be read again because of it. */
  record: () => boolean;
}

/** Starts counting the openings of a stream at zero. */
export function createStreamOpenings(): StreamOpenings {
  let openedBefore = false;
  return {
    record: () => {
      const reread = openedBefore;
      openedBefore = true;
      return reread;
    },
  };
}

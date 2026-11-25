/**
 * Fits the free texts of the Jelly-News into their bands. Names, titles and program details come
 * from players and the organizers, so any length can arrive. A text first gets smaller, a headline
 * then takes a second line, and only then is its end cut off with an ellipsis. No line ever comes
 * out wider than its band. Without a canvas: the caller measures, so it can be tested by itself.
 *
 * @module
 */

/**
 * Measures how wide a text is at a font size, in pixels. It takes the size because text does not
 * grow linearly with it: system fonts track small sizes wider.
 */
export type MeasureText = (text: string, size: number) => number;

/** The sizes a text may take, in pixels. */
export interface FontRange {
  largest: number;
  smallest: number;
}

/** A band of one line. */
export interface LineBox extends FontRange {
  width: number;
}

/** The band of a headline: one line in the `single` sizes, or two lines in the `double` ones. */
export interface HeadlineBox {
  width: number;
  single: FontRange;
  double: FontRange;
}

/** A text set into its band. */
export interface FittedText {
  /** Font size in pixels. */
  size: number;
  /** One or two lines, none wider than the band. */
  lines: string[];
}

const ELLIPSIS = "…";
/** Sizes are searched to this precision, in pixels. */
const SIZE_STEP = 0.25;
/** Spaces and punctuation that would hang in front of an ellipsis. */
const LOOSE_END = /[\s,;:.!?/+\-–—]+$/u;
/** A cut moves back to the last space, unless that would throw away more than this share. */
const WORD_CUT_SHARE = 0.6;
const GRAPHEMES = new Intl.Segmenter("de", { granularity: "grapheme" });

/** Collapses runs of white space, so a line break in a title cannot break the band. */
function tidy(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** Splits a text into the characters a reader sees, so an emoji or an accent stays whole. */
function splitGraphemes(text: string): string[] {
  return Array.from(GRAPHEMES.segment(text), (part) => part.segment);
}

/** Returns the largest size of the range at which `fits` holds, null if not even the smallest. */
function findLargest(range: FontRange, fits: (size: number) => boolean): number | null {
  if (fits(range.largest)) return range.largest;
  if (range.smallest >= range.largest || !fits(range.smallest)) return null;
  let low = range.smallest;
  let high = range.largest;
  while (high - low > SIZE_STEP) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/** Returns how many characters from the start still fit, by halving. `fits` grows with the count. */
function countFitting(graphemes: string[], fits: (start: string) => boolean): number {
  let low = 0;
  let high = graphemes.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(graphemes.slice(0, middle).join(""))) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Ends a cut start of a text with an ellipsis. */
function closeCut(start: string): string {
  return `${start.replace(LOOSE_END, "")}${ELLIPSIS}`;
}

/** Moves a cut back to the end of a word, if one ends close enough. It only gets narrower. */
function closeAtWord(start: string): string {
  const space = start.lastIndexOf(" ");
  return closeCut(space > start.length * WORD_CUT_SHARE ? start.slice(0, space) : start);
}

/** Cuts a text with an ellipsis until it fits the width. Empty if not even the ellipsis fits. */
export function cutToFit(text: string, width: number, size: number, measure: MeasureText): string {
  const tidied = tidy(text);
  if (measure(tidied, size) <= width) return tidied;
  const graphemes = splitGraphemes(tidied);
  const count = countFitting(graphemes, (start) => measure(closeCut(start), size) <= width);
  if (count > 0) return closeAtWord(graphemes.slice(0, count).join(""));
  return measure(ELLIPSIS, size) <= width ? ELLIPSIS : "";
}

/** Sets one line: as large as it fits, down to the smallest size, then cut with an ellipsis. */
export function fitLine(text: string, box: LineBox, measure: MeasureText): FittedText {
  const tidied = tidy(text);
  const size = findLargest(box, (candidate) => measure(tidied, candidate) <= box.width);
  if (size !== null) return { size, lines: [tidied] };
  return { size: box.smallest, lines: [cutToFit(tidied, box.width, box.smallest, measure)] };
}

/**
 * Splits a text at the space that makes both lines most even, measured at one size. Null for a
 * single word.
 */
function splitInTwo(text: string, size: number, measure: MeasureText): string[] | null {
  const words = text.split(" ");
  let best: string[] | null = null;
  let bestWidth = Infinity;
  for (let cut = 1; cut < words.length; cut++) {
    const lines = [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
    const widest = Math.max(...lines.map((line) => measure(line, size)));
    // The first line only grows and the second only shrinks, so past the best cut it gets worse.
    if (widest >= bestWidth) break;
    best = lines;
    bestWidth = widest;
  }
  return best;
}

/**
 * Fills the first line with as many words as fit and cuts the rest with an ellipsis. A first word
 * wider than the line breaks where the line ends.
 */
function breakAndCut(text: string, width: number, size: number, measure: MeasureText): string[] {
  const words = text.split(" ");
  let count = 0;
  while (count < words.length && measure(words.slice(0, count + 1).join(" "), size) <= width) {
    count += 1;
  }
  if (count > 0) {
    const rest = words.slice(count).join(" ");
    return [words.slice(0, count).join(" "), cutToFit(rest, width, size, measure)];
  }
  const graphemes = splitGraphemes(text);
  const taken = countFitting(graphemes, (start) => measure(start, size) <= width);
  const rest = graphemes.slice(taken).join("");
  return [graphemes.slice(0, taken).join(""), cutToFit(rest, width, size, measure)];
}

/**
 * Sets a headline: one line as large as it fits down to its smallest size, then two even lines,
 * and only when those do not fit either, two full lines with an ellipsis at the end.
 */
export function fitHeadline(text: string, box: HeadlineBox, measure: MeasureText): FittedText {
  const tidied = tidy(text);
  const single = findLargest(box.single, (size) => measure(tidied, size) <= box.width);
  if (single !== null) return { size: single, lines: [tidied] };
  const lines = splitInTwo(tidied, box.double.largest, measure);
  const fits = (size: number) => lines?.every((line) => measure(line, size) <= box.width) ?? false;
  const double = lines ? findLargest(box.double, fits) : null;
  if (lines && double !== null) return { size: double, lines };
  const { smallest } = box.double;
  return { size: smallest, lines: breakAndCut(tidied, box.width, smallest, measure) };
}

import { describe, expect, it } from "vitest";

import {
  FRAME_RATE,
  frameLimitToStop,
  frameRateText,
  stopToFrameLimit,
  UNLIMITED_STOP,
} from "./frameRate";

describe("Bildrate", () => {
  it("bildet die letzte Reglerstellung auf unbegrenzt ab und zurück", () => {
    expect(stopToFrameLimit(UNLIMITED_STOP)).toBeNull();
    expect(frameLimitToStop(null)).toBe(UNLIMITED_STOP);
  });

  it("lässt jeden erlaubten Wert unverändert", () => {
    for (let limit: number = FRAME_RATE.min; limit <= FRAME_RATE.max; limit++) {
      expect(stopToFrameLimit(frameLimitToStop(limit))).toBe(limit);
    }
  });

  it("nennt den Wert in Worten", () => {
    expect(frameRateText(60)).toBe("60 FPS");
    expect(frameRateText(null)).toBe("Unbegrenzt");
  });
});

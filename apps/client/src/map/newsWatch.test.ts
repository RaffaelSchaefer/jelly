import { describe, expect, it } from "vitest";

import { describeNewsButton } from "./newsWatch";

describe("describeNewsButton", () => {
  it("hides the button while no show is on air", () => {
    expect(describeNewsButton({ onAir: false, watching: false })).toBeNull();
    expect(describeNewsButton({ onAir: false, watching: true })).toBeNull();
  });

  it("offers to watch a show on air", () => {
    expect(describeNewsButton({ onAir: true, watching: false })).toEqual({
      watching: false,
      label: "Sendung ansehen",
      sound: "toggleOn",
    });
  });

  it("leads back to the map while the news camera films", () => {
    expect(describeNewsButton({ onAir: true, watching: true })).toEqual({
      watching: true,
      label: "Zurück zur Karte",
      sound: "toggleOff",
    });
  });
});

/**
 * Hält die Liste der Modelle ohne Three.js gleich mit den Modellen im Bundle.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { COSMETIC_MODELS } from "./cosmetic.ts";
import { COSMETIC_MODEL_KEYS } from "./cosmeticKeys.ts";

describe("COSMETIC_MODEL_KEYS", () => {
  it("nennt genau die Cosmetics mit Modell", () => {
    expect([...COSMETIC_MODEL_KEYS].sort()).toEqual(Object.keys(COSMETIC_MODELS).sort());
  });
});

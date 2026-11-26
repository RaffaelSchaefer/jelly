/**
 * Tests für das Spreizen mit zwei Fingern. Die Schwelle des Ziehens prüft
 * `pet/pointerKinds.test.ts`.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { measurePinch } from "./gesture";

describe("measurePinch", () => {
  it("zoomt mit dem Abstand der Finger um ihre Mitte", () => {
    const step = measurePinch(
      [
        { x: 100, y: 200 },
        { x: 200, y: 200 },
      ],
      [
        { x: 50, y: 200 },
        { x: 250, y: 200 },
      ],
    );
    expect(step.factor).toBeCloseTo(2);
    expect(step.from).toEqual({ x: 150, y: 200 });
    expect(step.to).toEqual({ x: 150, y: 200 });
  });

  it("zieht mit der Mitte, wenn beide Finger gemeinsam wandern", () => {
    const step = measurePinch(
      [
        { x: 100, y: 100 },
        { x: 100, y: 200 },
      ],
      [
        { x: 130, y: 90 },
        { x: 130, y: 190 },
      ],
    );
    expect(step.factor).toBeCloseTo(1);
    expect(step.from).toEqual({ x: 100, y: 150 });
    expect(step.to).toEqual({ x: 130, y: 140 });
  });

  it("verkleinert beim Zusammenführen, auch schräg", () => {
    const step = measurePinch(
      [
        { x: 0, y: 0 },
        { x: 300, y: 400 },
      ],
      [
        { x: 75, y: 100 },
        { x: 225, y: 300 },
      ],
    );
    expect(step.factor).toBeCloseTo(0.5);
    expect(step.to).toEqual({ x: 150, y: 200 });
  });

  it("lässt den Zoom, wenn beide Finger auf einem Punkt liegen", () => {
    const same = { x: 10, y: 10 };
    expect(measurePinch([same, same], [same, { x: 20, y: 10 }]).factor).toBe(1);
    expect(measurePinch([same, { x: 20, y: 10 }], [same, same]).factor).toBe(1);
  });
});

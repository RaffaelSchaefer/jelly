import { describe, expect, it } from 'vitest';
import { levelProgress, PET_SIZE, stageLayout } from './pet';

describe('level progress', () => {
  it('starts at level one with the full next level ahead', () => {
    expect(levelProgress(0)).toEqual({ level: 1, current: 0, remaining: 100 });
  });
  it('carries excess XP across level boundaries', () => {
    expect(levelProgress(99)).toEqual({ level: 1, current: 99, remaining: 1 });
    expect(levelProgress(100)).toEqual({ level: 2, current: 0, remaining: 100 });
    expect(levelProgress(235)).toEqual({ level: 3, current: 35, remaining: 65 });
  });
});

describe('stage layout', () => {
  it('matches the original layout at 100 %', () => {
    expect(stageLayout(100)).toMatchObject({ scale: 1, canvas: { top: 43, width: 396, height: 315 }, feet: 299, bubbleTop: 20, toolsOffset: 0, stage: 330 });
  });
  it('keeps a small pet on the ground and the stage tall enough for the panels', () => {
    const small = stageLayout(PET_SIZE.min);
    expect(small.feet).toBe(299);
    expect(small.stage).toBe(330);
    expect(small.canvas.height).toBeCloseTo(315 * 0.7);
    // The window tools follow the bubble down, keeping their distance to it.
    expect(small.toolsOffset).toBeCloseTo(small.bubbleTop - 20);
    expect(small.toolsOffset).toBeGreaterThan(0);
  });
  it('grows a big pet downwards, keeps the bubble above his head and fits the window', () => {
    const big = stageLayout(PET_SIZE.max);
    expect(big.bubbleTop).toBe(20);
    expect(big.toolsOffset).toBe(0);
    expect(big.feet).toBeCloseTo(43 + 52 + 204 * 1.5);
    // Window padding + tools + stage + dock (gap and height) + bottom padding stays within 620px.
    expect(12 + 30 + big.stage + 8 + 38 + 28).toBeLessThanOrEqual(620);
  });
  it('clamps sizes outside the allowed range', () => {
    expect(stageLayout(10).scale).toBe(0.7);
    expect(stageLayout(500).scale).toBe(1.5);
  });
});

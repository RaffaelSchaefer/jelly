/**
 * Prüft die Zeremonie des Siegels mit ihren Zeitgebern: was sie meldet, wenn die Wahl mitten im
 * Halten verschwindet, und dass ein gehaltener Druck nach dem Kauf nichts ablegt.
 *
 * @module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SealPhase } from "./sealCeremony";
import type { ShopItem } from "./shop";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import { SEAL_TIMING } from "./sealCeremony";
import { createSealMachine, type CeremonyOptions, type SealSubject } from "./sealMachine";
import { shopItems } from "./shop";

/** Eine Ware, die sich das Jelly der Vorschau leisten kann. */
function affordable(): ShopItem {
  const item = shopItems(PREVIEW_CATALOG, PREVIEW_ME).find((each) => each.state === "affordable");
  if (!item) throw new Error("Die Vorschau hat keine bezahlbare Ware");
  return item;
}

/** Eine Zeremonie mit veränderbaren Optionen, die mitschreibt, was sie meldet. */
function setup() {
  const phases: { phase: SealPhase; subject: SealSubject }[] = [];
  const commits: SealSubject[] = [];
  const options: CeremonyOptions = {
    item: affordable(),
    worn: false,
    mode: "hold",
    commit: (subject) => {
      commits.push(subject);
      return Promise.resolve(true);
    },
    onPhase: (phase, subject) => phases.push({ phase, subject }),
    onBlocked: vi.fn(),
  };
  const machine = createSealMachine({ options: () => options, render: vi.fn() });
  return { machine, options, phases, commits };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSealMachine", () => {
  it("meldet die gehaltene Ware auch, wenn die Wahl mitten im Halten verschwindet", () => {
    const { machine, options, phases } = setup();
    const held = options.item;
    machine.press();
    vi.advanceTimersByTime(SEAL_TIMING.lateHoldMs + 50);
    options.item = null;
    machine.send({ type: "reset" });
    expect(phases.map((each) => each.phase)).toEqual(["holding", "idle"]);
    expect(phases.at(-1)?.subject.item).toBe(held);
    vi.advanceTimersByTime(SEAL_TIMING.holdMs);
    expect(phases).toHaveLength(2);
  });

  it("legt die eben gekaufte Ware nicht ab, solange der Druck noch läuft", async () => {
    const { machine, options, phases, commits } = setup();
    machine.press();
    await vi.advanceTimersByTimeAsync(SEAL_TIMING.holdMs + SEAL_TIMING.stampMs);
    expect(phases.at(-1)?.phase).toBe("sealed");
    // Gekauft: Das Siegel legt ab jetzt an und ab, der Druck aber hält noch.
    options.mode = "tap";
    await vi.advanceTimersByTimeAsync(SEAL_TIMING.sealedMs);
    expect(phases.at(-1)?.phase).toBe("idle");
    vi.advanceTimersByTime(2000);
    machine.click();
    machine.click();
    expect(commits).toHaveLength(1);
    expect(phases.map((each) => each.phase)).not.toContain("armed");
    expect(phases.filter((each) => each.phase === "stamping")).toHaveLength(1);
    machine.release();
    expect(phases.at(-1)?.phase).toBe("idle");
  });

  it("tippt nach dem Loslassen wieder, wenn der Klick später kommt", async () => {
    const { machine, options, commits } = setup();
    options.mode = "tap";
    vi.advanceTimersByTime(2000);
    machine.click();
    await vi.advanceTimersByTimeAsync(SEAL_TIMING.tapStampMs);
    expect(commits.map((each) => each.mode)).toEqual(["tap"]);
  });
});

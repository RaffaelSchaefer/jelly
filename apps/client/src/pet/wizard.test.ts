/**
 * Prüft die Momente des Zauberers: Feilschen, Anlegen, die Stupser-Leiter, was er zu Ereignissen
 * vom Server sagt und dass sein Münzenzählen im Takt seiner Hand klimpert.
 *
 * @module
 */

import { countTapTimes, WIZARD_GESTURE_SECONDS } from "@jelly/scene/wizard-timing";
import { describe, expect, it } from "vitest";

import type { ServerEvent } from "./types";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import { shopItems, type ShopItem } from "./shop";
import {
  affordableScript,
  blockedScript,
  equippedScript,
  flushServer,
  FRESH_LADDER,
  lanScript,
  pokeReaction,
  serverReaction,
  type PokeLadder,
  type ServerMerge,
} from "./wizard";
import { WIZARD_LINES } from "./wizardLines";
import { createScriptKit, EMPTY_HISTORY } from "./wizardPick";
import { UNKNOWN_CONTEXT, type ScriptDraft, type WizardContext } from "./wizardScripts";

/** Eine Ware für ein Jelly mit drei Münzen. */
function ware(id: string): ShopItem {
  const found = shopItems(PREVIEW_CATALOG, PREVIEW_ME).find((item) => item.cosmetic.id === id);
  if (!found) throw new Error(`Keine Ware ${id}`);
  return found;
}

/** Das Werkzeug mit einem offenen Laden. */
function kitFor(patch: Partial<WizardContext> = {}) {
  const ctx = { ...UNKNOWN_CONTEXT, name: "Pixel", coins: 3, perLevel: 1, open: true, ...patch };
  return createScriptKit({ seed: 3, lines: EMPTY_HISTORY, ctx });
}

/** Die Sätze eines Skripts. */
function spoken(script: ScriptDraft | null) {
  return script?.cues.flatMap((cue) => (cue.kind === "say" ? [cue.text] : [])) ?? [];
}

/** Ein Ereignis vom Server. */
function event(type: string, payload: Record<string, unknown> = {}): ServerEvent {
  return { id: 1, type, player_id: 1, payload, created_at: 0 };
}

describe("counting coins", () => {
  it("clinks on the taps of his index finger", () => {
    const kit = kitFor();
    const script = flushServer(kit, { coins: 7, at: 0 });
    const clinks = script.cues.flatMap((cue) =>
      cue.kind === "sfx" && cue.sound === "coinClink" ? [cue.at / 1000] : [],
    );
    expect(clinks).toEqual(
      countTapTimes(WIZARD_GESTURE_SECONDS.count).map((at) => expect.closeTo(at, 9)),
    );
  });
});

describe("haggling and wearing", () => {
  it("walks through the refusals in order and ends as a wizard", () => {
    const kit = kitFor();
    const texts = [0, 1, 2, 3].map((step) => spoken(blockedScript(kit, ware("crown"), step))[0]);
    expect(texts[0]).toBe(WIZARD_LINES.haggle[0]);
    expect(texts[2]).toBe("Dir fehlen noch 3 Münzen. Da hilft kein Bitten.");
    expect(texts[3]).toBe("Ein Zauberer feilscht nicht. Er zaubert.");
    expect(blockedScript(kit, ware("crown"), 0).priority).toBe(1);
    expect(spoken(blockedScript(kitFor({ open: false }), null, 0))).toEqual([
      "Ohne LAN verkaufe ich nichts.",
    ]);
  });

  it("compliments a ware that is put on, and the jelly blushes", () => {
    const on = equippedScript(kitFor(), ware("beanie"), true);
    expect(on.cues).toContainEqual(expect.objectContaining({ kind: "customer", emote: "shy" }));
    const off = equippedScript(kitFor(), ware("beanie"), false);
    expect(off.cues.some((cue) => cue.kind === "customer")).toBe(false);
  });
});

describe("poke ladder", () => {
  /** Stupst zu den Zeiten `times` und liefert die Sätze. */
  function poke(times: number[], start: PokeLadder = FRESH_LADDER) {
    const kit = kitFor();
    let ladder = start;
    const lines = times.map((now) => {
      const reaction = pokeReaction(kit, ladder, now);
      ladder = reaction.ladder;
      return spoken(reaction.draft)[0] ?? null;
    });
    return { lines, ladder };
  }

  it("climbs five steps in order, then only glares for 20 s", () => {
    const { lines } = poke([0, 1000, 2000, 3000, 4000, 6000, 23_000]);
    expect(lines.slice(0, 5)).toEqual([...WIZARD_LINES.poke]);
    expect(lines[5]).toBeNull();
    expect(lines[6]).toBeNull();
    expect(poke([0, 1000, 2000, 3000, 4000, 24_100]).lines[5]).toBe(WIZARD_LINES.poke[0]);
  });

  it("starts again after 10 s without a poke", () => {
    expect(poke([0, 1000, 11_500]).lines).toEqual([
      WIZARD_LINES.poke[0],
      WIZARD_LINES.poke[1],
      WIZARD_LINES.poke[0],
    ]);
  });
});

describe("server reactions", () => {
  it("merges a level-up and its coins into one script", () => {
    const kit = kitFor();
    const first = serverReaction(kit, event("level.up", { level: 4 }), null, 0);
    expect(first.draft).toBeNull();
    const second = serverReaction(
      kit,
      event("coins.gained", { amount: 1, source: "level" }),
      first.merge,
      800,
    );
    expect(second.merge).toBeNull();
    expect(second.draft?.priority).toBe(2);
    expect(spoken(second.draft)[0]).toMatch(/Level 4|Aufgestiegen/);
    expect(second.draft?.cues).toContainEqual(
      expect.objectContaining({ kind: "customer", emote: "cheer" }),
    );
  });

  it("counts lonely coins with clinks once the partner does not come", () => {
    const kit = kitFor();
    const { merge } = serverReaction(
      kit,
      event("coins.gained", { amount: 3, source: "level" }),
      null,
      0,
    );
    expect(merge).toEqual<ServerMerge>({ coins: 3, at: 1500 });
    const script = flushServer(kit, merge!);
    expect(script.cues.filter((cue) => cue.kind === "sfx")).toHaveLength(3);
    expect(script.cues).toContainEqual({ at: 0, kind: "gaze", target: "purse" });
  });
});

describe("other server events", () => {
  it("thanks the Orga, takes refunds and notes the first purchase", () => {
    const kit = kitFor();
    const gift = serverReaction(
      kit,
      event("coins.gained", { amount: 5, source: "admin" }),
      null,
      0,
    );
    expect(spoken(gift.draft)[0]).toMatch(/Orga/);
    const refund = serverReaction(
      kit,
      event("coins.gained", { amount: 2, source: "refund" }),
      null,
      0,
    );
    expect(refund.draft?.cues).toContainEqual(expect.objectContaining({ gesture: "shrug" }));
    const first = serverReaction(
      kit,
      event("achievement.earned", { key: "first-purchase" }),
      null,
      0,
    );
    expect(spoken(first.draft)[0]).toMatch(/erster Kauf/);
  });

  it("lets unknown events and achievements pass", () => {
    const kit = kitFor();
    expect(serverReaction(kit, event("emote", { key: "wave" }), null, 0).draft).toBeNull();
    expect(
      serverReaction(kit, event("achievement.earned", { key: "hatched" }), null, 0).draft,
    ).toBeNull();
    expect(serverReaction(kit, { ...event("xp.gained"), payload: null }, null, 0).draft).toBeNull();
  });

  it("points at a ware that became affordable and opens or closes the shop", () => {
    const script = affordableScript(kitFor(), ware("hood"));
    expect(script.cues).toContainEqual({
      at: 0,
      kind: "effect",
      effect: "highlightItem",
      itemId: "hood",
    });
    expect(script.polite).toBe(true);
    expect(lanScript(kitFor(), true).priority).toBe(0);
    expect(spoken(lanScript(kitFor(), false))).toEqual(["Die LAN ist vorbei. Ich schließe ab."]);
  });
});

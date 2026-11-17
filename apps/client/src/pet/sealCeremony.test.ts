/**
 * Prüft das Siegel: die Übergänge der Zeremonie und wie es je nach Ware und Phase heißt.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { Me } from "./types";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import {
  OWN_INPUT_MS,
  SEAL_CSS_TIMES,
  SEAL_IDLE,
  SEAL_TIMING,
  sealClick,
  sealLabel,
  sealStep,
  type SealEvent,
  type SealInput,
  type SealState,
} from "./sealCeremony";
import { shopItems } from "./shop";

/** Spielt Ereignisse nacheinander ab und liefert jede Phase. */
function play(events: SealEvent["type"][], start: SealState = SEAL_IDLE) {
  let state = start;
  return events.map((type) => {
    state = sealStep(state, type === "settled" ? { type, ok: true } : ({ type } as SealEvent));
    return state.phase;
  });
}

/** Ein Stand mitten in der Zeremonie. */
function at(phase: SealState["phase"], answer: boolean | null = null): SealState {
  return { phase, answer, hint: false };
}

describe("sealStep", () => {
  it("kauft nach dem Halten: Stempel, dann Antwort", () => {
    const stamping = sealStep(sealStep(SEAL_IDLE, { type: "press" }), { type: "held" });
    expect(stamping.phase).toBe("stamping");
    const setting = sealStep(stamping, { type: "stamped" });
    expect(setting.phase).toBe("setting");
    expect(sealStep(setting, { type: "settled", ok: true }).phase).toBe("sealed");
    expect(sealStep(setting, { type: "settled", ok: false }).phase).toBe("cracked");
  });

  it("merkt sich eine Antwort, die vor dem Ende des Stempels kommt", () => {
    const answered = sealStep(at("stamping"), { type: "settled", ok: true });
    expect(answered).toEqual({ phase: "stamping", answer: true, hint: false });
    expect(sealStep(answered, { type: "stamped" }).phase).toBe("sealed");
    const refused = sealStep(at("stamping"), { type: "settled", ok: false });
    expect(sealStep(refused, { type: "stamped" }).phase).toBe("cracked");
  });

  it("zeigt nach zu kurzem Halten den Hinweis und nimmt ihn wieder weg", () => {
    const released = sealStep(at("holding"), { type: "release" });
    expect(released).toEqual({ phase: "idle", answer: null, hint: true });
    expect(sealStep(released, { type: "hintEnd" }).hint).toBe(false);
    expect(sealStep(released, { type: "press" })).toEqual(at("holding"));
  });

  it("macht für Screenreader scharf und bestätigt mit dem zweiten Klick", () => {
    expect(play(["assist", "assist", "stamped", "settled"])).toEqual([
      "armed",
      "stamping",
      "setting",
      "sealed",
    ]);
    expect(play(["assist", "timeout"])).toEqual(["armed", "idle"]);
  });
});

describe("sealStep in Ruhe und beim Abbrechen", () => {
  it("legt mit einem Tipp an und kehrt nach den Zeiten in Ruhe zurück", () => {
    expect(play(["tap", "settled", "stamped", "timeout"])).toEqual([
      "stamping",
      "stamping",
      "sealed",
      "idle",
    ]);
    expect(sealStep(at("cracked", false), { type: "timeout" })).toBe(SEAL_IDLE);
  });

  it("zeigt bei einem gesperrten Siegel den Hinweis", () => {
    expect(sealStep(SEAL_IDLE, { type: "blocked" })).toEqual({ ...SEAL_IDLE, hint: true });
  });

  it("bricht bei einer anderen Ware ab, nur nicht beim Stempeln", () => {
    expect(sealStep(at("holding"), { type: "reset" })).toBe(SEAL_IDLE);
    expect(sealStep(at("armed"), { type: "reset" })).toBe(SEAL_IDLE);
    expect(sealStep(at("sealed", true), { type: "reset" })).toBe(SEAL_IDLE);
    const stamping = at("stamping");
    expect(sealStep(stamping, { type: "reset" })).toBe(stamping);
    const setting = at("setting");
    expect(sealStep(setting, { type: "reset" })).toBe(setting);
  });

  it("überhört, was in einer Phase nichts bedeutet", () => {
    const holding = at("holding");
    expect(sealStep(holding, { type: "press" })).toBe(holding);
    expect(sealStep(holding, { type: "assist" })).toBe(holding);
    const stamping = at("stamping");
    expect(sealStep(stamping, { type: "release" })).toBe(stamping);
    expect(sealStep(SEAL_IDLE, { type: "hintEnd" })).toBe(SEAL_IDLE);
    expect(sealStep(SEAL_IDLE, { type: "stamped" })).toBe(SEAL_IDLE);
  });
});

/** Das Siegel für eine Ware der Vorschau. */
function look(id: string, patch: Partial<Omit<SealInput, "item">> = {}, me: Partial<Me> = {}) {
  const item = shopItems(PREVIEW_CATALOG, { ...PREVIEW_ME, ...me }).find(
    (entry) => entry.cosmetic.id === id,
  );
  if (!item) throw new Error(`Keine Ware ${id}`);
  return sealLabel({
    item,
    worn: false,
    open: true,
    phase: "idle",
    busy: false,
    perLevel: 1,
    ...patch,
  });
}

describe("sealLabel", () => {
  it("kauft eine erschwingliche Ware durch Halten", () => {
    expect(look("pixel-glasses")).toEqual({
      mode: "hold",
      wax: "buy",
      label: "Kaufen",
      price: 3,
      sub: "gedrückt halten",
      hint: "Halten, bis das Siegel sitzt. Gehört dir danach für immer.",
      assist: "Ohne Halten zweimal drücken: Der zweite Druck bestätigt den Kauf.",
      srLabel: "Kaufen für 3 Münzen",
    });
    expect(look("crown", {}, { coins: 6 }).hint).toContain("Gilt nur für diese LAN.");
  });

  it("sperrt, was zu teuer ist oder ohne LAN", () => {
    expect(look("hood")).toMatchObject({ mode: "locked", wax: "locked", label: "Noch 1 Münze" });
    expect(look("hood").hint).toBe("Jeder Level-Aufstieg bringt 1 Münze.");
    expect(look("pixel-glasses", { open: false })).toMatchObject({
      mode: "locked",
      label: "Laden ruht",
      sub: "nur während einer LAN",
    });
  });

  it("legt eigene Waren mit einem Tipp an und ab, auch ohne LAN", () => {
    expect(look("beanie", { open: false })).toMatchObject({
      mode: "tap",
      wax: "wear",
      label: "Anlegen",
    });
    expect(look("beanie", { worn: true })).toMatchObject({
      mode: "tap",
      wax: "off",
      label: "Ablegen",
    });
  });

  it("wartet, solange ein anderer Aufruf läuft", () => {
    expect(look("pixel-glasses", { busy: true })).toMatchObject({ mode: "locked", wax: "buy" });
    expect(look("pixel-glasses", { busy: true, phase: "stamping" }).mode).toBe("hold");
  });

  it("beschriftet jede Phase", () => {
    expect(look("pixel-glasses", { phase: "armed" }).label).toBe("Kauf bestätigen");
    expect(look("pixel-glasses", { phase: "holding" }).sub).toBe("Halten …");
    expect(look("pixel-glasses", { phase: "stamping" }).sub).toBe("Das Wachs trocknet …");
    expect(look("pixel-glasses", { phase: "setting" }).sub).toBe("Das Wachs trocknet …");
    expect(look("pixel-glasses", { phase: "sealed" })).toMatchObject({
      label: "Gesiegelt!",
      sub: "Bezahlt",
      price: null,
    });
    expect(look("pixel-glasses", { phase: "cracked" })).toMatchObject({
      label: "Gesprungen",
      sub: "Nichts bezahlt",
    });
    expect(look("beanie", { phase: "sealed" }).sub).toBe("Angelegt");
    expect(look("beanie", { phase: "sealed", worn: true }).sub).toBe("Abgelegt");
  });
});

describe("sealClick", () => {
  it("deutet einen Klick ohne eigenen Druck nach der Art des Siegels", () => {
    expect(sealClick("idle", "hold", Infinity)).toEqual({ type: "assist" });
    expect(sealClick("armed", "hold", Infinity)).toEqual({ type: "assist" });
    expect(sealClick("idle", "tap", Infinity)).toEqual({ type: "tap" });
    expect(sealClick("idle", "locked", Infinity)).toEqual({ type: "blocked" });
  });

  it("überhört den Klick, der zu einem eigenen Druck gehört, auch nach dem Kauf", () => {
    expect(sealClick("idle", "hold", 20)).toBeNull();
    expect(sealClick("idle", "tap", OWN_INPUT_MS - 1)).toBeNull();
    expect(sealClick("idle", "tap", OWN_INPUT_MS)).toEqual({ type: "tap" });
  });

  it("überhört Klicks, solange das Siegel stempelt oder steht", () => {
    for (const phase of ["holding", "stamping", "setting", "sealed", "cracked"] as const) {
      expect(sealClick(phase, "hold", Infinity)).toBeNull();
    }
  });
});

describe("SEAL_TIMING", () => {
  it("hält den Takt der Zeremonie und gibt ihn dem CSS", () => {
    expect(SEAL_TIMING).toEqual({
      holdMs: 650,
      lateHoldMs: 250,
      impactMs: 160,
      stampMs: 420,
      tapStampMs: 240,
      sealedMs: 2600,
      crackMs: 1600,
      armMs: 5000,
      hintMs: 1800,
    });
    expect(SEAL_CSS_TIMES["--seal-hold-time"]).toBe("650ms");
    expect(SEAL_CSS_TIMES["--seal-stamp-time"]).toBe("420ms");
  });
});

describe("sealLabel für Screenreader", () => {
  it("nennt im Namen, was auf dem Etikett steht", () => {
    expect(look("pixel-glasses", { open: false }).srLabel).toContain("Laden ruht");
  });

  it("sagt an, dass das scharfe Siegel auf die Bestätigung wartet", () => {
    expect(look("pixel-glasses", { phase: "armed" }).status).toBe(
      "Zum Bestätigen noch einmal drücken.",
    );
    expect(look("pixel-glasses").status).toBeUndefined();
    expect(look("pixel-glasses").assist).toContain("zweimal drücken");
  });
});

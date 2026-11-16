import { describe, expect, it } from "vitest";

import {
  PREVIEW_CATALOG,
  PREVIEW_ME,
  shopItems,
  speechNotes,
  wizardLine,
  wizardNotes,
  type ShopItem,
} from ".";

/** Die Einträge des Shops mit drei Münzen: Headsets und Mütze gehören dem Jelly schon. */
function item(id: string, coins = 3): ShopItem {
  const found = shopItems(PREVIEW_CATALOG, { ...PREVIEW_ME, coins }).find(
    (entry) => entry.cosmetic.id === id,
  );
  if (!found) throw new Error(`Kein Eintrag für ${id}`);
  return found;
}

describe("wizard lines", () => {
  it("greets by name and waves, in two versions", () => {
    const first = wizardLine({ kind: "greet", name: "Pixel" }, 0);
    const second = wizardLine({ kind: "greet", name: "Pixel" }, 1);
    expect(first.text).toContain("Pixel");
    expect(first.gesture).toBe("wave");
    expect(second.text).not.toBe(first.text);
  });

  it("offers what the jelly can afford and names what is missing", () => {
    const offer = wizardLine(
      { kind: "select", item: item("pixel-glasses"), worn: false, open: true },
      0,
    );
    expect(offer.text).toContain("Pixel-Brille");
    expect(offer.gesture).toBe("point");
    const short = wizardLine({ kind: "select", item: item("crown"), worn: false, open: true }, 0);
    expect(short.text).toContain("3 Münzen");
    expect(short.gesture).toBe("shrug");
  });

  it("mentions that the crown only lasts this LAN", () => {
    const crown = wizardLine(
      { kind: "select", item: item("crown", 6), worn: false, open: true },
      0,
    );
    expect(crown.text).toContain("nur für diese LAN");
  });

  it("closes the shop outside a running LAN, but still talks about owned parts", () => {
    const closed = wizardLine(
      { kind: "select", item: item("pixel-glasses"), worn: false, open: false },
      0,
    );
    expect(closed.text).toContain("ruht mein Laden");
    const owned = wizardLine({ kind: "select", item: item("beanie"), worn: true, open: false }, 0);
    expect(owned.text).toContain("prächtig");
  });

  it("cheers a purchase and dozes off with a snore", () => {
    expect(wizardLine({ kind: "bought", item: item("pixel-glasses") }, 0).gesture).toBe("cheer");
    const doze = wizardLine({ kind: "doze" }, 0);
    expect(doze.doze).toBe(true);
    expect(wizardNotes(doze).length).toBeGreaterThan(0);
  });

  it("speaks lower than the jelly, in the same rhythm", () => {
    const line = wizardLine({ kind: "wake" }, 0);
    const own = speechNotes(line.text);
    const wizard = wizardNotes(line);
    expect(wizard.map((note) => note.at)).toEqual(own.map((note) => note.at));
    expect(wizard[0]!.from).toBeLessThan(own[0]!.from);
  });
});

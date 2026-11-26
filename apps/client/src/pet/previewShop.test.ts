/**
 * Prüft die Zustände des Zauberladens in der Browser-Vorschau: jeden Hash und jede Abfrage.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import {
  PREVIEW_CATALOG,
  PREVIEW_GAME,
  PREVIEW_SHOP_HASHES,
  previewCoinGift,
  previewGame,
  previewGiftEvents,
  previewHatBack,
  previewHatStolen,
  previewSettings,
  previewShop,
} from "./preview";
import { shopItems } from "./shop";

/** Eine Mütze in der Farbe, die das Jelly zuvor trug. */
const BEANIE = { key: "beanie", color: "#4cc9f0" };

/** Das Jelly zu einem Hash. */
function me(hash: string) {
  const found = previewGame(hash).me;
  if (!found) throw new Error(`Kein Jelly in ${hash}`);
  return found;
}

describe("Stand des Zauberladens in der Vorschau", () => {
  it("kennt alle Hashes", () => {
    expect([...PREVIEW_SHOP_HASHES].sort()).toEqual(
      [
        "#shop-pleite",
        "#shop-reich",
        "#shop-alles",
        "#shop-zu",
        "#shop-leer",
        "#shop-laden",
        "#shop-fehler",
        "#shop-langsam",
        "#shop-muenzen",
        "#shop-nacht",
        "#shop-doesen",
        "#shop-runen",
        "#shop-anprobe",
        "#shop-zauber",
        "#shop-nerven",
        "#shop-hutlos",
      ].sort(),
    );
  });

  it("#shop-pleite: ohne Münzen", () => {
    expect(me("#shop-pleite").coins).toBe(0);
    expect(previewGame("#shop-pleite").lan).toBe(PREVIEW_GAME.lan);
  });

  it("#shop-reich: zwölf Münzen und noch nichts gekauft", () => {
    expect(me("#shop-reich")).toMatchObject({ coins: 12, cosmetics: [] });
  });

  it("#shop-alles: jede Ware schon gekauft", () => {
    const owner = me("#shop-alles");
    expect(owner.coins).toBe(2);
    const items = shopItems(PREVIEW_CATALOG, owner);
    expect(items.every((item) => item.state === "owned")).toBe(true);
  });

  it("#shop-zu: keine laufende LAN", () => {
    const game = previewGame("#shop-zu");
    expect(game.lan.current).toBeNull();
    expect(game.lan.joined).toBeNull();
    expect(me("#shop-zu").coins).toBe(0);
  });

  it("#shop-leer: kein Jelly", () => {
    expect(previewGame("#shop-leer").me).toBeNull();
  });

  it("#shop-hutlos: Mo trägt den Hut noch ein paar Minuten", () => {
    const before = Date.now();
    const hat = me("#shop-hutlos").wizard_hat;
    expect(hat).toMatchObject({ holder_name: "Mo" });
    expect(hat!.holder_id).not.toBe(PREVIEW_GAME.me!.id);
    expect(hat!.ends_at - before).toBeGreaterThanOrEqual(3 * 60_000);
  });
});

describe("Verhalten des Zauberladens in der Vorschau", () => {
  it("#shop-laden: bleibt beim Laden", () => {
    expect(previewShop("#shop-laden").ready).toBe(false);
  });

  it("#shop-fehler: lehnt jeden Kauf nach 400 ms ab", () => {
    expect(previewShop("#shop-fehler")).toMatchObject({
      purchaseMs: 400,
      purchaseError: "Der Server hat den Kauf abgelehnt.",
    });
  });

  it("#shop-langsam: bestätigt erst nach zwei Sekunden", () => {
    expect(previewShop("#shop-langsam")).toMatchObject({ purchaseMs: 2000, purchaseError: null });
  });

  it("#shop-muenzen: bringt nach fünf Sekunden eine Münze und ein Level", () => {
    expect(previewShop("#shop-muenzen").giftMs).toBe(5000);
    const gift = previewCoinGift(PREVIEW_GAME);
    expect(gift.me).toMatchObject({ coins: 4, level: 4 });
    const empty = previewGame("#shop-leer");
    expect(previewCoinGift(empty)).toBe(empty);
  });

  it("#shop-muenzen: meldet dem Zauberer dieselben Münzen und dasselbe Level wie der Server", () => {
    const events = previewGiftEvents(3, 1);
    expect(events.map(({ type, payload }) => [type, payload])).toEqual([
      ["coins.gained", { amount: 1, source: "level" }],
      ["level.up", { level: 4 }],
    ]);
  });

  it("#shop-nerven: setzt dem Jelly den geklauten Hut auf und gibt ihn wieder zurück", () => {
    expect(previewShop("#shop-nerven").stealsHat).toBe(true);
    const worn = { ...PREVIEW_GAME, me: { ...PREVIEW_GAME.me!, equipped: { head: BEANIE } } };
    const stolen = previewHatStolen(worn, 9000);
    expect(stolen.me).toMatchObject({
      wizard_hat: { holder_id: PREVIEW_GAME.me!.id, holder_name: "Pixel", ends_at: 9000 },
      equipped: { head: { key: "wizard-hat", color: null } },
    });
    expect(previewHatBack(stolen, BEANIE).me).toMatchObject({
      wizard_hat: null,
      equipped: { head: BEANIE },
    });
    expect(previewHatBack(stolen).me!.equipped).toEqual({});
  });

  it.each(["#shop-nacht", "#shop-doesen", "#shop-runen", "#shop-anprobe", "#shop-zauber"])(
    "%s: startet mit dem normalen Stand, den Rest spielen Zauberer und Bühne",
    (hash) => {
      expect(previewGame(hash)).toBe(PREVIEW_GAME);
      expect(previewShop(hash)).toEqual(previewShop(""));
    },
  );

  it("kauft ohne Hash nach einer Viertelsekunde", () => {
    expect(previewShop("")).toEqual({
      ready: true,
      purchaseMs: 250,
      purchaseError: null,
      giftMs: null,
      stealsHat: false,
    });
    expect(previewShop("constructor")).toEqual(previewShop(""));
    expect(previewGame("constructor")).toBe(PREVIEW_GAME);
  });
});

describe("previewSettings", () => {
  const { settings } = PREVIEW_GAME;

  it("übernimmt ?optimized, ?ruhig und ?fps=30", () => {
    expect(previewSettings("?optimized", settings).optimizedRendering).toBe(true);
    expect(previewSettings("?ruhig", settings).reducedMotion).toBe(true);
    expect(previewSettings("?fps=30", settings).frameLimit).toBe(30);
    expect(previewSettings("?optimized&ruhig&fps=30", settings)).toEqual({
      ...settings,
      optimizedRendering: true,
      reducedMotion: true,
      frameLimit: 30,
    });
  });

  it("lässt die Einstellungen ohne Abfrage und bei Unsinn, wie sie sind", () => {
    expect(previewSettings("", settings)).toEqual(settings);
    expect(previewSettings("?fps=schnell", settings)).toEqual(settings);
    expect(previewSettings("?fps=-5", settings)).toEqual(settings);
    expect(previewSettings("?size=20", settings)).toEqual(settings);
    expect(previewSettings("?size=gross", settings)).toEqual(settings);
  });

  it("stellt mit ?size die Größe des Pets ein", () => {
    expect(previewSettings("?size=30", settings).size).toBe(30);
  });
});

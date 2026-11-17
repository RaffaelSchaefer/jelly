/**
 * Was der Kaufbrief über eine Ware erzählt: eine Zeile Geschichte je Ware und wie sie im Satz
 * heißt. Reine Daten, gezeigt in `shop/BriefParts.tsx`.
 *
 * @module
 */

/** Was über eine bekannte Ware im Kaufbrief steht. */
interface WareText {
  /** Eine Zeile Geschichte, höchstens {@link LORE_MAX} Zeichen. */
  lore: string;
  /** Der Artikel im Akkusativ, für Sätze wie „Für die Kapuze fehlt dir …“. */
  article: "den" | "die" | "das";
}

/** So lang darf eine Zeile Geschichte höchstens sein, damit sie im Kaufbrief Platz hat. */
export const LORE_MAX = 100;

/** Die Waren, die der Laden kennt. */
const WARES: Readonly<Record<string, WareText>> = {
  headset: { lore: "Hört das Flüstern jeder Lobby, sogar durch dicke Burgmauern.", article: "das" },
  "headset-neutral": {
    lore: "Ganz ohne Schnickschnack. Klingt trotzdem nach großer Halle.",
    article: "das",
  },
  beanie: {
    lore: "Gestrickt aus Mondwolle. Hält warm, auch wenn der Server friert.",
    article: "die",
  },
  sprout: {
    lore: "Gekeimt aus einem Zaubersamen. Gießen muss man ihn nicht, gute Laune reicht.",
    article: "den",
  },
  "pixel-glasses": {
    lore: "Zeigt die Welt in 8 Bit. Nebenwirkung: unverschämt cool.",
    article: "die",
  },
  "schnoerbi-mask": {
    lore: "Aus Sonnengold geschmiedet, die Büschel vom Plapperkauz. Wer sie trägt, schnattert bis zum Morgen.",
    article: "die",
  },
  hood: {
    lore: "Für geheime Wege durch die Halle. Niemand erkennt dich. Fast niemand.",
    article: "die",
  },
  crown: { lore: "Glänzt eine LAN lang, danach zerfällt sie zu Sternenstaub.", article: "die" },
};

/** Was über eine Ware steht, die der Laden noch nicht kennt, nach ihrem Platz. */
const SLOT_LORE: Readonly<Record<string, string>> = {
  head: "Frisch aus dem Hinterzimmer des Zauberers.",
  face: "Für ein Gesicht, das man nicht vergisst.",
};

/** Was über unbekannte Waren auf anderen Plätzen steht. */
const ANY_LORE = "Riecht nach Abenteuer und ein wenig nach Zimt.";

/** Die bekannte Ware `id`, oder `undefined`. `Object.hasOwn` hält Namen wie `constructor` fern. */
function known(id: string) {
  return Object.hasOwn(WARES, id) ? WARES[id] : undefined;
}

/** Die Zeile Geschichte zu einer Ware. Unbekannte Waren bekommen eine nach ihrem Platz. */
export function wareLore(id: string, slot: string): string {
  const ware = known(id);
  if (ware) return ware.lore;
  return Object.hasOwn(SLOT_LORE, slot) ? SLOT_LORE[slot] : ANY_LORE;
}

/**
 * Die Ware mit Artikel im Akkusativ („die Kapuze“), oder `null`, wenn der Laden ihren Artikel nicht
 * kennt.
 */
export function wareAccusative(id: string, name: string): string | null {
  const ware = known(id);
  return ware ? `${ware.article} ${name}` : null;
}

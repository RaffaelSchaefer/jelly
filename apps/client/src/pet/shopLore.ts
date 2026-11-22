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
  "long-schnoerbi": {
    lore: "Gestrickt aus einem endlosen Wollknäuel. Wo er aufhört, weiß keiner so genau.",
    article: "den",
  },
  goose: {
    lore: "Aus Wolkenflaum genäht. Drückt man sie fest, schnattert sie ganz leise.",
    article: "die",
  },
  "knit-scarf": {
    lore: "Von Großmutter Wolke gestrickt, Masche für Masche. Wärmt auch beim kältesten Lag.",
    article: "den",
  },
  bandana: {
    lore: "Gepunktet wie ein Fliegenpilz, gebunden wie bei echten Abenteurern.",
    article: "das",
  },
  "bell-collar": {
    lore: "Das Glöckchen klingelt nur für Freunde. Und manchmal für Kekse.",
    article: "das",
  },
  "mini-backpack": {
    lore: "Ein Frosch, der Snacks bewacht. Quakt, wenn jemand an die Chips will.",
    article: "den",
  },
  "snail-shell": {
    lore: "Gebaut für hohen Ping. Was langsam ist, kommt trotzdem an.",
    article: "das",
  },
  "fairy-wings": {
    lore: "Gesponnen aus Mondlicht und Glitzerstaub. Fliegen kann man damit nicht, aber träumen.",
    article: "die",
  },
  chicken: {
    lore: "Gackert leise im Schlaf und legt manchmal ein Ei aus Watte. Niemand weiß, wohin.",
    article: "das",
  },
  piercings: {
    lore: "Aus Sternensilber, gestochen mit einem Kitzelzauber. Tut kein bisschen weh.",
    article: "die",
  },
  "kamina-glasses": {
    lore: "Geschliffen aus rotem Sternenglas. Wer sie trägt, durchbohrt mit Kampfgeist jeden Himmel.",
    article: "die",
  },
  "ogre-ears": {
    lore: "Aus einem Sumpf weit hinter der Halle. Hören jedes Flüstern, auch das ungefragte.",
    article: "die",
  },
  "cat-ears": {
    lore: "Aus Wolkenplüsch genäht. Zucken, wenn irgendwo eine Tüte raschelt.",
    article: "die",
  },
  "cyber-cat-ears": {
    lore: "Aus einer Zukunft, in der Katzen das Netz regieren. Leuchten auch im Dunkeln.",
    article: "die",
  },
  "cat-whiskers": {
    lore: "Spüren jeden Luftzug in der Halle. Und jede offene Chipstüte.",
    article: "die",
  },
  kitten: {
    lore: "Schnurrt, wenn man es drückt. Schläft sonst den ganzen Tag, wie es sich gehört.",
    article: "das",
  },
  "yarn-ball": {
    lore: "Rollt immer genau dorthin, wo man nicht hinkommt. Der Faden hört nie auf.",
    article: "das",
  },
  "cat-paws": {
    lore: "Weich wie Samt, mit rosa Bohnen. Krallen wurden vorsichtshalber weggezaubert.",
    article: "die",
  },
  "cat-tail": {
    lore: "Wedelt von allein, wenn du gewinnst. Bei Lag zuckt nur die Spitze.",
    article: "den",
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

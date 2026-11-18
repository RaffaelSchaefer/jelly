/**
 * Was der Zauberer im Laden sagen kann: je Anlass einige Fassungen, dazu eigene Sätze zu jedem Teil
 * des Shops. Wer den Ton ändern will, ändert nur die Daten in dieser Datei. Am Ende stehen die
 * Helfer, die Fassungen sammeln und füllen; ausgesucht wird in `wizardPick.ts`.
 *
 * Platzhalter in geschweiften Klammern: `{name}`, `{item}`, `{missing}`, `{coins}`, `{gained}`,
 * `{perLevel}`, `{levelUps}`, `{level}`, `{next}` und `{remaining}`. Kein Satz wird länger als 60
 * Zeichen, auch mit einem Namen aus 24 Zeichen. Jeder Anlass hat eine Fassung ohne Platzhalter mit
 * höchstens 40 Zeichen. Allgemeine Sätze kommen ohne Artikel vor `{item}` aus, Artikel stehen nur
 * in den Sätzen zu einem bestimmten Teil. Rabatte verspricht er nie: Die Preise macht der Server.
 *
 * @module
 */

/** Länger wird kein Satz, auch gefüllt. */
export const MAX_LINE_CHARS = 60;

/** Höchstens so lang ist die Fassung ohne Platzhalter, die jeder Anlass hat. */
export const FALLBACK_CHARS = 40;

/** Sätze zu einem bestimmten Teil kommen öfter dran als allgemeine. */
const ITEM_WEIGHT = 2;

/** Ein Platzhalter in einer Fassung. */
const SLOT = /\{(\w+)\}/g;

/** Sein Name, an genau einer Stelle. */
export const WIZARD_NAME = "Funkelbart";

/** Was in die Platzhalter kommt, schon als fertiger Text. */
export interface LineSlots {
  name?: string;
  /** Anzeigename des Teils. */
  item?: string;
  /** Schlüssel des Teils im Katalog, für seine eigenen Sätze. Füllt keinen Platzhalter. */
  itemKey?: string;
  missing?: string;
  coins?: string;
  gained?: string;
  perLevel?: string;
  levelUps?: string;
  level?: string;
  next?: string;
  remaining?: string;
}

/** Eine Fassung. Mit Gewicht kommt sie seltener (unter 1) oder öfter (über 1) dran. */
export type LineVariant = string | { text: string; weight: number };

/** Alle Anlässe mit ihren Fassungen. */
export const WIZARD_LINES = {
  "greet.hello": [
    "Willkommen in meinem Laden, {name}!",
    "Ah, {name}! Schau dich ruhig um.",
    "Tritt näher, {name}. Die Waren warten.",
    "Sei gegrüßt, {name}! Was darf es sein?",
    "Willkommen, willkommen! Nur herein.",
  ],
  "greet.first": [
    "Ein neues Gesicht! Willkommen, {name}.",
    "Oh, Kundschaft! Neu hier, {name}?",
    "Herein, herein! Zum ersten Mal hier?",
  ],
  "greet.intro": [
    `Ich bin ${WIZARD_NAME}. Anprobieren kostet nichts.`,
    `Ich bin ${WIZARD_NAME}. Probier nur!`,
  ],
  "greet.regular": [
    "Bei meinem Bart, {name}! Komm herein.",
    "Schön, dich wiederzusehen, {name}!",
    "{name}, mein liebstes Jelly! Willkommen.",
    "Ah, du schon wieder! Nur herein.",
  ],
  "greet.rich": [
    "Deine Börse klimpert ja prächtig, {name}!",
    "Ich höre Münzen klimpern! Komm näher.",
  ],
  "greet.broke": [
    "Leere Taschen? Schauen kostet nichts.",
    "Keine Münzen? Träumen darf man trotzdem.",
  ],
  "greet.collector": [
    "Du hast mir ja den ganzen Laden leergekauft!",
    "Alles schon deins! Was führt dich her?",
  ],
  "greet.closed": ["Der Laden ruht, {name}. Keine LAN gerade.", "Ohne LAN bleibt die Kasse zu."],
  "greet.closedBeat": ["Anprobieren darfst du trotzdem."],
  "greet.night": [
    "So spät noch wach, {name}? Ich auch.",
    "Kundschaft zu später Stunde? Herein!",
    "Die Eulen rufen schon, {name}.",
  ],
  "greet.morning": ["Schon wach, {name}? Ich brauch erst Tee.", "Früh auf den Beinen? Herein!"],
  "greet.early": ["Ah, {name}!", "Ah, willkommen!"],
  "select.offer": [
    "{item}? Eine vorzügliche Wahl.",
    "{item}, ein guter Handel!",
    "Ah, {item}! Ein feines Stück.",
    "Gute Wahl! Das steht dir.",
  ],
  "select.exact": ["Genau passend! Als hätt ich’s geahnt.", "Auf die Münze genau! Wie gezaubert."],
  "select.perLan": ["Gilt aber nur für diese LAN."],
  "select.noModel": [
    "Mein Schneider näht noch. Kaufen geht schon.",
    "Noch ohne Abbild, aber schon zu haben.",
  ],
  "select.closed": ["Anprobieren ja, kaufen erst zur LAN.", "Probier nur! Verkauft wird zur LAN."],
  "select.short": [
    "Dafür fehlen dir noch {missing}.",
    "Hm, noch {missing} zu wenig.",
    "Dafür reicht die Börse noch nicht.",
  ],
  "select.hint": [
    "Noch {levelUps}, dann gehört es dir.",
    "Jeder Aufstieg bringt {perLevel}. Nur Mut!",
    "Steig auf, dann klimpert es wieder.",
  ],
  "select.hintOrga": ["Münzen gibt’s gerade nur von der Orga."],
  "select.owned": ["Schon deins! Leg es ruhig an.", "{item} liegt schon in deiner Truhe."],
  "select.worn": ["Steht dir prächtig.", "Das trägst du schon. Sehr elegant.", "Wie angegossen!"],
  "select.revisit": ["Noch einmal {item}? Gern.", "Wieder da? Es läuft dir nicht weg."],
  "select.repeat": ["Das lässt dich nicht los, was?", "Zum dritten Mal! Das ist wohl Liebe."],
  "select.compare": ["Die Qual der Wahl, hm?", "Vergleich nur in Ruhe."],
  "wake.oh": ["Oh! …"],
  "buy.incantation": [
    "Glitzer, Glimmer, Glanz!",
    "Bim, bam, Bimmelbart!",
    "Eins, zwei … Zauberei!",
    "Schwuppdiwupp!",
  ],
  "buy.congrats": [
    "Ein Handel! Möge es dir Glück bringen.",
    "Wunderbar, es gehört nun dir!",
    "Gekauft und angelegt! Prächtig, {name}.",
  ],
  "buy.suggestNext": ["Für {item} reicht es übrigens auch.", "Da wäre noch mehr für dich."],
  "buy.suggestSave": ["Spar weiter, dann wird {item} deins.", "Spar weiter, es lohnt sich."],
  "buy.suggestAll": [
    "Jetzt hast du alles! Ich bin beeindruckt.",
    "Alles deins! Ich bin beeindruckt.",
  ],
  "buy.fizzle": [
    "Hoppla, der Zauber ist verpufft.",
    "Pfff … Der Spruch wollte nicht.",
    "Verflixt! Die Kugel hat geschluckt.",
  ],
  "equip.on": ["Angelegt! Jetzt sieht’s die ganze LAN.", "Wie für dich gemacht!"],
  "equip.off": ["Ab in die Truhe damit.", "Wie du meinst.", "Auch ohne bist du schick."],
  haggle: [
    "Anschreiben? Nicht bei mir, Jellychen.",
    "Feilschen? Meine Preise sind in Stein gemeißelt.",
    "Dir fehlen noch {missing}. Da hilft kein Bitten.",
    "Ein Zauberer feilscht nicht. Er zaubert.",
  ],
  "haggle.closed": ["Ohne LAN verkaufe ich nichts."],
  "hover.quip": [
    "{item}? Ein Stück aus fernen Landen.",
    "Gute Augen hast du, {name}.",
    "Das da? Ein Schmuckstück, sag ich dir.",
  ],
  "seal.encourage": ["Nur zu, das Siegel beißt nicht.", "Fest drücken, dann wirkt der Zauber."],
  purse: ["Zähl ruhig nach. Es sind {coins}.", "Keine Sorge, ich zähle mit."],
  "server.coins": [
    "Klimper! {gained} frisch in deiner Börse.",
    "Klimper, klimper! Frische Münzen.",
  ],
  "server.gift": ["Ein Geschenk der Orga? Wie großzügig!", "{gained} von der Orga? Prächtig!"],
  "server.refund": ["Zurückgegeben? Hier, {gained} zurück.", "Das Geld ist wieder bei dir."],
  "server.levelCoins": ["Level {level}! Und {gained} obendrauf.", "Aufgestiegen! Und Münzen dazu."],
  "server.level": ["Level {level}! Prächtig, {name}!", "Ein Aufstieg! Bravo!"],
  "server.affordable": ["Jetzt reicht’s für {item}!", "Jetzt reicht’s für mehr!"],
  "server.firstPurchase": [
    "Dein erster Kauf! Den trag ich ins Buch ein.",
    "Dein erster Kauf! Hurra!",
  ],
  "server.shopaholic": ["Kaufrausch? Mir soll’s recht sein!"],
  "server.award": ["Eine Ehrung der Orga! Respekt, {name}.", "Eine Ehrung! Respekt!"],
  "lan.open": ["Die LAN beginnt! Der Laden ist offen."],
  "lan.close": ["Die LAN ist vorbei. Ich schließe ab."],
  "idle.peer": ["Du siehst heute besonders glibberig aus.", "Hübsch wackelig heute, {name}."],
  "idle.bare": ["So ganz ohne Hut? Mutig, mutig."],
  "idle.count": ["… acht, neun, zehn. Stimmt alles."],
  "prophecy.reach": [
    "Ein Aufstieg noch, dann ist {item} drin.",
    "Ein Aufstieg noch, sagt die Kugel.",
  ],
  "prophecy.xp": [
    "Noch {remaining} XP bis Level {next}, sagt die Kugel.",
    "Das nächste Level naht. Ich seh’s!",
  ],
  "prophecy.all": ["Die Kugel ist ratlos. Du hast ja alles!"],
  "prophecy.closed": ["Ich sehe … eine LAN am Horizont."],
  "prophecy.joke": [
    "Ich sehe … Pizza. Sehr viel Pizza.",
    "Ich sehe … einen Sieg. Oder einen Lag.",
    { text: "Die Kugel sagt: Trink mal was.", weight: 0.5 },
  ],
  "doze.yawn": ["Huaaah …"],
  "doze.snore": ["Zzz …"],
  "doze.mumble": ["Mmh … fünf Minuten noch …"],
  wake: [
    "Oh! Kundschaft! Ich war wach, ehrlich.",
    "Hm? Ich hab nur kurz geruht.",
    "Wo war ich … ach ja, der Laden!",
  ],
  return: ["Ah, da bist du ja wieder.", "Wieder da? Ich hab den Laden gehütet."],
  poke: [
    "Hoho, das kitzelt!",
    "Vorsicht, mein Hut!",
    "Ich bin doch kein Pudding! … Oder?",
    "Noch einmal, und ich zaubere dir Socken an.",
    "Genug gestupst!",
  ],
} as const satisfies Record<string, readonly LineVariant[]>;

/** Ein Anlass, zu dem er etwas sagt. */
export type LineTopic = keyof typeof WIZARD_LINES;

/** Wozu es eigene Sätze je Teil gibt. */
export type ItemLineKind = "offer" | "short" | "worn" | "bought" | "hover";

/** Welcher allgemeine Anlass um die Sätze eines Teils wächst. */
export const ITEM_TOPICS: Partial<Record<LineTopic, ItemLineKind>> = {
  "select.offer": "offer",
  "select.short": "short",
  "select.worn": "worn",
  "equip.on": "worn",
  "buy.congrats": "bought",
  "hover.quip": "hover",
};

/** Eigene Sätze je Teil, nach seinem Schlüssel im Katalog. */
export const ITEM_LINES: Readonly<Record<string, Record<ItemLineKind, readonly string[]>>> = {
  headset: {
    offer: [
      "Ein Headset! Damit hörst du jeden Schritt.",
      "Mit dem Headset hörst du sogar Gedanken.",
    ],
    short: ["Fürs Headset fehlt noch ein wenig Gold."],
    worn: ["Das Headset steht dir. Hörst du mich gut?"],
    bought: ["Möge dein Headset nie rauschen, {name}!"],
    hover: ["Die Öhrchen wackeln, wenn keiner hinsieht."],
  },
  "headset-neutral": {
    offer: ["Schlicht und edel. Wie mein Bart.", "Das schlichte Headset, ganz ohne Firlefanz."],
    short: ["Auch Schlichtes hat seinen Preis."],
    worn: ["Schlicht steht dir am besten."],
    bought: ["Schlicht gekauft, schlicht schön!"],
    hover: ["Ganz ohne Schnickschnack, das gute Stück."],
  },
  beanie: {
    offer: ["Die Mütze hält warm, auch bei Lags.", "Handgestrickt! Von meiner Großtante."],
    short: ["Für die Mütze fehlt noch ein Zipfel."],
    worn: ["Mit Mütze bist du doppelt gemütlich."],
    bought: ["Bleib warm, {name}! Die Mütze passt."],
    hover: ["Die Mütze hat schon zwei Winter überlebt."],
  },
  sprout: {
    offer: [
      "Ein Spross! Er wächst mit jeder guten Laune.",
      "Frisch gekeimt aus meinem Kräutergarten.",
    ],
    short: ["Für den Spross fehlt noch etwas Dünger."],
    worn: ["Da sprießt ja was! Steht dir prächtig."],
    bought: ["Wachse und gedeihe, {name}!"],
    hover: ["Psst! Er wächst, wenn keiner hinsieht."],
  },
  "pixel-glasses": {
    offer: [
      "Durch die Pixel-Brille wird alles schön eckig.",
      "Die Pixel-Brille! Acht Bit voller Stil.",
    ],
    short: ["Die Pixel-Brille braucht noch ein paar Münzen."],
    worn: ["Sehr scharf. Also … pixelscharf."],
    bought: ["Jetzt siehst du alles in Pixeln, {name}!"],
    hover: ["Ich seh dadurch nur Klötzchen. Du?"],
  },
  "schnoerbi-mask": {
    offer: [
      "Die Schnörbi-Maske! Golden, flauschig, herrlich albern.",
      "Gold, Schnabel, Büschel. Mehr Würde passt in keine Maske.",
    ],
    short: ["Die Schnörbi-Maske will noch einen Beutel Gold."],
    worn: ["Schnörbi? Fast hätte ich dich nicht erkannt."],
    bought: ["Herrlich, {name}! Schnatter mit Stil."],
    hover: ["Psst! Die Büschel wackeln, wenn du lachst."],
  },
  "long-schnoerbi": {
    offer: [
      "Der Long Schnörbi! Er hört einfach nicht auf.",
      "So lang, ich musste ihn zweimal falten.",
    ],
    short: ["Für so viel Schnörbi fehlt noch etwas Gold."],
    worn: ["Halt ihn gut fest, er ist länger als du!"],
    bought: ["Knuddel ihn gut, {name}! Alle drei Meter."],
    hover: ["Psst! Sein Schwanz liegt noch im Lager."],
  },
  goose: {
    offer: ["Die Kuschelgans! Weich wie eine Wolke.", "Sie schnattert nur, wenn keiner hinsieht."],
    short: ["Für die Gans fehlt noch etwas Gold."],
    worn: ["Drück sie fest, sie mag das!"],
    bought: ["Kuschel sie gut, {name}! Sie schnattert."],
    hover: ["Psst! Nachts mopst sie Kekse aus dem Lager."],
  },
  hood: {
    offer: [
      "Die Kapuze! Geheimnisvoll wie ein Zauberer.",
      "Unter der Kapuze bleibt jeder Plan geheim.",
    ],
    short: ["Die Kapuze will noch ein paar Münzen."],
    worn: ["Geheimnisvoll! Fast wie ich."],
    bought: ["Kapuze auf, {name}! Ganz geheimnisvoll."],
    hover: ["Darunter passt sogar ein Nickerchen."],
  },
  crown: {
    offer: [
      "Eine LAN lang Hoheit sein. Verlockend, was?",
      "Die Krone! Schwer wie die Verantwortung.",
    ],
    short: ["Für die Krone fehlt noch Kleingeld."],
    worn: ["Eure Hoheit! Darf ich die Krone polieren?"],
    bought: ["Lang lebe {name}! Bis zum LAN-Ende."],
    hover: ["Schwer wiegt die Verantwortung, glaub mir."],
  },
};

/** Eine Fassung mit ihrem Gewicht. */
export interface LineCandidate {
  template: string;
  weight: number;
}

/** Text und Gewicht einer Fassung. */
function candidateOf(variant: LineVariant, weight = 1): LineCandidate {
  return typeof variant === "string"
    ? { template: variant, weight }
    : { template: variant.text, weight: variant.weight * weight };
}

/** Alle Fassungen zu `topic`, mit den eigenen Sätzen des Teils `itemKey` vorn. */
export function lineVariants(topic: LineTopic, itemKey?: string): LineCandidate[] {
  const kind = ITEM_TOPICS[topic];
  const own = kind && itemKey ? (ITEM_LINES[itemKey]?.[kind] ?? []) : [];
  const general: readonly LineVariant[] = WIZARD_LINES[topic];
  return [
    ...own.map((line) => candidateOf(line, ITEM_WEIGHT)),
    ...general.map((line) => candidateOf(line)),
  ];
}

/** Füllt die Platzhalter. `null`, wenn einer davon fehlt. */
export function fillLine(template: string, slots: LineSlots): string | null {
  let complete = true;
  const text = template.replace(SLOT, (_, key: string) => {
    const value = key === "itemKey" ? undefined : slots[key as keyof LineSlots];
    if (value === undefined) complete = false;
    return value ?? "";
  });
  return complete ? text : null;
}

/** Die Fassung ohne Platzhalter, die immer passt: die kürzeste des Anlasses. */
export function fallbackLine(topic: LineTopic): string {
  const plain = lineVariants(topic)
    .map(({ template }) => template)
    .filter((template) => !template.includes("{"));
  return plain.reduce((best, line) => (line.length < best.length ? line : best), plain[0] ?? "…");
}

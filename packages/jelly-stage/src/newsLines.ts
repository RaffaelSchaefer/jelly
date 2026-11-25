/**
 * What the Jelly-News say: for every report of the show a card with rubric, headline and the jellies
 * it is about. The texts are German like everything the stage writes, and deadpan: the less it
 * matters, the more serious it sounds. Without three, so it can be tested by itself.
 *
 * @module
 */

import type { NewsBeat } from "./news.ts";
import type { StageCatalog, StagePlayer, StageScheduleItem } from "./types.ts";

import { scramble } from "./news.ts";

/** The pictures a report can show, by the name of their file in `art/news`. */
export const NEWS_PICTURES = [
  "xp",
  "award",
  "tower",
  "tournament",
  "food",
  "weather",
  "interview",
  "report",
  "gossip",
  "hat",
  "signs",
  "orga",
  "yoga",
  "together",
  "program",
  "breaking",
  "weather-night",
] as const;

/** A picture of {@link NEWS_PICTURES}. */
export type NewsPicture = (typeof NEWS_PICTURES)[number];

/** What one report shows. */
export interface NewsCard {
  rubric: string;
  glyph: string;
  headline: string;
  /** Who reports or who is meant, under the headline. */
  sub: string;
  /** A number or time worth showing large, or empty. */
  figure: string;
  /** Urgent reports are red. */
  isUrgent: boolean;
  /** The jellies the report is about, as far as they are in the room. They get light and camera. */
  playerIds: number[];
  /** A report from the hall is filmed there, all others in the studio. */
  isLive: boolean;
  /** The picture over the shoulder, null where the channel logo stands. */
  picture: NewsPicture | null;
}

/** What the texts of a show are written from. */
export interface NewsScene {
  players: StagePlayer[];
  catalog: StageCatalog;
  presenterId: number | null;
  /** Jellies the show names, who are not asked for a voice from the hall. */
  named: ReadonlySet<number>;
  seed: number;
  /** Hour of the day on this screen, from 0 to 23. */
  hour: number;
  /** Writes a server time as a time of day. */
  formatTime: (time: number) => string;
}

const CHANNEL = "JELLY NEWS";
const SOMEBODY = "Ein Jelly";
const SECRET_TITLE = "Geheimes Achievement";
const WIZARD_HAT = "wizard-hat";
const NIGHT = { from: 23, until: 6 };
const STUDIO = {
  isUrgent: false,
  isLive: false,
  figure: "",
  playerIds: [] as number[],
  picture: null as NewsPicture | null,
};

const TOP_XP_LINES = [
  "Dauerstupser der Stunde: {name} sammelt {xp} XP.",
  "{name} sammelt {xp} XP. Experten sprechen von Fleiß.",
  "{xp} XP in einer Stunde. {name} gibt dazu keinen Kommentar.",
];
const ACHIEVEMENT_LINES = [
  "{name} erhält „{title}“. Die Halle nimmt es zur Kenntnis.",
  "Auszeichnung für {name}: „{title}“. Eine Stellungnahme steht aus.",
  "„{title}“ geht an {name}. Die Jury war sich einig.",
];
/** Achievements with a report of their own. */
const SPECIAL_LINES: Record<string, string> = {
  hydrated: "Wasserwerke schlagen Alarm: {name} ist gut hydriert.",
  conga: "Polonaise legt Gang lahm. Mittendrin: {name}.",
  lighthouse: "Neuer Leuchtturm in der Halle. Ganz oben: {name}.",
  "lighthouse-light": "Schifffahrt atmet auf: {name} leuchtet von oben.",
  "hat-thief": "Diebstahl im Zauberladen. Verdächtig: {name}.",
  "ghost-hour": "Nachtschicht-Sonderbericht: {name} spukt noch.",
  "night-owl": "Nachtschicht-Sonderbericht: {name} ist um vier Uhr noch wach.",
  marathon: "Nachtschicht-Sonderbericht: {name} seit zehn Stunden im Dienst.",
  matching: "Partnerlook außer Kontrolle. Beteiligt: {name}.",
  comeback: "Vermisstes Jelly wieder aufgetaucht: {name} ist zurück.",
  "beauty-sleep": "{name} hat geschlafen. Die Halle zeigt sich überrascht.",
  "stuck-here": "{name} klebt fest. Die Feuerwehr rückt nicht aus.",
  shopaholic: "Kaufrausch bei Funkelbart: {name} hat alles.",
  "first-purchase": "Wirtschaft erholt sich: {name} kauft zum ersten Mal ein.",
};
const STACK_LINES = [
  "Statiker besorgt: Turm aus {count} Jellies gesichtet.",
  "Bauamt prüft Turm aus {count} Jellies. Eine Genehmigung lag nicht vor.",
];
const WEATHER_LINES = [
  "Leicht steigender Ping im Ostflügel, gegen Abend Pizza-Duft.",
  "Vereinzelt Kabel-Stolperfallen, sonst heiter bis koffeiniert.",
  "Hochdruckgebiet über der Snackbar. Lüfter drehen auf Nord.",
];
const NIGHT_WEATHER_LINES = [
  "Schlafmangel-Wetter: zunehmend müde, örtlich Energydrinks.",
  "Weltraumwetter: Hitzewelle auf dem Merkur. In der Halle bleibt es dunkel.",
];
const REPORT_LINES = [
  "{name} starrt seit Minuten verdächtig auf die Snackbar.",
  "{name} ist dem Ethernet-Kabel bis in die Lounge gefolgt. Ausgang ungewiss.",
  "Fundsache: Ein leicht warmer USB-Stick „WICHTIG_FINAL_v3“ sucht seinen Besitzer.",
  "Der Slush-Becher dreht sich heute 3 % schneller als erlaubt.",
  "{name} hat kurz aufgeschaut. Die Lage ist wieder ruhig.",
];
const QUOTES = [
  "Bin ich jetzt auf dem Beamer?!",
  "Kein Kommentar, bin im Match.",
  "Hauptsache Gulasch.",
  "Ich habe nichts gesehen. Ich war AFK.",
  "Das war schon immer so.",
];
/** How the next point of the program is announced. */
interface ProgramLook {
  rubric: string;
  glyph: string;
  remark: string;
  picture: NewsPicture;
}

/** Rubric, glyph, closing remark and picture of the next point of the program, by its kind. */
const PROGRAM: Record<string, ProgramLook> = {
  tournament: {
    rubric: "SPORT",
    glyph: "🏆",
    remark: "Die Arena füllt sich.",
    picture: "tournament",
  },
  food: { rubric: "KANTINE", glyph: "🍲", remark: "Großandrang erwartet.", picture: "food" },
  yoga: {
    rubric: "GESUNDHEIT",
    glyph: "🧘",
    remark: "Experten empfehlen, kurz aufzustehen.",
    picture: "yoga",
  },
  together: {
    rubric: "GESELLSCHAFT",
    glyph: "🎲",
    remark: "Verdächtige Aktivitäten erwartet.",
    picture: "together",
  },
  orga: { rubric: "DURCHSAGE", glyph: "📣", remark: "Bitte beachten.", picture: "orga" },
};
const NEUTRAL_PROGRAM: ProgramLook = {
  rubric: "PROGRAMM",
  glyph: "📅",
  remark: "",
  picture: "program",
};
/** Kinds whose next point is urgent enough for red. */
const URGENT_KINDS = new Set(["orga", "tournament"]);

/** Fills the blanks of a line. */
function fill(line: string, blanks: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (_, blank: string) => String(blanks[blank] ?? ""));
}

/** Picks one of several lines. The same show picks the same one on every screen. */
function pick<Item>(items: readonly Item[], scene: NewsScene, salt: number): Item {
  return items[scramble(scene.seed ^ salt) % items.length] as Item;
}

/** Returns the name of a jelly, also of one that has left the room. */
function nameOf(scene: NewsScene, playerId: number | null): string {
  return scene.players.find((player) => player.id === playerId)?.name ?? SOMEBODY;
}

/** Returns those of the jellies that are in the room. */
function listPresent(scene: NewsScene, playerIds: number[]): number[] {
  return playerIds.filter((id) => scene.players.some((player) => player.id === id));
}

/** Returns who reads the news, as the line under a studio report. */
function writeAnchor(scene: NewsScene): string {
  return scene.presenterId === null
    ? "IM STUDIO"
    : `IM STUDIO: ${nameOf(scene, scene.presenterId)}`;
}

/**
 * Picks a jelly the show does not name: the one whose scrambled ID is the smallest. It stays the
 * same when others leave, unlike a pick by position.
 */
function pickBystander(scene: NewsScene, salt: number): StagePlayer | null {
  const rank = (player: StagePlayer) => scramble(scene.seed ^ salt ^ scramble(player.id));
  const free = scene.players.filter((player) => !scene.named.has(player.id));
  return free.reduce<StagePlayer | null>(
    (best, player) => (best && rank(best) <= rank(player) ? best : player),
    null,
  );
}

/** Reports whether it is night on this screen. */
function isNight(scene: NewsScene): boolean {
  return scene.hour >= NIGHT.from || scene.hour < NIGHT.until;
}

/** The opening and the closing. */
function writeFrame(isIntro: boolean, scene: NewsScene): NewsCard {
  const greeting = isNight(scene) ? "Gute Nacht" : scene.hour < 11 ? "Guten Morgen" : "Guten Tag";
  const headline = isIntro
    ? `${greeting}. Hier sind die Jelly-News.`
    : "Das waren die Jelly-News. Zurück in die Halle.";
  return { ...STUDIO, rubric: CHANNEL, glyph: "📺", headline, sub: writeAnchor(scene) };
}

/** The report about one achievement. Secret ones do not reveal themselves. */
function writeAchievement(playerId: number, key: string, scene: NewsScene): NewsCard {
  const title = scene.catalog.achievements.find((entry) => entry.key === key)?.title;
  const usual = pick(ACHIEVEMENT_LINES, scene, playerId);
  const line = title ? (SPECIAL_LINES[key] ?? usual) : usual;
  const blanks = { name: nameOf(scene, playerId), title: title ?? SECRET_TITLE };
  return {
    ...STUDIO,
    rubric: "AUSZEICHNUNG",
    picture: "award",
    glyph: "🏅",
    headline: fill(line, blanks),
    sub: title ?? SECRET_TITLE,
    playerIds: listPresent(scene, [playerId]),
  };
}

/** The report about the tallest tower, with its jellies from the bottom to the top. */
function writeStack(memberIds: number[], scene: NewsScene): NewsCard {
  return {
    ...STUDIO,
    rubric: "BAUAMT",
    picture: "tower",
    glyph: "🗼",
    headline: fill(pick(STACK_LINES, scene, 1), { count: memberIds.length }),
    sub: memberIds.map((id) => nameOf(scene, id)).join(", "),
    figure: String(memberIds.length),
    playerIds: listPresent(scene, memberIds),
  };
}

/** The next point of the program. Unknown kinds are announced neutrally. */
function writeNext(item: StageScheduleItem, scene: NewsScene): NewsCard {
  const { rubric, glyph, remark, picture } = PROGRAM[item.kind] ?? NEUTRAL_PROGRAM;
  const time = scene.formatTime(item.starts_at);
  return {
    ...STUDIO,
    rubric,
    glyph,
    headline: `Um ${time} Uhr: ${item.title}. ${remark}`.trim(),
    sub: item.detail ?? writeAnchor(scene),
    figure: time,
    isUrgent: URGENT_KINDS.has(item.kind),
    picture,
  };
}

/** The weather of the hall, at night the one of outer space. */
function writeWeather(scene: NewsScene): NewsCard {
  const headline = pick(isNight(scene) ? NIGHT_WEATHER_LINES : WEATHER_LINES, scene, 2);
  const picture = isNight(scene) ? "weather-night" : "weather";
  return { ...STUDIO, rubric: "RAUMKLIMA", glyph: "🌦", headline, sub: "DIE AUSSICHTEN", picture };
}

/** A short report about nothing, with a jelly that happens to be there. */
function writeReport(scene: NewsScene): NewsCard | null {
  const witness = pickBystander(scene, 3);
  if (!witness) return null;
  const line = pick(REPORT_LINES, scene, 4);
  return {
    ...STUDIO,
    rubric: "KURZ GEMELDET",
    picture: "report",
    glyph: "📰",
    headline: fill(line, { name: witness.name }),
    sub: "AUS DER HALLE",
    // A report that names nobody films nobody.
    playerIds: line.includes("{name}") ? [witness.id] : [],
    isLive: line.includes("{name}"),
  };
}

/** A voice from the hall: a bystander says something that does not help. */
function writeInterview(scene: NewsScene): NewsCard | null {
  const voice = pickBystander(scene, 5);
  if (!voice) return null;
  return {
    ...STUDIO,
    rubric: "STIMMEN AUS DER HALLE",
    picture: "interview",
    glyph: "🎤",
    headline: `„${pick(QUOTES, scene, 6)}“`,
    sub: `LIVE AUS DER HALLE: ${voice.name}`,
    playerIds: [voice.id],
    isLive: true,
  };
}

/** How many jellies look for players, by the sign most of them hold. */
function writeSigns(scene: NewsScene): NewsCard | null {
  const counts = new Map<string, number>();
  for (const { sign } of scene.players) {
    if (sign) counts.set(sign, (counts.get(sign) ?? 0) + 1);
  }
  const [key, count] = [...counts].sort((first, second) => second[1] - first[1])[0] ?? [];
  const label = scene.catalog.signs.find((sign) => sign.key === key)?.label;
  if (!label || !count) return null;
  return {
    ...STUDIO,
    rubric: "MITSPIELER-BÖRSE",
    picture: "signs",
    glyph: "🪧",
    headline: `${count} ${count === 1 ? "Jelly hält" : "Jellies halten"} gerade das Schild „${label}“.`,
    sub: "DER MARKT IM ÜBERBLICK",
    figure: String(count),
    playerIds: scene.players.filter((player) => player.sign === key).map((player) => player.id),
    isLive: true,
  };
}

/** Who stands with whom. */
function writeGossip(scene: NewsScene): NewsCard | null {
  const pairs = scene.players.filter((player) => player.follow);
  const fan = pairs.length > 0 ? pick(pairs, scene, 7) : null;
  if (!fan?.follow) return null;
  const idol = nameOf(scene, fan.follow.player_id);
  return {
    ...STUDIO,
    rubric: "KLATSCH",
    picture: "gossip",
    glyph: "👀",
    headline: `Auf frischer Tat ertappt: ${fan.name} steht bei ${idol}.`,
    sub: "BEIDE SCHWEIGEN",
    playerIds: listPresent(scene, [fan.id, fan.follow.player_id]),
    isLive: true,
  };
}

/** Who wears the hat of the wizard. */
function writeHat(scene: NewsScene): NewsCard | null {
  const thief = scene.players.find((player) => player.equipped.head?.key === WIZARD_HAT);
  if (!thief) return null;
  return {
    ...STUDIO,
    rubric: "KRIMINALITÄT",
    picture: "hat",
    glyph: "🎩",
    headline: `Funkelbarts Hut gesichtet: auf dem Kopf von ${thief.name}.`,
    sub: "DER ZAUBERER ERMITTELT",
    playerIds: [thief.id],
    isLive: true,
  };
}

/** The reports the color slot can show. The weather always works. */
const EXTRAS = [writeHat, writeGossip, writeInterview, writeSigns, writeReport, writeWeather];

/** The color slot: the show picks where to start, and the first report that has something wins. */
function writeExtra(scene: NewsScene): NewsCard {
  const first = scramble(scene.seed ^ 8) % EXTRAS.length;
  for (let step = 0; step < EXTRAS.length; step++) {
    const card = EXTRAS[(first + step) % EXTRAS.length]?.(scene);
    if (card) return card;
  }
  return writeWeather(scene);
}

/** Writes the card of a report. Jellies that left and things it does not know get neutral words. */
export function writeCard(beat: NewsBeat, scene: NewsScene): NewsCard {
  switch (beat.kind) {
    case "intro":
      return writeFrame(true, scene);
    case "outro":
      return writeFrame(false, scene);
    case "top_xp":
      return {
        ...STUDIO,
        rubric: "FLEISS-REKORD",
        picture: "xp",
        glyph: "⚡",
        headline: fill(pick(TOP_XP_LINES, scene, 9), {
          name: nameOf(scene, beat.playerId),
          xp: beat.xp,
        }),
        sub: writeAnchor(scene),
        figure: `${beat.xp} XP`,
        playerIds: listPresent(scene, [beat.playerId]),
      };
    case "achievement":
      return writeAchievement(beat.playerId, beat.key, scene);
    case "stack":
      return writeStack(beat.memberIds, scene);
    case "next":
      return writeNext(beat.item, scene);
    case "extra":
      return writeExtra(scene);
  }
}

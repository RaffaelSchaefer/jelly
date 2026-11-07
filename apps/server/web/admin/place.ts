/**
 * Where the page stands: the chosen LAN and section, kept in the address so that a reload stays.
 * The address looks like `#lan-3/spieler`, or `#neu` for the form of a new LAN.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import type { Section } from "./lanContext.ts";

const HASH_NEW = "#neu";
const HASH_LAN_PREFIX = "#lan-";

/** One entry of the navigation: its part of the address, its name and a short name for phones. */
export interface SectionEntry {
  section: Section;
  hash: string;
  text: string;
  shortText: string;
}

/** Names the sections in the order of the navigation. The workshop comes last, apart. */
export function listSections(): SectionEntry[] {
  return [
    { section: "overview", hash: "uebersicht", text: "Übersicht", shortText: "Start" },
    { section: "players", hash: "spieler", text: "Spieler", shortText: "Spieler" },
    { section: "actions", hash: "aktionen", text: "Aktionen", shortText: "Aktionen" },
    { section: "room", hash: "hallenplan", text: "Hallenplan", shortText: "Halle" },
    { section: "settings", hash: "einstellungen", text: "Einstellungen", shortText: "LAN" },
    { section: "workshop", hash: "werkstatt", text: "Werkstatt", shortText: "Test" },
  ];
}

/** The chosen LAN, or the form of a new one, with the section. */
export interface Place {
  lanID: number | "new";
  section: Section;
}

/** Prefers the running LAN, then the next one, then the last one. */
export function findCurrentLAN(lans: LANSummary[], now: number): LANSummary | undefined {
  const coming = lans
    .filter((lan) => now < lan.ends_at)
    .sort((left, right) => left.starts_at - right.starts_at);
  return coming[0] ?? lans.at(-1);
}

/** Reads the place from an address. Unknown LANs and sections fall back to the current LAN. */
export function readPlace(hash: string, lans: LANSummary[], now: number): Place {
  const current = findCurrentLAN(lans, now);
  if (hash === HASH_NEW || current === undefined) {
    return { lanID: "new", section: "overview" };
  }
  const [lanPart = "", sectionPart = ""] = hash.slice(HASH_LAN_PREFIX.length).split("/");
  const lanID = Number(lanPart);
  const isKnownLAN = hash.startsWith(HASH_LAN_PREFIX) && lans.some((lan) => lan.id === lanID);
  const entry = listSections().find((candidate) => candidate.hash === sectionPart);
  return { lanID: isKnownLAN ? lanID : current.id, section: entry?.section ?? "overview" };
}

/** Writes a place as an address. */
export function writePlace(place: Place): string {
  if (place.lanID === "new") {
    return HASH_NEW;
  }
  const entry = listSections().find((candidate) => candidate.section === place.section);
  return `${HASH_LAN_PREFIX}${place.lanID}/${entry?.hash ?? ""}`;
}

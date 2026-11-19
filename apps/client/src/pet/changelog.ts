/**
 * Der Changelog im Update-Hinweis. Der Release-Lauf legt die `CHANGELOG.md` des Clients als `notes`
 * in `latest.json`, hier bleibt davon, was seit der installierten Version dazukam.
 *
 * Format: je Version eine Überschrift `## 0.3.0`, die neueste oben. Darunter Listenzeilen, die mit
 * `Neu:`, `Besser:` oder `Weg:` beginnen.
 *
 * @module
 */

/** Art eines Eintrags. */
export type ChangeKind = "neu" | "besser" | "weg";

/** Ein Eintrag im Changelog. Ohne bekannte Art (`kind: null`) zeigt er nur seinen Text. */
export interface ChangeEntry {
  version: string;
  kind: ChangeKind | null;
  text: string;
}

const KINDS: Record<string, ChangeKind> = { neu: "neu", besser: "besser", weg: "weg" };

/** Zahlen einer Version, ein Anhang wie `-alpha.1` zählt nicht. */
const versionParts = (version: string) =>
  version
    .split("-")[0]
    .split(".")
    .map((part) => Number(part) || 0);

/** Ob `a` neuer als `b` ist, Teil für Teil als Zahl (`0.10.0` ist neuer als `0.9.0`). */
export function isNewerVersion(a: string, b: string) {
  const [left, right] = [versionParts(a), versionParts(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

/** Trennt `Neu: Text` in Art und Text. Unbekannte Arten bleiben Teil des Textes. */
function splitKind(text: string): Pick<ChangeEntry, "kind" | "text"> {
  const match = /^(\p{L}+):\s*(.+)$/u.exec(text);
  const kind = match ? KINDS[match[1].toLowerCase()] : undefined;
  return kind && match ? { kind, text: match[2] } : { kind: null, text };
}

/** Alle Einträge der Versionen nach `current`, in der Reihenfolge der Datei. */
export function changelogSince(notes: string | null, current: string): ChangeEntry[] {
  const entries: ChangeEntry[] = [];
  let version: string | null = null;
  for (const line of (notes ?? "").split("\n").map((raw) => raw.trim())) {
    const heading = /^##\s+v?(\S+)/.exec(line);
    if (heading) {
      version = heading[1];
      continue;
    }
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item && version !== null && isNewerVersion(version, current)) {
      entries.push({ version, ...splitKind(item[1]) });
    }
  }
  return entries;
}

/**
 * Names what a zone is used for. Pure data, without DOM.
 *
 * @module
 */

/** The kinds of the server with a name for the organizers, in the order of the dropdown. */
export function listZoneKinds(): [kind: string, text: string][] {
  return [
    ["seats", "Sitzplätze"],
    ["stage", "Bühne"],
    ["lounge", "Lounge"],
    ["visitors", "Besucher"],
    ["queue", "Anstellen an der Theke"],
    ["public", "Public Gaming"],
    ["spectators", "Zuschauer"],
    ["winner", "Sieger"],
    ["none", "Keine, nur Deko oder Hindernis"],
  ];
}

/** Whether jellies belong to a zone of this kind, so that an admin can put players there. */
export function isStandingKind(kind: string): boolean {
  return ["seats", "stage", "lounge", "visitors"].includes(kind);
}

/** Names a zone: its name, else its ID in the map file, else its number. */
export function nameZone(zone: { id: number; name: string; map_id: string }): string {
  return zone.name || zone.map_id || `Zone ${zone.id}`;
}

import { describe, expect, it } from "vitest";

import { PET_COLORS } from "./colors";
import { hatchBack, hatchesNew, hatchLine, hatchStep, needsCode, type HatchMoment } from "./hatch";
import { PREVIEW_GAME, PREVIEW_ME, previewAccess, previewGame } from "./preview";

/** Ein neuer Spieler mitten in einer laufenden LAN. */
const fresh = { ...PREVIEW_GAME, me: null };

/** Was das Jelly in diesem Moment sagt. */
function line(moment: Partial<HatchMoment>) {
  return hatchLine({
    step: "name",
    game: fresh,
    name: "",
    picked: null,
    error: "",
    accepted: false,
    ...moment,
  });
}

describe("needsCode", () => {
  it("verlangt ohne Konto immer einen Code, auch ohne laufende LAN", () => {
    expect(needsCode(fresh)).toBe(true);
    expect(needsCode(previewGame("#join-nolan"))).toBe(true);
  });

  it("verlangt von einem Konto den Code der laufenden LAN", () => {
    expect(needsCode(previewGame("#join-again"))).toBe(true);
  });

  it("verlangt nichts, wenn es schon dabei ist oder keine LAN läuft", () => {
    expect(needsCode(PREVIEW_GAME)).toBe(false);
    const { lan } = previewGame("#join-nolan");
    expect(needsCode({ me: PREVIEW_ME, lan: { ...lan, joined: null } })).toBe(false);
  });
});

describe("hatchesNew", () => {
  it("legt ohne Konto oder mit abgelehntem Secret ein neues an", () => {
    expect(hatchesNew(fresh)).toBe(true);
    expect(hatchesNew({ me: PREVIEW_ME, secretRejected: true })).toBe(true);
    expect(hatchesNew({ me: PREVIEW_ME, secretRejected: false })).toBe(false);
  });
});

describe("hatchStep", () => {
  it("führt ein bekanntes Jelly immer direkt zum Code", () => {
    expect(hatchStep("name", PREVIEW_GAME)).toBe("code");
    expect(hatchStep("recover", PREVIEW_GAME)).toBe("code");
  });

  it("lässt ein neues Jelly dort, wo es hinwollte", () => {
    expect(hatchStep("color", fresh)).toBe("color");
    expect(hatchStep("recover", fresh)).toBe("recover");
  });
});

describe("hatchBack", () => {
  it("geht bei einem neuen Jelly Schritt für Schritt zurück", () => {
    expect(hatchBack("name", fresh)).toBeNull();
    expect(hatchBack("color", fresh)).toBe("name");
    expect(hatchBack("code", fresh)).toBe("color");
    expect(hatchBack("recover", fresh)).toBe("name");
  });

  it("hat bei einem bekannten Jelly nichts dahinter", () => {
    expect(hatchBack("code", PREVIEW_GAME)).toBeNull();
  });
});

describe("hatchLine", () => {
  it("fragt zuerst nach dem Namen", () => {
    expect(line({})).toBe("Hey, ich bin neu hier. Wie heiße ich?");
  });

  it("nennt beim abgelehnten Secret beide Wege", () => {
    const lost = line({ game: previewGame("#join-lost") });
    expect(lost).toContain("Neu anfangen");
    expect(lost).toContain("Konto zurückholen");
  });

  it("freut sich über den Namen und jede Farbe anders", () => {
    expect(line({ step: "color", name: "Glibber" })).toContain("Glibber!");
    for (const picked of ["mint", "lilac", "peach"] as const) {
      expect(line({ step: "color", picked })).toContain(PET_COLORS[picked].label);
    }
  });

  it("nennt die LAN, zu der der Code gehört", () => {
    expect(line({ step: "code" })).toContain("Vorschau-LAN");
  });

  it("begrüßt ein bekanntes Jelly mit Namen", () => {
    const code = line({ step: "code", game: previewGame("#join-again") });
    expect(code).toContain(`Schön, dich zu sehen, ${PREVIEW_ME.name}!`);
    expect(code).toContain("Code für deinen Platz");
  });

  it("bestätigt einen gültigen Code, wenn die LAN noch einen eigenen verlangt", () => {
    const code = line({ step: "code", game: previewGame("#join-again"), accepted: true });
    expect(code).toBe("Der Code gilt! Für Vorschau-LAN brauchst du noch einen eigenen.");
  });

  it("nennt ohne laufende LAN die nächste", () => {
    const code = line({ step: "code", game: previewGame("#join-nolan") });
    expect(code).toContain("Gerade läuft keine LAN.");
    expect(code).toContain("Die nächste: Vorschau-LAN 2 ab 16.04.,");
  });

  it("vertröstet, wenn auch keine nächste LAN feststeht", () => {
    const { lan } = previewGame("#join-nolan");
    const code = line({ step: "code", game: { ...fresh, lan: { ...lan, next: null } } });
    expect(code).toContain("Schau später wieder vorbei.");
  });

  it("erklärt den Wiederherstellungs-Code", () => {
    expect(line({ step: "recover" })).toContain("Er gilt einmal");
  });

  it("lässt jede Fehlermeldung vorgehen", () => {
    expect(line({ step: "code", error: "Dieser Code gilt nicht." })).toBe(
      "Dieser Code gilt nicht.",
    );
  });
});

describe("previewGame", () => {
  it("bleibt ohne bekannten Hash beim normalen Stand", () => {
    expect(previewGame("")).toBe(PREVIEW_GAME);
    expect(previewGame("#levelup")).toBe(PREVIEW_GAME);
  });

  it("startet jeden Hash im passenden Zustand", () => {
    expect(previewGame("#join").me).toBeNull();
    expect(previewGame("#join-again").lan.joined).toBe(false);
    expect(previewGame("#join-lost").secretRejected).toBe(true);
    expect(previewGame("#join-nolan").lan.current).toBeNull();
  });
});

describe("previewAccess", () => {
  it("legt mit Name und Farbe ein Jelly an", async () => {
    const { game, seatAssigned } = await previewAccess("abc", "Glibber", "peach");
    expect(game.me).toMatchObject({ name: "Glibber", color: "peach" });
    expect(seatAssigned).toBe(true);
  });

  it("behält ohne Name das vorhandene Jelly", async () => {
    const { game } = await previewAccess("abc");
    expect(game.me).toEqual(PREVIEW_ME);
  });

  it("lässt mit dem Probe-Code die laufende LAN offen", async () => {
    const { game } = await previewAccess("offen");
    expect(needsCode(game)).toBe(true);
  });

  it("lehnt den Probe-Code ab", async () => {
    await expect(previewAccess("falsch")).rejects.toBe("Dieser Code gilt nicht.");
  });
});

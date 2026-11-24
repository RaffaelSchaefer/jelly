import { expect, it, vi } from "vitest";

import { createDesktopSource } from "./source";

const backend = vi.hoisted(() => ({
  onStageEvent: vi.fn(),
  onStageMove: vi.fn(),
  onStreamReset: vi.fn(),
  getSettings: vi.fn(),
  getMapState: vi.fn(),
  getCatalog: vi.fn(),
}));
vi.mock("../backend", () => backend);

/** Der optimierte Modus ist an, alles andere steht auf dem Standard. */
const OPTIMIZED = { reducedMotion: true, optimizedRendering: true, frameLimit: 30 };

it("kennt die Einstellungen auch, wenn die Bühne ohne laufende LAN nicht zu lesen ist", async () => {
  backend.getSettings.mockResolvedValue(OPTIMIZED);
  backend.getMapState.mockRejectedValue("Gerade läuft keine LAN.");
  const source = await createDesktopSource();

  await expect(source.readState()).rejects.toBe("Gerade läuft keine LAN.");

  expect(source.readOwn()).toMatchObject({ id: null, ...OPTIMIZED });
});

it("kennt die Einstellungen auch, wenn schon der Katalog scheitert", async () => {
  backend.getSettings.mockResolvedValue(OPTIMIZED);
  backend.getCatalog.mockRejectedValue("Server nicht erreichbar");
  const source = await createDesktopSource();

  await expect(source.readCatalog()).rejects.toBe("Server nicht erreichbar");

  expect(source.readOwn()).toMatchObject(OPTIMIZED);
});

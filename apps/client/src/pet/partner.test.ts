import { describe, expect, it } from "vitest";

import { classifyInvite, partnerClock, type PartnerInvite } from ".";

describe("Partner-Uhr", () => {
  it("läuft leer und drängt erst im letzten Viertel", () => {
    expect(partnerClock(120_000, 120_000)).toEqual({ left: 1, urgent: false });
    expect(partnerClock(60_000, 120_000)).toEqual({ left: 0.5, urgent: false });
    expect(partnerClock(30_000, 120_000)).toEqual({ left: 0.25, urgent: true });
  });

  it("bleibt bei Abweichungen der Uhr im Bereich", () => {
    expect(partnerClock(130_000, 120_000).left).toBe(1);
    expect(partnerClock(-5_000, 120_000).left).toBe(0);
  });
});

describe("Aufforderungen", () => {
  const invite: PartnerInvite = {
    id: 3,
    key: "hop",
    from_id: 1,
    partner_ids: [2],
    state: "pending",
    expires_at: 120_000,
  };

  it("unterscheidet eigene von eingehenden", () => {
    expect(classifyInvite(invite, 1)).toEqual({ role: "mine", invite });
    expect(classifyInvite(invite, 2)).toEqual({ role: "incoming", invite });
  });

  it("übergeht fremde und alles, was keine Aufforderung ist", () => {
    expect(classifyInvite(invite, 9)).toBeNull();
    expect(classifyInvite(invite)).toBeNull();
    expect(classifyInvite(null, 1)).toBeNull();
    expect(classifyInvite({ id: 3 }, 1)).toBeNull();
  });
});

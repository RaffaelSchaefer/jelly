import { describe, expect, it } from "vitest";

import { classifyInvite, type PartnerInvite } from ".";

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

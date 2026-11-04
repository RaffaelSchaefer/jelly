/**
 * Panel „XP und Fortschritt“ mit seinen drei Reitern.
 *
 * @module
 */

import type { Pet, Report } from "../pet";

import { desktop } from "../backend";
import { Tabs } from "../ui";
import AchievementsTab from "./AchievementsTab";
import CosmeticsTab from "./CosmeticsTab";
import OverviewTab from "./OverviewTab";

/** ID eines XP-Reiters. */
export type XpTab = "overview" | "cosmetics" | "achievements";

/** Die Reiter mit Beschriftung und der Panel-Überschrift, die sie setzen. */
export const XP_TABS: { id: XpTab; label: string; title: string }[] = [
  { id: "overview", label: "Übersicht", title: "Ein Stück LAN für dein Pet." },
  { id: "cosmetics", label: "Cosmetics", title: "Schick machen." },
  { id: "achievements", label: "Erfolge", title: "Was ihr schon geschafft habt." },
];

/** Reiterleiste und der Inhalt des gewählten Reiters. Den Reiter selbst hält `App.tsx`. */
export default function XpPanel({
  pet,
  tab,
  ready,
  busy,
  onTab,
  onReport,
  onEquip,
}: {
  pet: Pet;
  tab: XpTab;
  ready: boolean;
  busy: boolean;
  onTab: (tab: XpTab) => void;
  onReport: (action: Report) => void;
  onEquip: (id: string | null) => void;
}) {
  return (
    <>
      <Tabs label="Bereiche" tabs={XP_TABS} value={tab} onChange={onTab} />
      {tab === "overview" ? (
        <OverviewTab pet={pet} disabled={!desktop || !ready || busy} onReport={onReport} />
      ) : null}
      {tab === "cosmetics" ? (
        <CosmeticsTab pet={pet} disabled={busy || !ready} onEquip={onEquip} />
      ) : null}
      {tab === "achievements" ? <AchievementsTab pet={pet} /> : null}
      {!desktop && tab === "overview" ? (
        <p className="panel-note">Melden geht in der Desktop-App.</p>
      ) : null}
    </>
  );
}

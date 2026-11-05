/**
 * Panel „XP und Fortschritt“ mit seinen drei Reitern.
 *
 * @module
 */

import type { Catalog, Me, Report, Rules } from "../pet";

import { desktop } from "../backend";
import { Tabs } from "../ui";
import AchievementsTab from "./AchievementsTab";
import OverviewTab from "./OverviewTab";
import RedeemTab from "./RedeemTab";

/** ID eines XP-Reiters. */
export type XpTab = "overview" | "achievements" | "redeem";

/** Die Reiter mit Beschriftung und der Panel-Überschrift, die sie setzen. */
export const XP_TABS: { id: XpTab; label: string; title: string }[] = [
  { id: "overview", label: "Übersicht", title: "Ein Stück LAN für dein Pet." },
  { id: "achievements", label: "Erfolge", title: "Was ihr schon geschafft habt." },
  { id: "redeem", label: "Einlösen", title: "Code gefunden? Her damit." },
];

/** Reiterleiste und der Inhalt des gewählten Reiters. Den Reiter selbst hält `App.tsx`. */
export default function XpPanel({
  me,
  catalog,
  rules,
  offset,
  tab,
  disabled,
  onTab,
  onReport,
  onRedeem,
}: {
  me: Me;
  catalog: Catalog;
  rules: Rules;
  offset: number;
  tab: XpTab;
  disabled: boolean;
  onTab: (tab: XpTab) => void;
  onReport: (action: Report) => void;
  onRedeem: (code: string) => Promise<boolean>;
}) {
  return (
    <>
      <Tabs label="Bereiche" tabs={XP_TABS} value={tab} onChange={onTab} />
      {tab === "overview" ? (
        <OverviewTab
          {...{ me, catalog, rules, offset, onReport }}
          disabled={!desktop || disabled}
        />
      ) : null}
      {tab === "achievements" ? <AchievementsTab me={me} catalog={catalog} /> : null}
      {tab === "redeem" ? <RedeemTab me={me} disabled={disabled} onRedeem={onRedeem} /> : null}
      {!desktop && tab === "overview" ? (
        <p className="panel-note">Melden geht in der Desktop-App.</p>
      ) : null}
    </>
  );
}

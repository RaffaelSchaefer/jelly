/**
 * Panel „Dabei“ mit seinen zwei Reitern: zu einem anderen Jelly stellen und Partner-Emotes.
 *
 * @module
 */

import type { Me } from "../pet";
import type { PetGame } from "../usePet";

import { Tabs } from "../ui";
import FollowTab from "./FollowTab";
import PartnerTab from "./PartnerTab";

/** ID eines Reiters im Panel „Dabei“. */
export type PeopleTab = "follow" | "partner";

/** Die Reiter mit Beschriftung und der Panel-Überschrift, die sie setzen. */
export const PEOPLE_TABS: { id: PeopleTab; label: string; title: string }[] = [
  { id: "follow", label: "Dazustellen", title: "Zu wem stellst du dich?" },
  { id: "partner", label: "Partner-Emote", title: "Zusammen was machen?" },
];

/** Reiterleiste und der Inhalt des gewählten Reiters. Den Reiter selbst hält `App.tsx`. */
export default function PeoplePanel({
  game,
  me,
  tab,
  onTab,
}: {
  game: PetGame;
  me: Me;
  tab: PeopleTab;
  onTab: (tab: PeopleTab) => void;
}) {
  return (
    <>
      <Tabs label="Dabei" tabs={PEOPLE_TABS} value={tab} onChange={onTab} />
      {tab === "follow" ? (
        <FollowTab
          me={me}
          players={game.players}
          allowed={game.followAllowed}
          disabled={game.followDisabled}
          onLoad={game.loadPlayers}
          onPick={game.setFollow}
        />
      ) : (
        <PartnerTab
          entries={game.catalog.partner_emotes}
          sent={game.sent}
          players={game.players}
          offset={game.offset}
          allowed={game.partnerAllowed}
          disabled={game.partnerDisabled}
          onLoad={game.loadPlayers}
          onInvite={game.invite}
          onCancel={game.cancelInvite}
        />
      )}
    </>
  );
}

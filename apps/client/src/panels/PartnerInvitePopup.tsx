/**
 * Die Aufforderung eines anderen Jellys zu einem Partner-Emote: Wer, was und zwei Knöpfe.
 *
 * @module
 */

import type { IncomingInvite } from "../usePartnerEmote";

import { Panel, PrimaryButton } from "../ui";

/** Das Panel über dem Dock, solange eine Aufforderung offen ist. */
export default function PartnerInvitePopup({
  incoming,
  disabled,
  onAnswer,
}: {
  incoming: IncomingInvite;
  disabled: boolean;
  onAnswer: (accepted: boolean) => void;
}) {
  return (
    <Panel title={`${incoming.fromName} fragt dich.`}>
      <p className="panel-hint" role="status">
        {incoming.label}?
      </p>
      <div className="report-grid">
        <button className="secondary-button" disabled={disabled} onClick={() => onAnswer(false)}>
          Lieber nicht
        </button>
        <PrimaryButton disabled={disabled} onClick={() => onAnswer(true)}>
          Mitmachen
        </PrimaryButton>
      </div>
    </Panel>
  );
}

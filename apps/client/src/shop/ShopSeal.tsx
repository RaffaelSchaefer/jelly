/**
 * Das Siegel-Feld neben der Rolle: das gewählte Teil und ein Wachssiegel, das es kauft, anlegt oder
 * wieder ablegt. Geht es gerade nicht, steht darunter, warum. Was der Zauberer dazu sagt, kommt aus
 * `useWizard.ts`.
 *
 * @module
 */

import type { ShopControls } from "./useShop";
import type { WizardControls } from "./useWizard";

import { coinLabel, type Me, type ShopItem } from "../pet";
import { Icon, type IconName } from "../ui";
import { isWorn } from "./ShopLedger";

/** Was unter dem Siegel steht, solange das Teil noch nicht gekauft ist. */
function buyHint(item: ShopItem, open: boolean, perLevel: number) {
  if (!open) return "Münzen gibt es nur während einer LAN.";
  if (item.state === "short") {
    return perLevel > 0 ? `Jeder Level-Aufstieg bringt ${coinLabel(perLevel)}.` : "";
  }
  return item.perLan ? "Gilt nur für diese LAN." : "Gehört dir danach für immer.";
}

/** Das Wachssiegel. `wax` färbt es: rot zum Kaufen, grün zum Anlegen, grau zum Ablegen. */
function Seal({
  icon,
  label,
  wax,
  disabled,
  sound,
  onPress,
}: {
  icon: IconName;
  label: string;
  wax: "buy" | "wear" | "off";
  disabled: boolean;
  sound: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="seal"
      data-wax={wax}
      data-sound={sound}
      disabled={disabled}
      onClick={onPress}
    >
      <span className="seal-wax" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="seal-label">{label}</span>
    </button>
  );
}

/** Eigenschaften der Knöpfe und des Felds. */
interface SealProps {
  shop: ShopControls;
  wizard: WizardControls;
  me: Me;
  item: ShopItem;
}

/** Kaufen, solange das Teil noch nicht dem Jelly gehört. */
function BuySeal({ shop, wizard, item }: SealProps) {
  const short = item.state === "short";
  return (
    <>
      <Seal
        icon="coin"
        wax="buy"
        sound="coin"
        label={short ? `Noch ${coinLabel(item.missing)}` : `Für ${coinLabel(item.price)} kaufen`}
        disabled={short || !shop.open || shop.busy || !shop.ready}
        onPress={async () => {
          if (await shop.purchase(item)) wizard.say({ kind: "bought", item });
        }}
      />
      <small className="seal-hint">
        {buyHint(item, shop.open, shop.game.lan.rules.coins_per_level)}
      </small>
    </>
  );
}

/** Anlegen oder wieder ablegen, sobald es dem Jelly gehört. */
function WearSeal({ shop, wizard, me, item }: SealProps) {
  const worn = isWorn(me, item);
  const { id, slot } = item.cosmetic;
  return (
    <Seal
      icon={worn ? "close" : "check"}
      wax={worn ? "off" : "wear"}
      sound={worn ? "close" : "success"}
      label={worn ? "Ablegen" : "Anlegen"}
      disabled={shop.busy || !shop.ready}
      onPress={async () => {
        if (await shop.equip(slot, worn ? null : id)) {
          wizard.say({ kind: worn ? "off" : "worn", item });
        }
      }}
    />
  );
}

/** Das Feld. Ohne Wahl lädt es ein, ein Teil von der Rolle zu nehmen. */
export default function ShopSeal({
  item,
  ...props
}: Omit<SealProps, "item"> & { item: ShopItem | null }) {
  if (!item) {
    return (
      <section className="shop-seal" aria-label="Kaufen">
        <p className="seal-hint">Wähle ein Teil von der Rolle, {props.me.name} probiert es an.</p>
      </section>
    );
  }
  return (
    <section className="shop-seal" aria-label="Kaufen">
      <span className="seal-item" aria-hidden="true">
        <Icon name={item.cosmetic.icon} />
      </span>
      <h2>{item.cosmetic.name}</h2>
      {item.state === "owned" ? (
        <WearSeal {...props} item={item} />
      ) : (
        <BuySeal {...props} item={item} />
      )}
    </section>
  );
}

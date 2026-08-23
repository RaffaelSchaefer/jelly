import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";

const CONFIRM_ID = "joint:confirm";
const ABORT_ID = "joint:abort";
const TIMEOUT_MS = 120_000;

function buildRow(confirmLabel: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CONFIRM_ID)
      .setLabel(confirmLabel)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(ABORT_ID)
      .setLabel("Abbrechen")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

export async function confirmAction(
  interaction: ChatInputCommandInteraction,
  options: { prompt: string; confirmLabel: string },
): Promise<boolean> {
  await interaction.editReply({
    content: options.prompt,
    components: [buildRow(options.confirmLabel)],
  });
  const reply = await interaction.fetchReply();

  const selection = await new Promise<ButtonInteraction | null>((resolve) => {
    let settled = false;
    const done = (value: ButtonInteraction | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (component: ButtonInteraction) =>
        component.user.id === interaction.user.id &&
        [CONFIRM_ID, ABORT_ID].includes(component.customId),
      max: 1,
      time: TIMEOUT_MS,
    });

    collector.on("collect", (component) => done(component));
    collector.on("end", () => done(null));
  });

  if (!selection) {
    await interaction.editReply({
      content: "⏱️ Abgebrochen – keine Bestätigung erhalten. Es wurde nichts verändert.",
      components: [],
    });
    return false;
  }

  if (selection.customId === ABORT_ID) {
    await selection.update({
      content: "❌ Abgebrochen – es wurde nichts verändert.",
      components: [],
    });
    return false;
  }

  await selection.update({ content: "⏳ Wird ausgeführt …", components: [] });
  return true;
}

import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types";

export const command: Command = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Prüft, ob der Bot antwortet."),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ content: "🏓 Pong!" });
  },
};

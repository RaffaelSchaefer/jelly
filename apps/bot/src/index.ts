import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { registerCommands } from "./commands";
import type { Command } from "./commands/types";
import { env } from "./env";
import { startLobbySync } from "./lobby-sync";
import { ensureSuperuser, hasSuperuser } from "./pocketbase";
import { startEventRealtime } from "./realtime";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildScheduledEvents],
});

const commandCollection = new Collection<string, Command>();
registerCommands(commandCollection);

client.once(Events.ClientReady, async (ready) => {
  console.log(`[joint-bot] Eingeloggt als ${ready.user.tag}`);

  if (!hasSuperuser()) {
    console.warn(
      "[joint-bot] Keine PocketBase-Superuser-Credentials gesetzt – Schreib-Commands und Teilnehmer-Sync funktionieren nicht.",
    );
  } else {
    try {
      await ensureSuperuser();
      console.log(`[joint-bot] Mit PocketBase verbunden: ${env.pocketbaseUrl}`);
    } catch (error) {
      console.error("[joint-bot] Superuser-Login fehlgeschlagen:", error);
    }
  }

  await startEventRealtime(client);
  if (hasSuperuser()) {
    await startLobbySync(client);
  }
  console.log(
    env.guildId
      ? `[joint-bot] Server-Event-Sync aktiv (Guild ${env.guildId})`
      : "[joint-bot] Server-Event-Sync deaktiviert (kein DISCORD_GUILD_ID)",
  );
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const autocompleteCommand = commandCollection.get(interaction.commandName);
    await autocompleteCommand?.autocomplete?.(interaction).catch(() => {});
    return;
  }

  if (interaction.isButton()) {
    const owner = [...commandCollection.values()].find(
      (candidate) =>
        candidate.handleComponent && interaction.customId.startsWith(`${candidate.data.name}:`),
    );
    if (!owner?.handleComponent) return;

    try {
      await owner.handleComponent(interaction);
    } catch (error) {
      console.error(`[joint-bot] Fehler in Button ${interaction.customId}:`, error);
      const content = "Da ist etwas schiefgelaufen. 🤷";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content }).catch(() => {});
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commandCollection.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[joint-bot] Fehler in /${interaction.commandName}:`, error);

    const details =
      typeof error === "object" && error !== null && "response" in error
        ? JSON.stringify((error as { response?: { data?: unknown } }).response?.data ?? {})
        : "";

    const content = details
      ? `Da ist etwas schiefgelaufen:\n\`${details.slice(0, 500)}\``
      : "Da ist etwas schiefgelaufen. 🤷";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content }).catch(() => {});
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(env.discordToken);

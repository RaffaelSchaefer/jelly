import { REST, Routes } from "discord.js";
import { commands } from "./commands";
import { env } from "./env";

async function main(): Promise<void> {
  const rest = new REST().setToken(env.discordToken);
  const body = commands.map((command) => command.data.toJSON());

  if (env.guildId) {
    await rest.put(Routes.applicationGuildCommands(env.discordClientId, env.guildId), { body });
    console.log(`[joint-bot] ${body.length} Guild-Commands registriert (${env.guildId})`);
    return;
  }

  await rest.put(Routes.applicationCommands(env.discordClientId), { body });
  console.log(`[joint-bot] ${body.length} globale Commands registriert (kann bis zu 1h dauern)`);
}

main().catch((error) => {
  console.error("[joint-bot] Command-Registrierung fehlgeschlagen:", error);
  process.exit(1);
});

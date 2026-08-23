function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[joint-bot] Fehlende ENV-Variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

export const env = {
  discordToken: required("DISCORD_BOT_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  guildId: optional("DISCORD_GUILD_ID"),
  announceChannelId: optional("ANNOUNCE_CHANNEL_ID"),
  pocketbaseUrl: optional("POCKETBASE_URL") ?? "http://127.0.0.1:8090",
  superuserEmail: optional("POCKETBASE_SUPERUSER_EMAIL"),
  superuserPassword: optional("POCKETBASE_SUPERUSER_PASSWORD"),
};

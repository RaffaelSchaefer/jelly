import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
await client.login(process.env.DISCORD_BOT_TOKEN!);
await new Promise<void>((resolve) => {
  const h = (): void => resolve();
  client.once("ready", h);
  client.once("clientReady", h);
});
const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);

console.log("--- alle Scheduled Events (List-Endpoint) ---");
const all = await guild.scheduledEvents.fetch();
for (const [id, ev] of all) {
  console.log(`- ${id} "${ev.name}" status=${ev.status}`);
}
if (all.size === 0) console.log("(leer)");

console.log("--- Einzel-Fetch DelTest-A/B ---");
console.log("A:", await guild.scheduledEvents.fetch("x").catch(() => "n/a"));
client.destroy();

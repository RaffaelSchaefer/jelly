import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from "discord.js"
import { registerCommands } from "./commands"
import type { Command } from "./commands/types"
import { env } from "./env"
import { ensureSuperuser, hasSuperuser } from "./pocketbase"
import { startEventRealtime } from "./realtime"

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
})

const commandCollection = new Collection<string, Command>()
registerCommands(commandCollection)

client.once(Events.ClientReady, async (ready) => {
  console.log(`[joint-bot] Eingeloggt als ${ready.user.tag}`)

  if (!hasSuperuser()) {
    console.warn(
      "[joint-bot] Keine PocketBase-Superuser-Credentials gesetzt – Schreib-Commands (/event create) funktionieren nicht.",
    )
  } else {
    try {
      await ensureSuperuser()
      console.log(`[joint-bot] Mit PocketBase verbunden: ${env.pocketbaseUrl}`)
    } catch (error) {
      console.error("[joint-bot] Superuser-Login fehlgeschlagen:", error)
    }
  }

  await startEventRealtime(client)
})

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  const command = commandCollection.get(interaction.commandName)
  if (!command) return

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error(`[joint-bot] Fehler in /${interaction.commandName}:`, error)

    const details =
      typeof error === "object" && error !== null && "response" in error
        ? JSON.stringify((error as { response?: { data?: unknown } }).response?.data ?? {})
        : ""

    const content = details
      ? `Da ist etwas schiefgelaufen:\n\`${details.slice(0, 500)}\``
      : "Da ist etwas schiefgelaufen. 🤷"

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content }).catch(() => {})
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
    }
  }
})

client.login(env.discordToken)

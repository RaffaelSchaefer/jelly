import type { Collection } from "discord.js"
import type { Command } from "./types"
import { command as eventCommand } from "./event"
import { command as pingCommand } from "./ping"

export const commands: Command[] = [eventCommand, pingCommand]

export function registerCommands(collection: Collection<string, Command>): void {
  for (const command of commands) {
    collection.set(command.data.name, command)
  }
}

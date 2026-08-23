import type { Collection } from "discord.js";
import { autocomplete as eventAutocomplete, command as eventCommand } from "./event";
import { command as pingCommand } from "./ping";
import type { Command } from "./types";

const eventCommandWithAutocomplete: Command = {
  ...eventCommand,
  autocomplete: eventAutocomplete,
};

export const commands: Command[] = [eventCommandWithAutocomplete, pingCommand];

export function registerCommands(collection: Collection<string, Command>): void {
  for (const command of commands) {
    collection.set(command.data.name, command);
  }
}

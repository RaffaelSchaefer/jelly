import type { ChatInputCommandInteraction } from "discord.js"

export interface Command {
  readonly data: {
    readonly name: string
    toJSON(): unknown
  }
  execute(interaction: ChatInputCommandInteraction): Promise<void>
}

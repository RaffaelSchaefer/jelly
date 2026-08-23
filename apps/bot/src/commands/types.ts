import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";

export interface Command {
  readonly data: {
    readonly name: string;
    toJSON(): unknown;
  };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
  handleComponent?(interaction: ButtonInteraction): Promise<void>;
}

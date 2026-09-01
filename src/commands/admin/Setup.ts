import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { RenderSetup } from "../../builder/SetupPanel";

export default class Setup extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "setup",
            description: "Richtet Willkommen, Tickets, Notifier und Logging ein",
            category: Category.Admin,
            cooldown: 5,
            developerOnly: false,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guildId) return;

        const builder = RenderSetup(this.client, interaction.guild?.name);

        await interaction.reply(builder.toMessage({ ephemeral: true }));
    }
}

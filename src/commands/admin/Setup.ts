import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { RenderHub } from "../../builder/SetupPanel";

export default class Setup extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "setup",
            description: "Richtet alle Bereiche des Bots an einer Stelle ein",
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

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const view = await RenderHub(this.client, interaction.guildId);

        await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });
    }
}

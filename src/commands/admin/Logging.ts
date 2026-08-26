import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { NewPanelState, PanelStates, RenderPanel } from "../../builder/LoggingPanel";

export default class Logging extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "logging",
            description: "Richtet die Log-Kanäle für Serverereignisse ein",
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

        const targets = await this.client.loggingService.Targets(interaction.guildId);
        const state = NewPanelState(interaction.guildId, targets);
        const view = RenderPanel(this.client, state);

        const message = await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });

        PanelStates.set(message.id, state);
    }
}

import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { NewPanelState, PanelStates, RenderPanel } from "../../builder/NotifierPanel";

export default class Notifier extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "notifier",
            description: "Richtet Benachrichtigungen für YouTube und Twitch ein",
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

        const entries = await this.client.notifierService.List(interaction.guildId);
        const state = NewPanelState(interaction.guildId, entries);
        const view = RenderPanel(this.client, state);

        const message = await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });

        PanelStates.set(message.id, state);
    }
}

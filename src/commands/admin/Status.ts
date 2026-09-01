import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { NewPanelState, PanelStates, RenderPanel } from "../../builder/StatusPanel";

export default class Status extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "status",
            description: "Verwaltet die Status-Rotation des Bots",
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
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const service = this.client.statusService;
        const settings = await service.Settings();

        const state = NewPanelState(await service.Entries(), settings.interval, settings.enabled);
        const view = RenderPanel(this.client, state);

        const message = await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });

        PanelStates.set(message.id, state);
    }
}

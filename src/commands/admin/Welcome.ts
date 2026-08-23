import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { NewPanelState, PanelStates, RenderPanel } from "../../builder/WelcomePanel";

export default class Welcome extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "welcome",
            description: "Richtet die Willkommensnachricht und die Willkommenskarte ein",
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

        const config = await this.client.welcomeService.Get(interaction.guildId);
        const state = NewPanelState(interaction.guildId, config);
        const view = await RenderPanel(this.client, state);

        const message = await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });

        PanelStates.set(message.id, state);
    }
}

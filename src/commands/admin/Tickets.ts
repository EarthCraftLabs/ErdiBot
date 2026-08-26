import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { NewSetupState, RenderSetup, SetupStates } from "../../builder/TicketSetupPanel";

export default class Tickets extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "tickets",
            description: "Richtet das Ticket-System ein",
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

        const config = await this.client.ticketService.Config(interaction.guildId);
        const state = NewSetupState(interaction.guildId, config);
        const view = RenderSetup(this.client, state);

        const message = await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });

        SetupStates.set(message.id, state);
    }
}

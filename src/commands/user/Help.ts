import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { RenderHelp } from "../../builder/HelpPanel";

export default class Help extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "help",
            description: "Zeigt alle Befehle, die du benutzen darfst",
            category: Category.User,
            cooldown: 5,
            developerOnly: false,
        });

        this.data = new SlashCommandBuilder().setName(this.name).setDescription(this.description);
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const member = interaction.member as GuildMember | null;
        const builder = RenderHelp(this.client, member, interaction.user.id);

        await interaction.reply(builder.toMessage({ ephemeral: true }));
    }
}

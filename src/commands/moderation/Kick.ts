import {
    ChatInputCommandInteraction,
    GuildMember,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { Blocked } from "../../utils/permissions";
import logger from "../../utils/logger";

export default class Kick extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "kick",
            description: "Wirft ein Mitglied vom Server",
            category: Category.Moderation,
            cooldown: 3,
            developerOnly: false,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
            .addUserOption((option) =>
                option.setName("mitglied").setDescription("Wen soll ich rauswerfen?").setRequired(true)
            )
            .addStringOption((option) =>
                option.setName("grund").setDescription("Warum?").setMaxLength(400).setRequired(false)
            );
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const target = interaction.options.getMember("mitglied") as GuildMember | null;
        const reason = interaction.options.getString("grund") ?? "Kein Grund angegeben";

        if (!target) return this.Fail(interaction, "Diese Person ist nicht auf dem Server.");

        const blocked = Blocked(interaction.member as GuildMember, target);

        if (blocked) return this.Fail(interaction, blocked);
        if (!target.kickable) return this.Fail(interaction, "Discord lässt mich diese Person nicht rauswerfen.");

        try {
            await target.kick(`${interaction.user.tag}: ${reason}`);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            logger.error(`[Kick] ${target.user.tag} konnte nicht entfernt werden: ${normalized.message}`);

            return this.Fail(interaction, "Discord hat den Rauswurf abgelehnt.");
        }

        logger.info(`👢 ${target.user.tag} wurde von ${interaction.user.tag} gekickt: ${reason}`);

        await interaction.editReply(
            new ComponentV2Builder({ accentColor: "Orange" })
                .title("👢 | Rausgeworfen")
                .separator()
                .text(`**${target.user.tag}** ist weg - kann aber jederzeit wiederkommen.`)
                .list([`**Grund:** ${reason}`])
                .toMessage()
        );
    }

    private async Fail(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
        await interaction.editReply(
            new ComponentV2Builder({ accentColor: "Red" }).title("❌ | Nicht möglich").separator().text(text).toMessage()
        );
    }
}

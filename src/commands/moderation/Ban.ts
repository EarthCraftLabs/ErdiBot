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

const MAX_DELETE_DAYS = 7;
const DAY_IN_SECONDS = 86_400;

export default class Ban extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "ban",
            description: "Bannt ein Mitglied vom Server",
            category: Category.Moderation,
            cooldown: 3,
            developerOnly: false,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
            .addUserOption((option) =>
                option.setName("mitglied").setDescription("Wen soll ich bannen?").setRequired(true)
            )
            .addStringOption((option) =>
                option.setName("grund").setDescription("Warum?").setMaxLength(400).setRequired(false)
            )
            .addIntegerOption((option) =>
                option
                    .setName("nachrichten")
                    .setDescription("Nachrichten der letzten ... Tage löschen (0-7)")
                    .setMinValue(0)
                    .setMaxValue(MAX_DELETE_DAYS)
                    .setRequired(false)
            );
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const target = interaction.options.getMember("mitglied") as GuildMember | null;
        const user = interaction.options.getUser("mitglied", true);
        const reason = interaction.options.getString("grund") ?? "Kein Grund angegeben";
        const days = interaction.options.getInteger("nachrichten") ?? 0;

        // Wer nicht auf dem Server ist, lässt sich trotzdem bannen - dann greift nur die
        // Hierarchieprüfung nicht, weil es keine Rollen zu vergleichen gibt.
        if (target) {
            const blocked = Blocked(interaction.member as GuildMember, target);

            if (blocked) return this.Fail(interaction, blocked);
            if (!target.bannable) return this.Fail(interaction, "Discord lässt mich diese Person nicht bannen.");
        }

        try {
            await interaction.guild.bans.create(user.id, {
                reason: `${interaction.user.tag}: ${reason}`,
                deleteMessageSeconds: days * DAY_IN_SECONDS,
            });
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            logger.error(`[Ban] ${user.tag} konnte nicht gebannt werden: ${normalized.message}`);

            return this.Fail(interaction, "Discord hat den Bann abgelehnt.");
        }

        logger.info(`🔨 ${user.tag} wurde von ${interaction.user.tag} gebannt: ${reason}`);

        await interaction.editReply(
            new ComponentV2Builder({ accentColor: "Red" })
                .title("🔨 | Gebannt")
                .separator()
                .text(`**${user.tag}** hat den Server verlassen - unfreiwillig.`)
                .list([
                    `**Grund:** ${reason}`,
                    `**Nachrichten gelöscht:** ${days > 0 ? `letzte ${days} Tag(e)` : "keine"}`,
                ])
                .toMessage()
        );
    }

    private async Fail(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
        await interaction.editReply(
            new ComponentV2Builder({ accentColor: "Red" }).title("❌ | Nicht möglich").separator().text(text).toMessage()
        );
    }
}

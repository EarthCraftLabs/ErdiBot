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
import { ParseDuration } from "../../utils/duration";
import logger from "../../utils/logger";

// Discords Obergrenze für eine Auszeit.
const MAX_TIMEOUT = 28 * 86_400_000;

const RELEASE = ["0", "aus", "off", "raus", "ende"];

export default class Timeout extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "timeout",
            description: "Setzt ein Mitglied in die Auszeit oder holt es wieder heraus",
            category: Category.Moderation,
            cooldown: 3,
            developerOnly: false,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption((option) =>
                option.setName("mitglied").setDescription("Wen soll ich stummschalten?").setRequired(true)
            )
            .addStringOption((option) =>
                option
                    .setName("dauer")
                    .setDescription('z.B. 10m, 2h, 7d - höchstens 28d. "aus" hebt die Auszeit auf.')
                    .setRequired(true)
            )
            .addStringOption((option) =>
                option.setName("grund").setDescription("Warum?").setMaxLength(400).setRequired(false)
            );
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const target = interaction.options.getMember("mitglied") as GuildMember | null;
        const input = interaction.options.getString("dauer", true).trim().toLowerCase();
        const reason = interaction.options.getString("grund") ?? "Kein Grund angegeben";

        if (!target) return this.Fail(interaction, "Diese Person ist nicht auf dem Server.");

        const blocked = Blocked(interaction.member as GuildMember, target);

        if (blocked) return this.Fail(interaction, blocked);
        if (!target.moderatable) return this.Fail(interaction, "Discord lässt mich diese Person nicht stummschalten.");

        if (RELEASE.includes(input)) return this.Release(interaction, target, reason);

        const duration = ParseDuration(input);

        if (!duration) return this.Fail(interaction, "Die Dauer verstehe ich nicht - probier es mit `10m`, `2h`, `7d`.");
        if (duration > MAX_TIMEOUT) return this.Fail(interaction, "Discord erlaubt höchstens 28 Tage Auszeit.");

        try {
            await target.timeout(duration, `${interaction.user.tag}: ${reason}`);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            logger.error(`[Timeout] ${target.user.tag} konnte nicht stummgeschaltet werden: ${normalized.message}`);

            return this.Fail(interaction, "Discord hat die Auszeit abgelehnt.");
        }

        const until = Math.floor((Date.now() + duration) / 1000);

        logger.info(`🔇 ${target.user.tag} hat von ${interaction.user.tag} ${input} Auszeit bekommen: ${reason}`);

        await interaction.editReply(
            new ComponentV2Builder({ accentColor: "Orange" })
                .title("🔇 | Auszeit gesetzt")
                .separator()
                .text(`**${target.user.tag}** ist erstmal still.`)
                .list([`**Bis:** <t:${until}:F> (<t:${until}:R>)`, `**Grund:** ${reason}`])
                .toMessage()
        );
    }

    private async Release(
        interaction: ChatInputCommandInteraction,
        target: GuildMember,
        reason: string
    ): Promise<void> {
        if (!target.isCommunicationDisabled()) {
            return this.Fail(interaction, "Diese Person ist gar nicht in der Auszeit.");
        }

        await target.timeout(null, `${interaction.user.tag}: ${reason}`);

        logger.info(`🔊 ${target.user.tag} wurde von ${interaction.user.tag} aus der Auszeit geholt`);

        await interaction.editReply(
            new ComponentV2Builder({ accentColor: "Green" })
                .title("🔊 | Auszeit aufgehoben")
                .separator()
                .text(`**${target.user.tag}** darf wieder mitreden.`)
                .toMessage()
        );
    }

    private async Fail(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
        await interaction.editReply(
            new ComponentV2Builder({ accentColor: "Red" }).title("❌ | Nicht möglich").separator().text(text).toMessage()
        );
    }
}

import {
    ChatInputCommandInteraction,
    GuildTextBasedChannel,
    Message,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import logger from "../../utils/logger";

const MAX_AMOUNT = 100;

// Discord löscht nur Nachrichten am Stück, die jünger als 14 Tage sind. Alles darüber
// geht ausschliesslich einzeln.
const BULK_LIMIT = 14 * 86_400_000;

// ponytail: einzelne Löschungen laufen seriell und sind hart rate-limited. Bei mehr als
// 25 alten Nachrichten würde der Befehl minutenlang hängen - dann lieber ein zweiter Aufruf.
const MAX_SINGLE_DELETES = 25;

export default class Clear extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "clear",
            description: "Löscht Nachrichten in diesem Kanal - auch deutlich ältere",
            category: Category.Moderation,
            cooldown: 5,
            developerOnly: false,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addIntegerOption((option) =>
                option
                    .setName("anzahl")
                    .setDescription("Wie viele Nachrichten? (1-100)")
                    .setMinValue(1)
                    .setMaxValue(MAX_AMOUNT)
                    .setRequired(true)
            )
            .addUserOption((option) =>
                option.setName("mitglied").setDescription("Nur Nachrichten dieser Person").setRequired(false)
            );
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const channel = interaction.channel as GuildTextBasedChannel | null;

        if (!channel || !interaction.guild) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const amount = interaction.options.getInteger("anzahl", true);
        const user = interaction.options.getUser("mitglied");

        // Immer die letzten 100 holen: mit Filter bleiben davon oft weniger als "anzahl" übrig,
        // und mehr als 100 gibt Discord in einem Zug nicht heraus.
        const fetched = await channel.messages.fetch({ limit: MAX_AMOUNT }).catch(() => null);

        if (!fetched) return this.Fail(interaction, "Ich komme an die Nachrichten in diesem Kanal nicht heran.");

        const targets = [...fetched.values()]
            .filter((message) => !message.pinned && (!user || message.author.id === user.id))
            .slice(0, amount);

        if (targets.length === 0) return this.Fail(interaction, "Hier gibt es nichts zu löschen.");

        const cutoff = Date.now() - BULK_LIMIT;
        const fresh = targets.filter((message) => message.createdTimestamp > cutoff);
        const old = targets.filter((message) => message.createdTimestamp <= cutoff);

        let deleted = 0;

        if (fresh.length > 0) {
            const removed = await channel.bulkDelete(fresh, true).catch(() => null);

            if (!removed) return this.Fail(interaction, "Discord hat das Löschen abgelehnt.");

            deleted += removed.size;
        }

        const slow = old.slice(0, MAX_SINGLE_DELETES);
        const skipped = old.length - slow.length;

        deleted += await this.DeleteOneByOne(slow);

        logger.info(`🧹 ${deleted} Nachricht(en) in #${channel.name} von ${interaction.user.tag} gelöscht`);

        const lines = [`**Gelöscht:** ${deleted}`];

        if (slow.length > 0) lines.push(`**Davon älter als 14 Tage:** ${slow.length} (einzeln entfernt)`);
        if (skipped > 0) lines.push(`**Übrig geblieben:** ${skipped} - ruf den Befehl nochmal auf`);
        if (user) lines.push(`**Nur von:** ${user.tag}`);

        await interaction.editReply(
            new ComponentV2Builder({ accentColor: "Green" })
                .title("🧹 | Aufgeräumt")
                .separator()
                .list(lines)
                .subtext("Angepinnte Nachrichten bleiben immer stehen.")
                .toMessage()
        );
    }

    private async DeleteOneByOne(messages: Message[]): Promise<number> {
        let deleted = 0;

        for (const message of messages) {
            const removed = await message.delete().catch(() => null);

            if (removed) deleted++;
        }

        return deleted;
    }

    private async Fail(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
        await interaction.editReply(
            new ComponentV2Builder({ accentColor: "Red" }).title("❌ | Nichts passiert").separator().text(text).toMessage()
        );
    }
}

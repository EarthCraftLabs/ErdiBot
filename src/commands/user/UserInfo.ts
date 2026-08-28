import { ChatInputCommandInteraction, GuildMember, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { IsAdmin, IsDeveloper, IsModerator } from "../../utils/permissions";

const MAX_ROLES = 15;

export default class UserInfo extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "userinfo",
            description: "Zeigt Informationen zu einem Mitglied",
            category: Category.User,
            cooldown: 5,
            developerOnly: false,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addUserOption((option) =>
                option.setName("mitglied").setDescription("Wen? (leer = du selbst)").setRequired(false)
            );
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const user = interaction.options.getUser("mitglied") ?? interaction.user;
        const member = (interaction.options.getMember("mitglied") as GuildMember | null) ?? interaction.member;
        const guildMember = member instanceof GuildMember ? member : null;

        const created = Math.floor(user.createdTimestamp / 1000);

        const builder = new ComponentV2Builder({ accentColor: guildMember?.displayColor || "Blurple" })
            .title(`👤 | ${user.username}`, guildMember?.nickname ?? user.globalName ?? undefined)
            .separator()
            .list([`**ID:** \`${user.id}\``, `**Konto erstellt:** <t:${created}:D> (<t:${created}:R>)`]);

        if (guildMember) {
            const joined = guildMember.joinedTimestamp ? Math.floor(guildMember.joinedTimestamp / 1000) : null;

            const lines = [
                `**Auf dem Server seit:** ${joined ? `<t:${joined}:D> (<t:${joined}:R>)` : "unbekannt"}`,
                `**Höchste Rolle:** ${guildMember.roles.highest.id === interaction.guildId ? "keine" : guildMember.roles.highest.toString()}`,
            ];

            if (guildMember.premiumSinceTimestamp) {
                lines.push(`**Boostet seit:** <t:${Math.floor(guildMember.premiumSinceTimestamp / 1000)}:R>`);
            }

            if (guildMember.isCommunicationDisabled()) {
                const until = Math.floor(guildMember.communicationDisabledUntilTimestamp / 1000);

                lines.push(`**In Auszeit bis:** <t:${until}:F> (<t:${until}:R>)`);
            }

            builder.separator().heading("Auf diesem Server").list(lines);

            builder.separator().heading("Rang").list([this.Rank(guildMember)]);

            // Die @everyone-Rolle hat jeder - sie hier aufzuzählen sagt nichts aus.
            const roles = [...guildMember.roles.cache.values()]
                .filter((role) => role.id !== interaction.guildId)
                .sort((left, right) => right.position - left.position);

            if (roles.length > 0) {
                const shown = roles.slice(0, MAX_ROLES).map((role) => role.toString());
                const rest = roles.length - shown.length;

                builder
                    .separator()
                    .heading(`Rollen (${roles.length})`)
                    .text(shown.join(" ") + (rest > 0 ? ` *und ${rest} weitere*` : ""));
            }
        }

        builder.gallery(user.displayAvatarURL({ size: 256 }));

        await interaction.reply(builder.toMessage({ ephemeral: true }));
    }

    private Rank(member: GuildMember): string {
        if (member.id === member.guild.ownerId) return "👑 Serverinhaber";
        if (IsDeveloper(this.client, member.id)) return "🧪 Entwickler";
        if (IsAdmin(member)) return "⚙️ Administrator";
        if (IsModerator(member)) return "🛡️ Moderator";
        if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return "🧹 Nachrichten verwalten";

        return "👥 Mitglied";
    }
}

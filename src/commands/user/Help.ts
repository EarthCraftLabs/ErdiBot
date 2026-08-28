import { ChatInputCommandInteraction, GuildMember, MessageFlags, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { VisibleCategories } from "../../utils/permissions";

const HEADINGS: Record<Category, string> = {
    [Category.User]: "👥 User",
    [Category.Moderation]: "🛡️ Moderation",
    [Category.Admin]: "⚙️ Admin",
    [Category.Developer]: "🧪 Developer",
    [Category.Testing]: "🔬 Testing",
};

const NOTES: Partial<Record<Category, string>> = {
    [Category.Moderation]: "Sichtbar für alle mit dem Recht *Mitglieder moderieren*.",
    [Category.Admin]: "Sichtbar für alle mit Administratorrechten.",
    [Category.Developer]: "Sichtbar für die Entwickler aus der config.json.",
};

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
        const visible = VisibleCategories(this.client, member, interaction.user.id);

        const builder = new ComponentV2Builder({ accentColor: "Blurple" }).title(
            "📖 | Befehle",
            `${this.client.user?.username ?? "Der Bot"} hört auf diese Slash-Befehle`
        );

        for (const category of visible) {
            const commands = this.client.commands
                .filter((command) => command.category === category)
                .sort((left, right) => left.name.localeCompare(right.name));

            if (commands.size === 0) continue;

            builder.separator();
            builder.heading(HEADINGS[category]);

            const note = NOTES[category];
            if (note) builder.subtext(note);

            builder.list(commands.map((command) => `\`/${command.name}\` — ${command.description}`));
        }

        // Nur Kategorien zählen, in denen wirklich Befehle liegen - eine leere Kategorie
        // zu verschweigen wäre kein Hinweis, sondern eine falsche Zahl.
        const hidden = Object.values(Category).filter(
            (category) =>
                !visible.includes(category) && this.client.commands.some((command) => command.category === category)
        ).length;

        if (hidden > 0) {
            builder.separator();
            builder.subtext(`${hidden} weitere Kategorie(n) sind für deine Rechte nicht sichtbar.`);
        }

        await interaction.reply(builder.toMessage({ ephemeral: true }));
    }
}

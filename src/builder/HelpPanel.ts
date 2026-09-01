import { GuildMember } from "discord.js";
import BotClient from "../client/BotClient";
import Category from "../enums/Category";
import ComponentV2Builder from "./ComponentV2Builder";
import { VisibleCategories } from "../utils/permissions";

export const PANEL_PREFIX = "help:panel";

interface ISection {
    emoji: string;
    label: string;
    description: string;
    note?: string;
}

// Eine Tabelle für Überschrift, Menü-Eintrag und Hinweis - drei getrennte Listen liefen
// beim ersten neuen Eintrag auseinander.
const SECTIONS: Record<Category, ISection> = {
    [Category.User]: {
        emoji: "👥",
        label: "User",
        description: "Befehle für alle auf dem Server",
    },
    [Category.Moderation]: {
        emoji: "🛡️",
        label: "Moderation",
        description: "Verwarnen, stummschalten, aufräumen",
        note: "Sichtbar für alle mit dem Recht *Mitglieder moderieren*.",
    },
    [Category.Admin]: {
        emoji: "⚙️",
        label: "Admin",
        description: "Einrichtung und Serververwaltung",
        note: "Sichtbar für alle mit Administratorrechten.",
    },
    [Category.Developer]: {
        emoji: "🧪",
        label: "Developer",
        description: "Nur für die Entwickler des Bots",
        note: "Sichtbar für die Entwickler aus der config.json.",
    },
    [Category.Testing]: {
        emoji: "🔬",
        label: "Testing",
        description: "Spielwiese für neue Bausteine",
    },
};

// Eine leere Kategorie gehört nicht ins Menü: sie anzuklicken führt nur zu einer leeren Liste.
export function Sections(client: BotClient, member: GuildMember | null, userId: string): Category[] {
    return VisibleCategories(client, member, userId).filter((category) =>
        client.commands.some((command) => command.category === category)
    );
}

export function RenderHelp(
    client: BotClient,
    member: GuildMember | null,
    userId: string,
    selected: string | null = null
): ComponentV2Builder {
    const sections = Sections(client, member, userId);

    // Die Rechte werden bei jedem Klick neu geprüft. Wer seine Rolle zwischendurch verliert,
    // landet wieder bei der ersten Kategorie, die er noch sehen darf.
    const active = sections.find((category) => category === selected) ?? sections[0] ?? Category.User;
    const section = SECTIONS[active];

    const commands = client.commands
        .filter((command) => command.category === active)
        .sort((left, right) => left.name.localeCompare(right.name));

    const builder = new ComponentV2Builder({ accentColor: "Blurple" })
        .title("📖 | Befehle", `${client.user?.username ?? "Der Bot"} hört auf diese Slash-Befehle`)
        .separator()
        .heading(`${section.emoji} ${section.label}`);

    if (section.note) builder.subtext(section.note);

    if (commands.size > 0) builder.list(commands.map((command) => `\`/${command.name}\` — ${command.description}`));
    else builder.text("_Hier liegt gerade kein Befehl._");

    if (sections.length > 0) {
        builder.separator();
        builder.select({
            customId: `${PANEL_PREFIX}:category`,
            placeholder: "📂 | Kategorie wählen...",
            options: sections.map((category) => ({
                label: SECTIONS[category].label,
                value: category,
                description: SECTIONS[category].description,
                emoji: SECTIONS[category].emoji,
                default: category === active,
            })),
        });
    }

    // Nur Kategorien zählen, in denen wirklich Befehle liegen - eine leere Kategorie
    // zu verschweigen wäre kein Hinweis, sondern eine falsche Zahl.
    const hidden = Object.values(Category).filter(
        (category) =>
            !sections.includes(category) && client.commands.some((command) => command.category === category)
    ).length;

    if (hidden > 0) builder.subtext(`${hidden} weitere Kategorie(n) sind für deine Rechte nicht sichtbar.`);

    return builder;
}

import { ColorResolvable, Guild } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import IReactionRolePanel, {
    IPanelMedia,
    IReactionRoleEntry,
    ReactionRoleMode,
} from "../interfaces/services/reactionroles/IReactionRolePanel";
import { CLAIM_PREFIX, EmojiComponent, EmojiText, PICK_PREFIX } from "../constants/ReactionRoles";

const BUTTONS_PER_ROW = 5;

const HINTS: Record<ReactionRoleMode, string> = {
    toggle: "Mehrfachauswahl möglich · noch einmal klicken gibt die Rolle wieder ab",
    unique: "Nur eine Rolle gleichzeitig · die vorherige wird ersetzt",
    verify: "Einmalige Vergabe · diese Rollen lassen sich hier nicht wieder abgeben",
};

const SELECT_HINTS: Record<ReactionRoleMode, string> = {
    toggle: "Deine Auswahl ersetzt deine bisherigen Rollen aus diesem Panel",
    unique: "Nur eine Rolle gleichzeitig · die vorherige wird ersetzt",
    verify: "Einmalige Vergabe · Abwählen entfernt nichts",
};

/**
 * Ein Server-Emoji, das gelöscht wurde, lässt Discord den Button-Build ablehnen — dann wäre
 * das ganze Panel tot. Deshalb hier prüfen und im Zweifel ohne Emoji rendern.
 */
export function UsableEmoji(entry: IReactionRoleEntry, guild: Guild): IReactionRoleEntry["emoji"] {
    if (!entry.emoji?.id) return entry.emoji;

    return guild.emojis.cache.has(entry.emoji.id) ? entry.emoji : null;
}

function Rows(entries: IReactionRoleEntry[]): IReactionRoleEntry[][] {
    const rows: IReactionRoleEntry[][] = [];

    for (let index = 0; index < entries.length; index += BUTTONS_PER_ROW) {
        rows.push(entries.slice(index, index + BUTTONS_PER_ROW));
    }

    return rows;
}

export default function BuildReactionRoles(panel: IReactionRolePanel, guild: Guild, media: IPanelMedia) {
    const builder = new ComponentV2Builder(
        panel.accent ? { accentColor: panel.accent as ColorResolvable } : {}
    );

    const header = panel.description ? `# ${panel.title}\n${panel.description}` : `# ${panel.title}`;

    // Mit Thumbnail wird aus Titel und Text eine Section — nur die trägt ein Bild rechts daneben.
    if (media.thumbnail) {
        builder.section(header, {
            type: "thumbnail",
            url: media.thumbnail,
            description: panel.title.slice(0, 100),
        });
    } else {
        builder.title(panel.title);

        if (panel.description) builder.text(panel.description);
    }

    builder.separator();

    if (panel.entries.length === 0) {
        if (media.image) builder.gallery(media.image);

        return builder.text("_Für dieses Panel wurden noch keine Rollen eingetragen._").toMessage();
    }

    builder.list(
        panel.entries.map((entry) => {
            const emoji = EmojiText(UsableEmoji(entry, guild));

            return `${emoji} <@&${entry.roleId}>${entry.description ? ` — ${entry.description}` : ""}`;
        })
    );

    if (media.image) builder.gallery(media.image);

    builder.separator();

    if (panel.style === "select") {
        builder.select({
            customId: `${PICK_PREFIX}:${panel.panelId}`,
            placeholder: "🎭 | Rollen auswählen...",
            minValues: 0,
            maxValues: panel.mode === "unique" ? 1 : panel.entries.length,
            options: panel.entries.map((entry) => ({
                label: entry.label,
                value: entry.id,
                description: entry.description ?? undefined,
                emoji: EmojiComponent(UsableEmoji(entry, guild)),
            })),
        });

        return builder.subtext(SELECT_HINTS[panel.mode]).toMessage();
    }

    for (const row of Rows(panel.entries)) {
        builder.buttons(
            ...row.map((entry) => ({
                customId: `${CLAIM_PREFIX}:${panel.panelId}:${entry.id}`,
                label: entry.label,
                emoji: EmojiComponent(UsableEmoji(entry, guild)),
                tone: entry.tone,
            }))
        );
    }

    return builder.subtext(HINTS[panel.mode]).toMessage();
}

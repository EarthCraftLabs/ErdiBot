import { ColorResolvable, MessageCreateOptions, MessageFlags } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { ITicket } from "../interfaces/services/ticket/ITicket";
import { ITicketCategory, ITicketConfig } from "../interfaces/services/ticket/ITicketConfig";
import { IActionOption } from "../interfaces/services/ticket/ITicketPanel";
import { Number4, Priority } from "../constants/Ticket";

export const TICKET_PREFIX = "ticket";

function ClaimedBy(ticket: ITicket): string {
    return ticket.claimedById ? `<@${ticket.claimedById}>` : "_noch niemand_";
}

// Die Hauptnachricht wird an vier Stellen neu gebaut - Erstellung, Claim, Transfer,
// Priorität. Ein gemeinsamer Aufbau, sonst driften die Anzeigen auseinander.
export default function BuildTicketMessage(
    ticket: ITicket,
    config: ITicketConfig,
    category: ITicketCategory | null,
    roles: string[],
    actions: IActionOption[]
): MessageCreateOptions {
    const priority = Priority(ticket.priority);
    const created = Math.floor(ticket.createdAt.getTime() / 1000);

    const builder = new ComponentV2Builder({ accentColor: priority.accent as ColorResolvable })
        .title(`🎫 Ticket #${Number4(ticket.ticketNumber)}`, category?.name ?? ticket.categoryName)
        .separator();

    builder.text(
        "**Willkommen in deinem Ticket.**\n" +
            "Beschreibe dein Anliegen so genau wie möglich — je mehr wir wissen, desto schneller können wir helfen.\n\n" +
            `👤 **Ersteller:** <@${ticket.creatorId}>\n` +
            `📁 **Kategorie:** \`${ticket.categoryName}\`\n` +
            `⚡ **Priorität:** ${priority.emoji} ${priority.label}\n` +
            `🙋 **Bearbeiter:** ${ClaimedBy(ticket)}\n` +
            `🕐 **Geöffnet:** <t:${created}:f> · <t:${created}:R>`
    );

    const flags = [
        ticket.frozen ? "🥶 eingefroren" : null,
        ticket.anonymous ? "🛡️ anonymer Team-Modus" : null,
        ticket.slowmode > 0 ? `⏱️ Slowmode ${ticket.slowmode}s` : null,
        ticket.staffNotes.length > 0 ? `📝 ${ticket.staffNotes.length} Team-Notiz(en)` : null,
        ticket.addedUsers.length > 0 ? `➕ ${ticket.addedUsers.length} zusätzliche(r) Nutzer` : null,
        ticket.meeting ? `📅 Termin <t:${Math.floor(new Date(ticket.meeting.scheduledAt).getTime() / 1000)}:R>` : null,
    ].filter(Boolean) as string[];

    if (flags.length > 0) builder.subtext(flags.join(" · "));

    builder.separator();
    builder.subtext(
        roles.length > 0
            ? `Zuständig: ${roles.map((roleId) => `<@&${roleId}>`).join(" ")}`
            : "Es ist keine Support-Rolle eingetragen."
    );

    if (config.supportHours) builder.subtext(`🕓 Support-Zeiten: ${config.supportHours}`);

    if (actions.length > 0) {
        builder.select({
            customId: `${TICKET_PREFIX}:menu`,
            placeholder: "🛠️ | Team-Aktionen …",
            options: actions.map((action) => ({
                label: action.name.slice(0, 100),
                value: action.value,
                description: action.description.slice(0, 100),
                emoji: action.emoji || undefined,
            })),
        });
    }

    return {
        components: [builder.build()],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    };
}

// Das öffentliche Panel, über das Tickets geöffnet werden.
export function BuildTicketPanel(config: ITicketConfig): MessageCreateOptions {
    const builder = new ComponentV2Builder({ accentColor: config.accent as ColorResolvable })
        .title(config.panelTitle)
        .separator()
        .text(config.panelMessage);

    if (config.supportHours) builder.subtext(`🕓 **Support-Zeiten:** ${config.supportHours}`);
    if (config.maxOpenTickets > 0) {
        builder.subtext(`Du kannst höchstens **${config.maxOpenTickets}** Tickets gleichzeitig offen haben.`);
    }

    if (config.panelImage) builder.gallery(config.panelImage);

    if (config.categories.length > 0) {
        builder.select({
            customId: `${TICKET_PREFIX}:open`,
            placeholder: "🆘 | Wähle eine Kategorie …",
            options: config.categories.map((category) => ({
                label: category.name.slice(0, 100),
                value: category.name,
                description: category.description.slice(0, 100),
                emoji: category.emoji || undefined,
            })),
        });
    }

    return { components: [builder.build()], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

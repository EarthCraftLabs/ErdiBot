import { ColorResolvable, Guild, MessageCreateOptions, MessageFlags, User } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { ITicket } from "../interfaces/services/ticket/ITicket";
import { ITranscriptResult } from "../services/TicketService";
import { Number4, Priority } from "../constants/Ticket";

// Wie lange ein Ticket offen war, in verständlicher Form statt in Millisekunden.
export function Duration(from: Date, to: Date): string {
    const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));

    if (minutes < 60) return `${minutes} Min.`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    if (hours < 24) return rest > 0 ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;

    const days = Math.floor(hours / 24);

    return `${days} Tag(e) ${hours % 24} Std.`;
}

// Wie lange es gedauert hat, bis jemand das Ticket übernommen hat. Die Kennzahl,
// nach der ein Support-Team am ehesten gefragt wird.
function Response(ticket: ITicket): string {
    if (!ticket.claimedById) return "_nie beansprucht_";
    if (!ticket.claimedAt) return "übernommen";

    return `nach ${Duration(ticket.createdAt, ticket.claimedAt)} übernommen`;
}

interface ITranscriptContext {
    guild: Guild;
    ticket: ITicket;
    closedBy: User;
    transcript: ITranscriptResult;
    channelName: string;
    reason: string | null;
}

function Body(context: ITranscriptContext, forCreator: boolean): ComponentV2Builder {
    const { guild, ticket, closedBy, transcript } = context;

    const priority = Priority(ticket.priority);
    const closedAt = ticket.closedAt ?? new Date();
    const opened = Math.floor(ticket.createdAt.getTime() / 1000);
    const closed = Math.floor(closedAt.getTime() / 1000);

    const builder = new ComponentV2Builder({ accentColor: priority.accent as ColorResolvable })
        .title(
            forCreator ? "🔒 Dein Ticket wurde geschlossen" : `🔒 Ticket #${Number4(ticket.ticketNumber)} geschlossen`,
            forCreator ? guild.name : context.channelName
        )
        .separator();

    builder.text(
        `🎫 **Nummer:** \`#${Number4(ticket.ticketNumber)}\`\n` +
            `📁 **Kategorie:** \`${ticket.categoryName}\`\n` +
            `⚡ **Priorität:** ${priority.emoji} ${priority.label}\n` +
            `👤 **Ersteller:** <@${ticket.creatorId}>\n` +
            `🙋 **Bearbeiter:** ${ticket.claimedById ? `<@${ticket.claimedById}>` : "_niemand_"}\n` +
            `🔒 **Geschlossen von:** <@${closedBy.id}>`
    );

    builder.separator({ divider: false });

    // Die Zahlen, die man beim Nachschlagen wirklich sucht: wie lange, wie viel,
    // wie viele Beteiligte. Im JS-Bot stand hier nur Datum und Uhrzeit.
    builder.text(
        `🕐 **Geöffnet:** <t:${opened}:f>\n` +
            `🕑 **Geschlossen:** <t:${closed}:f>\n` +
            `⏱️ **Laufzeit:** ${Duration(ticket.createdAt, closedAt)}\n` +
            `💬 **Nachrichten:** ${transcript.messageCount}\n` +
            `👥 **Beteiligt:** ${transcript.participants.length} Person(en)\n` +
            `🙋 **Bearbeitung:** ${Response(ticket)}`
    );

    const extras = [
        ticket.staffNotes.length > 0 ? `📝 ${ticket.staffNotes.length} Team-Notiz(en)` : null,
        ticket.addedUsers.length > 0 ? `➕ ${ticket.addedUsers.length} hinzugefügte(r) Nutzer` : null,
        ticket.anonymous ? "🛡️ anonymer Team-Modus war aktiv" : null,
        ticket.frozen ? "🥶 war eingefroren" : null,
        ticket.meeting ? "📅 Termin war vereinbart" : null,
    ].filter(Boolean) as string[];

    if (extras.length > 0) builder.subtext(extras.join(" · "));
    if (context.reason) builder.subtext(`📋 **Grund:** ${context.reason}`);

    return builder;
}

// Für den Transcript-Kanal: mit Team-Notizen, Beteiligten und der HTML-Datei im Anhang.
export function BuildTranscriptLog(context: ITranscriptContext): MessageCreateOptions {
    const builder = Body(context, false);
    const { ticket, transcript } = context;

    if (transcript.participants.length > 0) {
        builder.separator({ divider: false });
        builder.subtext(
            `Beteiligt: ${transcript.participants
                .slice(0, 15)
                .map((id) => `<@${id}>`)
                .join(", ")}${transcript.participants.length > 15 ? " …" : ""}`
        );
    }

    // Team-Notizen sind intern - sie stehen im Transcript-Kanal, nie in der Nachricht
    // an den Ersteller.
    if (ticket.staffNotes.length > 0) {
        builder.separator();
        builder.text(
            `📝 **Team-Notizen**\n${ticket.staffNotes
                .slice(0, 5)
                .map((note) => `> **${note.staffName}:** ${note.note.slice(0, 200)}`)
                .join("\n")}${ticket.staffNotes.length > 5 ? `\n> _… und ${ticket.staffNotes.length - 5} weitere_` : ""}`
        );
    }

    builder.separator();
    builder.buttons(
        { url: transcript.url, label: "Im Browser öffnen", emoji: "🌐" },
        { url: `https://discord.com/channels/${ticket.guildId}`, label: "Zum Server", emoji: "🏠" }
    );

    builder.subtext(`Transcript-ID: \`${transcript.transcriptId}\` · die HTML-Datei hängt an dieser Nachricht.`);

    return {
        components: [builder.build()],
        files: [{ attachment: transcript.buffer, name: `ticket-${Number4(ticket.ticketNumber)}.html` }],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    };
}

// Für den Ersteller per Direktnachricht: derselbe Aufbau, ohne interne Notizen.
export function BuildTranscriptDM(context: ITranscriptContext): MessageCreateOptions {
    const builder = Body(context, true);

    builder.separator();
    builder.text(
        "Falls dein Anliegen doch noch offen ist, öffne einfach ein neues Ticket — " +
            "verlinke gern diese Nummer, dann ordnen wir es zu."
    );

    builder.buttons({ url: context.transcript.url, label: "Gesprächsverlauf ansehen", emoji: "🌐" });

    return {
        components: [builder.build()],
        files: [
            {
                attachment: context.transcript.buffer,
                name: `ticket-${Number4(context.ticket.ticketNumber)}.html`,
            },
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    };
}

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Guild, MessageCreateOptions, User } from "discord.js";
import { ITicket } from "../interfaces/services/ticket/ITicket";
import { ITranscriptResult } from "../services/TicketService";
import { ICardRow, ITranscriptCard, RenderTranscriptCard } from "./TranscriptCard";
import { Number4, Priority } from "../constants/Ticket";

// Der Server ist deutsch, also steht die Karte fest auf deutscher Zeit - sonst zeigt sie
// die Zeitzone des Hosts, und die hat mit dem Ticket nichts zu tun.
const TIMEZONE = "Europe/Berlin";
const CARD_FILE = "ticket-abschluss.png";

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
    if (!ticket.claimedById) return "nie beansprucht";
    if (!ticket.claimedAt) return "übernommen";

    return `nach ${Duration(ticket.createdAt, ticket.claimedAt)} übernommen`;
}

// Ein Bild kann keine Erwähnung auflösen - im Gegensatz zur alten Textnachricht muss
// hier der Name stehen, den Discord sonst eingesetzt hätte.
function Name(user: User | null, fallback: string): string {
    return user ? `@${user.displayName}` : fallback;
}

function Stamp(date: Date): string {
    const options: Intl.DateTimeFormatOptions = { timeZone: TIMEZONE };

    const day = date.toLocaleDateString("de-DE", { ...options, day: "2-digit", month: "long", year: "numeric" });
    const time = date.toLocaleTimeString("de-DE", { ...options, hour: "2-digit", minute: "2-digit" });

    // Getrennt geholt, weil toLocaleString sonst ein "um" dazwischen setzt.
    return `${day} ${time}`;
}

export interface ITranscriptContext {
    guild: Guild;
    ticket: ITicket;
    closedBy: User;
    creator: User | null;
    handler: User | null;
    transcript: ITranscriptResult;
    channelName: string;
    reason: string;
}

// Exportiert, weil die Zahlen sonst nur noch im PNG stünden - dort prüft sie kein Test.
export function CardLayout(context: ITranscriptContext, forCreator: boolean): ITranscriptCard {
    const { ticket, closedBy, transcript } = context;

    const priority = Priority(ticket.priority);
    const closedAt = ticket.closedAt ?? new Date();
    const number = `#${Number4(ticket.ticketNumber)}`;

    const left: ICardRow[] = [
        { emoji: "🎫", tint: "#E8A33D", label: "Nummer", value: number },
        { emoji: "📁", tint: "#4F9BFF", label: "Kategorie", value: ticket.categoryName, style: "badge", color: "#A78BFA" },
        { emoji: "⚡", tint: priority.accent, label: "Priorität", value: priority.label, style: "badge" },
        {
            emoji: "👤",
            tint: "#4F9BFF",
            label: "Ersteller",
            value: Name(context.creator, "unbekannt"),
            style: context.creator ? "mention" : "muted",
            id: ticket.creatorId,
        },
        {
            emoji: "🙋",
            tint: "#F5A623",
            label: "Bearbeiter",
            value: ticket.claimedById ? Name(context.handler, "unbekannt") : "niemand",
            style: ticket.claimedById && context.handler ? "mention" : "muted",
            id: ticket.claimedById ?? undefined,
        },
        {
            emoji: "🔒",
            tint: "#F5C242",
            label: "Geschlossen von",
            value: `@${closedBy.displayName}`,
            style: "mention",
            id: closedBy.id,
        },
    ];

    const right: ICardRow[] = [
        { emoji: "📅", tint: "#A78BFA", label: "Geöffnet", value: Stamp(ticket.createdAt) },
        { emoji: "✅", tint: "#3FB950", label: "Geschlossen", value: Stamp(closedAt) },
        { emoji: "⏱️", tint: "#F778BA", label: "Laufzeit", value: Duration(ticket.createdAt, closedAt) },
        { emoji: "💬", tint: "#4F9BFF", label: "Nachrichten", value: String(transcript.messageCount) },
        {
            emoji: "👥",
            tint: "#56D4C0",
            label: "Beteiligt",
            value: `${transcript.participants.length} Person(en)`,
        },
        {
            emoji: "📝",
            tint: "#F5A623",
            label: "Bearbeitung",
            value: Response(ticket),
            style: ticket.claimedById ? "plain" : "muted",
        },
    ];

    return {
        title: forCreator ? "Dein Ticket wurde" : `Ticket ${number}`,
        highlight: "geschlossen",
        accent: priority.accent,
        statusEmoji: "🔒",
        badge: ticket.categoryName,
        subline: forCreator ? `${context.guild.name}  ·  Kategorie:` : `${number}  ·  Kategorie:`,
        left,
        right,
        transcriptId: transcript.transcriptId,
        reason: context.reason,
    };
}

// Nur die Karte: die HTML-Datei würde Discord als Code-Vorschau ausrollen. Der Verlauf
// liegt auf dem Webserver, der Knopf führt hin.
async function Files(context: ITranscriptContext, forCreator: boolean) {
    return [{ attachment: await RenderTranscriptCard(CardLayout(context, forCreator)), name: CARD_FILE }];
}

// Der gemalte Balken auf der Karte ist Bild, kein Knopf - der echte steht darunter.
function Link(url: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel("Im Browser öffnen").setEmoji("🌐")
    );
}

// Für den Ticket-Log: mit Team-Notizen, Beteiligten und der HTML-Datei im Anhang.
export async function BuildTranscriptLog(context: ITranscriptContext): Promise<MessageCreateOptions> {
    const { ticket, transcript } = context;

    const lines: string[] = [];

    if (transcript.participants.length > 0) {
        lines.push(
            `-# Beteiligt: ${transcript.participants
                .slice(0, 15)
                .map((id) => `<@${id}>`)
                .join(", ")}${transcript.participants.length > 15 ? " …" : ""}`
        );
    }

    const extras = [
        ticket.addedUsers.length > 0 ? `➕ ${ticket.addedUsers.length} hinzugefügte(r) Nutzer` : null,
        ticket.anonymous ? "🛡️ anonymer Team-Modus war aktiv" : null,
        ticket.frozen ? "🥶 war eingefroren" : null,
        ticket.meeting ? "📅 Termin war vereinbart" : null,
    ].filter(Boolean) as string[];

    if (extras.length > 0) lines.push(`-# ${extras.join(" · ")}`);

    // Team-Notizen sind intern - sie stehen im Ticket-Log, nie in der Nachricht
    // an den Ersteller.
    if (ticket.staffNotes.length > 0) {
        lines.push(
            `📝 **Team-Notizen**\n${ticket.staffNotes
                .slice(0, 5)
                .map((note) => `> **${note.staffName}:** ${note.note.slice(0, 200)}`)
                .join("\n")}${ticket.staffNotes.length > 5 ? `\n> _… und ${ticket.staffNotes.length - 5} weitere_` : ""}`
        );
    }

    return {
        content: lines.length > 0 ? lines.join("\n").slice(0, 2000) : undefined,
        files: await Files(context, false),
        components: [Link(transcript.url)],
        allowedMentions: { parse: [] },
    };
}

// Für den Ersteller per Direktnachricht: dieselbe Karte, ohne interne Notizen.
export async function BuildTranscriptDM(context: ITranscriptContext): Promise<MessageCreateOptions> {
    return {
        content:
            "Falls dein Anliegen doch noch offen ist, öffne einfach ein neues Ticket — " +
            "verlinke gern diese Nummer, dann ordnen wir es zu.",
        files: await Files(context, true),
        components: [Link(context.transcript.url)],
        allowedMentions: { parse: [] },
    };
}

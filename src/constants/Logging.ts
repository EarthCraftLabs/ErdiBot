import { ChannelType } from "discord.js";
import LogType from "../enums/LogType";
import { ChannelKind } from "../interfaces/services/logging/ILoggingPanel";

export const CONFIG_KEY = "logging";

// Discord deckelt den Text eines Containers bei 4000 Zeichen. Der Builder wirft dabei,
// statt zu kürzen - also vorher kappen, damit kein Aufrufer daran stirbt.
export const MAX_FIELD_LENGTH = 1200;
export const MAX_LIST_ITEMS = 15;

// Wie weit zurück ein Audit-Log-Eintrag zum Ereignis passen darf. Discord liefert den
// Eintrag oft erst kurz nach dem Gateway-Event, deshalb nicht zu knapp.
export const AUDIT_WINDOW = 8_000;

export interface ILogCategory {
    type: LogType;
    label: string;
    description: string;
    emoji: string;
    accent: string;
    events: string;
}

export const CATEGORIES: ILogCategory[] = [
    {
        type: LogType.CONNECTION,
        label: "Verbindungs-Logs",
        description: "Beitritte und Austritte",
        emoji: "🔌",
        accent: "#57F287",
        events: "Mitglied betritt oder verlässt den Server",
    },
    {
        type: LogType.MESSAGE,
        label: "Nachrichten-Logs",
        description: "Gelöschte und bearbeitete Nachrichten",
        emoji: "📝",
        accent: "#FEE75C",
        events: "Nachricht gelöscht, bearbeitet oder massenhaft gelöscht",
    },
    {
        type: LogType.VOICE,
        label: "Sprachkanal-Logs",
        description: "Betreten, Verlassen und Wechseln",
        emoji: "🔊",
        accent: "#5865F2",
        events: "Sprachkanal betreten, verlassen, gewechselt, Stumm- und Taubschaltung",
    },
    {
        type: LogType.ROLE,
        label: "Rollen-Logs",
        description: "Erstellt, geändert, gelöscht",
        emoji: "🏷️",
        accent: "#EB459E",
        events: "Rolle erstellt, umbenannt, umgefärbt, Rechte geändert oder gelöscht",
    },
    {
        type: LogType.CHANNEL,
        label: "Kanal-Logs",
        description: "Erstellt, geändert, gelöscht",
        emoji: "⚙️",
        accent: "#00B0F4",
        events: "Kanal erstellt, umbenannt, verschoben, Thema geändert oder gelöscht",
    },
    {
        type: LogType.PROFILE,
        label: "Profil-Logs",
        description: "Nickname, Avatar, Rollen",
        emoji: "👤",
        accent: "#9B59B6",
        events: "Nickname, Benutzername, Avatar oder zugewiesene Rollen ändern sich",
    },
    {
        type: LogType.MODERATION,
        label: "Moderations-Logs",
        description: "Banns, Kicks und Timeouts",
        emoji: "🛡️",
        accent: "#ED4245",
        events: "Bann, Entbannung, Kick und Timeout - inklusive wer es war und warum",
    },
    {
        type: LogType.AUDIT,
        label: "Audit-Logs",
        description: "Server, Emojis, Einladungen, Webhooks",
        emoji: "📋",
        accent: "#95A5A6",
        events: "Server-Einstellungen, Emojis, Einladungen und Webhooks",
    },
    {
        type: LogType.TICKET,
        label: "Ticket-Logs",
        description: "Support-Tickets",
        emoji: "🎫",
        accent: "#E67E22",
        events: "Noch nichts - der Kanal steht bereit, sobald es ein Ticket-System gibt",
    },
    {
        type: LogType.ERROR,
        label: "Fehler-Logs",
        description: "Bot-Fehler und Ausnahmen",
        emoji: "⚠️",
        accent: "#992D22",
        events: "Der Guardian meldet hier abgefangene Fehler und Abstürze",
    },
];

const BY_TYPE = new Map(CATEGORIES.map((category) => [category.type, category]));

export function Category(type: LogType): ILogCategory {
    const category = BY_TYPE.get(type);
    if (!category) throw new Error(`Für "${type}" gibt es keine Log-Kategorie.`);

    return category;
}

export function IsLogType(value: unknown): value is LogType {
    return typeof value === "string" && BY_TYPE.has(value as LogType);
}

// Für den Kanal-Picker: Text-Kanäle und Threads landen sonst in einer langen, gemischten
// Liste, in der niemand mehr sieht, was was ist. Deshalb erst die Art, dann der Kanal.
export const CHANNEL_TYPES: Record<ChannelKind, ChannelType[]> = {
    text: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    thread: [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread],
};

export function IsChannelKind(value: unknown): value is ChannelKind {
    return value === "text" || value === "thread";
}

// ── Formatierung ───────────────────────────────────────────────────────────
// Alle Handler bauen ihren Text aus diesen Bausteinen, damit die Logs gleich aussehen.

export function Cut(value: string, max = MAX_FIELD_LENGTH): string {
    const text = value.trim();

    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function Line(emoji: string, label: string, value: string): string {
    return `${emoji} **${label}:** ${value}`;
}

export function Mention(id: string | null | undefined, tag?: string | null): string {
    if (!id) return "_unbekannt_";

    return `<@${id}> (\`${tag ?? id}\`)`;
}

export function Channel(id: string | null | undefined): string {
    return id ? `<#${id}> (\`${id}\`)` : "_unbekannt_";
}

export function Stamp(date: Date = new Date()): string {
    const seconds = Math.floor(date.getTime() / 1000);

    return `<t:${seconds}:f> · <t:${seconds}:R>`;
}

// Ein Vorher/Nachher-Paar. Wenn sich nichts geändert hat, kommt null zurück -
// so bleiben unveränderte Felder aus dem Log raus.
export function Change(label: string, before: unknown, after: unknown, emoji = "✏️"): string | null {
    const from = Format(before);
    const to = Format(after);

    if (from === to) return null;

    return `${emoji} **${label}:** ${from} → ${to}`;
}

function Format(value: unknown): string {
    if (value === null || value === undefined || value === "") return "_leer_";
    if (typeof value === "boolean") return value ? "ja" : "nein";

    return `\`${Cut(String(value), 200)}\``;
}

// Listen von Rollen, Berechtigungen und Ähnlichem - gedeckelt, damit ein Server
// mit 80 Rollen den Container nicht sprengt.
export function List(items: string[], max = MAX_LIST_ITEMS): string {
    if (items.length === 0) return "_keine_";
    if (items.length <= max) return items.join(", ");

    return `${items.slice(0, max).join(", ")} _… und ${items.length - max} weitere_`;
}

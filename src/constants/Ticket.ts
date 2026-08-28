import TicketMode from "../enums/TicketMode";
import TicketPriority from "../enums/TicketPriority";
import TicketStatus from "../enums/TicketStatus";
import { IMeeting, IStaffNote, ITicket } from "../interfaces/services/ticket/ITicket";
import { ITicketCategory, ITicketConfig } from "../interfaces/services/ticket/ITicketConfig";

export const CONFIG_KEY = "ticket";

export const MAX_CATEGORIES = 20;
export const MAX_NOTES = 25;
export const MAX_ADDED_USERS = 25;
export const MAX_NOTE_LENGTH = 500;
export const MAX_REASON_LENGTH = 500;
export const MAX_PANEL_TITLE = 100;
export const MAX_PANEL_MESSAGE = 2000;

export const MIN_SLOWMODE = 0;
export const MAX_SLOWMODE = 21_600;
export const MAX_OPEN_TICKETS = 25;

export const TRANSCRIPT_ID = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/;
export const HEX = /^#[0-9a-fA-F]{6}$/;

// Der Kanal verschwindet nach dem Schliessen - so lange bleibt er noch stehen,
// damit alle Beteiligten die Abschlussnachricht lesen können.
export const CLOSE_DELAY = 8_000;

export const ALL_ROLES = "all";

export const CLOSE_ACTION = "close";

// Das Team-Menü hängt an der Hauptnachricht und ist damit auch für den Ersteller sichtbar.
// Er darf daraus genau eine Aktion auslösen: sein eigenes Ticket schliessen.
export function MayUseAction(action: string | undefined, isSupporter: boolean, isCreator: boolean): boolean {
    return isSupporter || (isCreator && action === CLOSE_ACTION);
}

export interface IPriorityInfo {
    id: TicketPriority;
    label: string;
    description: string;
    emoji: string;
    accent: string;
    // Ab "hoch" wird das Team zusätzlich per Direktnachricht geweckt.
    alerts: boolean;
}

export const PRIORITIES: IPriorityInfo[] = [
    { id: TicketPriority.LOW, label: "Niedrig", description: "Hat Zeit", emoji: "🟢", accent: "#57F287", alerts: false },
    { id: TicketPriority.MEDIUM, label: "Mittel", description: "Normale Bearbeitung", emoji: "🟡", accent: "#FEE75C", alerts: false },
    { id: TicketPriority.HIGH, label: "Hoch", description: "Sollte bald bearbeitet werden", emoji: "🟠", accent: "#FF7A00", alerts: true },
    { id: TicketPriority.CRITICAL, label: "Kritisch", description: "Braucht sofort Aufmerksamkeit", emoji: "🔴", accent: "#ED4245", alerts: true },
];

const BY_PRIORITY = new Map(PRIORITIES.map((entry) => [entry.id, entry]));

export function Priority(value: unknown): IPriorityInfo {
    return BY_PRIORITY.get(value as TicketPriority) ?? PRIORITIES[0];
}

export function IsPriority(value: unknown): value is TicketPriority {
    return BY_PRIORITY.has(value as TicketPriority);
}

// ── Hilfen ─────────────────────────────────────────────────────────────────

export function Choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
}

export function Text(value: unknown, fallback: string, max: number): string {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

export function Optional(value: unknown, max: number): string | null {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export function Color(value: unknown, fallback: string): string {
    return typeof value === "string" && HEX.test(value) ? value.toUpperCase() : fallback;
}

export function Clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;

    return Math.min(Math.max(Math.round(value), min), max);
}

export function Stamp(value: unknown): Date | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== "string" && typeof value !== "number") return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function Json<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value !== "string") return (value as T) ?? fallback;

    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

export function Number4(value: number): string {
    return String(value).padStart(4, "0");
}

// ── Transcript-ID ──────────────────────────────────────────────────────────
// Vier Blöcke à vier Zeichen: kurz genug zum Vorlesen, gross genug, dass niemand
// fremde Transcripts durch Raten findet (62^16 Möglichkeiten).

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function GenerateTranscriptId(random: () => number = Math.random): string {
    const block = () =>
        Array.from({ length: 4 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join("");

    return `${block()}-${block()}-${block()}-${block()}`;
}

export function IsTranscriptId(value: unknown): value is string {
    return typeof value === "string" && TRANSCRIPT_ID.test(value);
}

// ── Standards ──────────────────────────────────────────────────────────────

export function DefaultCategory(name: string): ITicketCategory {
    return {
        name: name.slice(0, 60),
        description: "Allgemeine Anfragen",
        emoji: "🎫",
        roleId: ALL_ROLES,
        priority: TicketPriority.LOW,
    };
}

export function DefaultConfig(guildId: string): ITicketConfig {
    const now = new Date();

    return {
        guildId,

        mode: TicketMode.FORUM,
        forumChannelId: null,
        categoryChannelId: null,

        panelChannelId: null,
        panelMessageId: null,
        transcriptChannelId: null,
        waitroomChannelId: null,

        supportRoleIds: [],
        maxOpenTickets: 3,
        supportHours: null,

        panelTitle: "🆘 | Support",
        panelMessage:
            "Du brauchst Hilfe? Wähle unten eine Kategorie und wir melden uns.\n\n" +
            "Bitte beschreibe dein Anliegen so genau wie möglich — das spart allen Zeit.",
        panelImage: null,
        accent: "#5865F2",

        categories: [],
        ticketCounter: 0,

        enabled: false,
        createdAt: now,
        updatedAt: now,
    };
}

// ── Normalisierung ─────────────────────────────────────────────────────────
// Alles aus der Datenbank kann veraltet oder von Hand verbogen sein.

export function NormalizeCategory(raw: unknown, index: number): ITicketCategory | null {
    if (typeof raw !== "object" || raw === null) return null;

    const source = raw as Record<string, unknown>;
    const name = Text(source.name, "", 60);

    // Ohne Namen gibt es nichts auszuwählen - so ein Eintrag fliegt raus.
    if (!name) return null;

    return {
        name,
        description: Text(source.description, `Kategorie ${index + 1}`, 100),
        emoji: Text(source.emoji, "🎫", 64),
        roleId: Text(source.roleId, ALL_ROLES, 20),
        priority: IsPriority(source.priority) ? source.priority : TicketPriority.LOW,
    };
}

export function NormalizeConfig(raw: unknown, guildId: string): ITicketConfig {
    const fallback = DefaultConfig(guildId);
    if (typeof raw !== "object" || raw === null) return fallback;

    const source = raw as Record<string, unknown>;
    const categories = Json<unknown[]>(source.categories, []);
    const roles = Json<unknown[]>(source.supportRoleIds, []);

    return {
        guildId: Text(source.guildId, guildId, 20),

        mode: Choice(source.mode, [TicketMode.FORUM, TicketMode.CATEGORY], TicketMode.FORUM),
        forumChannelId: Optional(source.forumChannelId, 20),
        categoryChannelId: Optional(source.categoryChannelId, 20),

        panelChannelId: Optional(source.panelChannelId, 20),
        panelMessageId: Optional(source.panelMessageId, 20),
        transcriptChannelId: Optional(source.transcriptChannelId, 20),
        waitroomChannelId: Optional(source.waitroomChannelId, 20),

        supportRoleIds: Array.isArray(roles) ? roles.map(String).filter(Boolean).slice(0, 25) : [],
        maxOpenTickets: typeof source.maxOpenTickets === "number" ? Clamp(source.maxOpenTickets, 0, MAX_OPEN_TICKETS) : 3,
        supportHours: Optional(source.supportHours, 100),

        panelTitle: Text(source.panelTitle, fallback.panelTitle, MAX_PANEL_TITLE),
        panelMessage: Text(source.panelMessage, fallback.panelMessage, MAX_PANEL_MESSAGE),
        panelImage: Optional(source.panelImage, 255),
        accent: Color(source.accent, fallback.accent),

        categories: Array.isArray(categories)
            ? categories
                  .slice(0, MAX_CATEGORIES)
                  .map((entry, index) => NormalizeCategory(entry, index))
                  .filter((entry): entry is ITicketCategory => entry !== null)
            : [],
        ticketCounter: typeof source.ticketCounter === "number" ? Math.max(0, Math.trunc(source.ticketCounter)) : 0,

        enabled: source.enabled === true || source.enabled === 1,
        createdAt: Stamp(source.createdAt) ?? fallback.createdAt,
        updatedAt: Stamp(source.updatedAt) ?? fallback.updatedAt,
    };
}

export function NormalizeTicket(raw: unknown, guildId: string): ITicket {
    const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const notes = Json<unknown[]>(source.staffNotes, []);
    const users = Json<unknown[]>(source.addedUsers, []);
    const meeting = Json<Record<string, unknown> | null>(source.meeting, null);

    return {
        channelId: Text(source.channelId, "", 20),
        guildId: Text(source.guildId, guildId, 20),
        ticketNumber: typeof source.ticketNumber === "number" ? Math.max(0, Math.trunc(source.ticketNumber)) : 0,

        creatorId: Text(source.creatorId, "", 20),
        categoryName: Text(source.categoryName, "Allgemein", 60),
        mode: Choice(source.mode, [TicketMode.FORUM, TicketMode.CATEGORY], TicketMode.FORUM),
        priority: IsPriority(source.priority) ? source.priority : TicketPriority.LOW,
        status: Choice(source.status, [TicketStatus.OPEN, TicketStatus.SNOOZED, TicketStatus.CLOSED], TicketStatus.OPEN),

        claimedById: Optional(source.claimedById, 20),
        claimedAt: Stamp(source.claimedAt),
        mainMessageId: Optional(source.mainMessageId, 20),

        anonymous: source.anonymous === true || source.anonymous === 1,
        frozen: source.frozen === true || source.frozen === 1,
        slowmode: typeof source.slowmode === "number" ? Clamp(source.slowmode, MIN_SLOWMODE, MAX_SLOWMODE) : 0,

        staffNotes: Array.isArray(notes)
            ? notes.slice(0, MAX_NOTES).map(NormalizeNote).filter((note): note is IStaffNote => note !== null)
            : [],
        addedUsers: Array.isArray(users) ? users.map(String).filter(Boolean).slice(0, MAX_ADDED_USERS) : [],
        meeting: NormalizeMeeting(meeting),

        createdAt: Stamp(source.createdAt) ?? new Date(),
        closedAt: Stamp(source.closedAt),
    };
}

function NormalizeNote(raw: unknown): IStaffNote | null {
    if (typeof raw !== "object" || raw === null) return null;

    const source = raw as Record<string, unknown>;
    const note = Text(source.note, "", MAX_NOTE_LENGTH);

    if (!note) return null;

    const createdAt = Text(source.createdAt, new Date().toISOString(), 40);

    return {
        // Ältere Notizen haben keine eigene ID - der Zeitstempel war dort der Schlüssel.
        id: Text(source.id, createdAt, 40),
        staffId: Text(source.staffId, "", 20),
        staffName: Text(source.staffName, "Unbekannt", 60),
        note,
        createdAt,
    };
}

function NormalizeMeeting(raw: unknown): IMeeting | null {
    if (typeof raw !== "object" || raw === null) return null;

    const source = raw as Record<string, unknown>;
    const scheduled = Stamp(source.scheduledAt);

    if (!scheduled) return null;

    return {
        scheduledAt: scheduled.toISOString(),
        description: Text(source.description, "Support-Gespräch", 500),
        reminderSent: source.reminderSent === true,
        confirmed: source.confirmed === true,
    };
}

// ── Berechtigungen ─────────────────────────────────────────────────────────

// Welche Rollen für ein Ticket zuständig sind: entweder die der Kategorie oder,
// bei "all", alle eingetragenen Support-Rollen.
export function ResponsibleRoles(config: ITicketConfig, categoryName: string): string[] {
    const category = config.categories.find((entry) => entry.name === categoryName);

    if (!category || category.roleId === ALL_ROLES) return config.supportRoleIds;

    return [category.roleId];
}

// Ein Setup ist erst benutzbar, wenn Container-Kanal, Panel-Kanal, mindestens eine
// Kategorie und mindestens eine Support-Rolle stehen.
export function MissingPieces(config: ITicketConfig): string[] {
    const missing: string[] = [];

    const container = config.mode === TicketMode.FORUM ? config.forumChannelId : config.categoryChannelId;

    if (!container) missing.push(config.mode === TicketMode.FORUM ? "Forum-Kanal" : "Ticket-Kategorie");
    if (!config.panelChannelId) missing.push("Panel-Kanal");
    if (config.categories.length === 0) missing.push("mindestens eine Ticket-Kategorie");
    if (config.supportRoleIds.length === 0) missing.push("mindestens eine Support-Rolle");

    return missing;
}

export function IsReady(config: ITicketConfig): boolean {
    return MissingPieces(config).length === 0;
}

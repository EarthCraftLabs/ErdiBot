import INotifierSubscription, { NotifierStyle, Platform } from "../interfaces/services/notifier/INotifierSubscription";
import { EventKind } from "../interfaces/services/notifier/INotifierEvent";

export const CONFIG_KEY = "notifier";

export const MAX_ENTRIES = 25;
export const MAX_NAME_LENGTH = 60;
export const MAX_TEMPLATE_LENGTH = 1500;
export const MAX_IDENTIFIER_LENGTH = 120;
export const MAX_URL_LENGTH = 255;

export const MIN_COOLDOWN = 0;
export const MAX_COOLDOWN = 1440;

export const PLATFORMS = ["youtube", "twitch"] as const;
export const STYLES = ["container", "text"] as const;

export const HEX = /^#[0-9a-fA-F]{6}$/;
export const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const PLATFORM_LABEL: Record<Platform, string> = {
    youtube: "YouTube",
    twitch: "Twitch",
};

export const PLATFORM_EMOJI: Record<Platform, string> = {
    youtube: "📺",
    twitch: "🟣",
};

export const PLATFORM_ACCENT: Record<Platform, string> = {
    youtube: "#FF0000",
    twitch: "#9146FF",
};

// Beide Plattformen kennen einen Live-Zustand. Bleibt das so, ist die Abfrage überflüssig -
// sie steht hier, damit eine Plattform ohne Live-Begriff nicht durch den ganzen Code muss.
export const SUPPORTS_LIVE: Record<Platform, boolean> = {
    youtube: true,
    twitch: true,
};

export function IsHex(value: string): boolean {
    return HEX.test(value);
}

export function IsTime(value: string): boolean {
    return TIME.test(value);
}

export function ClampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;

    return Math.min(Math.max(Math.round(value), min), max);
}

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
    return typeof value === "string" && IsHex(value) ? value.toUpperCase() : fallback;
}

// ── Platzhalter ────────────────────────────────────────────────────────────
// Bewusst dieselbe Schreibweise wie im Welcome-System: {name} in geschweiften Klammern,
// Vergleich in Kleinbuchstaben, unbekannte Platzhalter bleiben unangetastet stehen.

export const PLACEHOLDERS: Array<{ token: string; description: string }> = [
    { token: "{name}", description: "Anzeigename des Kanals" },
    { token: "{platform}", description: "YouTube oder Twitch" },
    { token: "{title}", description: "Titel des Streams oder Videos" },
    { token: "{link}", description: "Direktlink zum Stream oder Video" },
    { token: "{url}", description: "Link zum Kanal selbst" },
    { token: "{thumbnail}", description: "Vorschaubild" },
    { token: "{game}", description: "Kategorie oder Spiel (nur Twitch)" },
    { token: "{viewers}", description: "Zuschauerzahl (nur Twitch)" },
    { token: "{mention}", description: "Ping der eingestellten Rolle" },
    { token: "{role}", description: "Name der Live-Rolle" },
    { token: "{discord}", description: "Erwähnung des verknüpften Discord-Kontos" },
];

export const DEFAULT_LIVE_TEMPLATE = "{mention} **{name}** ist jetzt live auf {platform}!\n\n**{title}**\n{link}";
export const DEFAULT_VIDEO_TEMPLATE = "{mention} **{name}** hat ein neues Video hochgeladen!\n\n**{title}**\n{link}";
export const DEFAULT_OFFLINE_TEMPLATE = "**{name}** war live auf {platform}.\n\n{title}\n{link}";

export function DefaultSubscription(guildId: string, platform: Platform): INotifierSubscription {
    const now = new Date();

    return {
        guildId,
        platform,

        name: "",
        identifier: "",
        sourceUrl: "",
        avatarUrl: null,

        channelId: null,
        mentionRoleId: null,
        liveRoleId: null,
        discordUserId: null,

        liveTemplate: DEFAULT_LIVE_TEMPLATE,
        videoTemplate: DEFAULT_VIDEO_TEMPLATE,
        offlineTemplate: DEFAULT_OFFLINE_TEMPLATE,

        accent: PLATFORM_ACCENT[platform],
        style: "container",

        enabled: false,
        autoPublish: false,
        createThread: false,
        editOnEnd: true,
        cooldown: 5,

        quietFrom: null,
        quietTo: null,

        lastItemId: null,
        lastMessageId: null,
        lastNotified: null,
        lastCheck: null,
        lastError: null,

        isLive: false,
        notifyCount: 0,

        createdAt: now,
        updatedAt: now,
    };
}

// Alles, was aus der Datenbank kommt, kann veraltet oder von Hand verbogen sein.
export function Normalize(raw: unknown, guildId: string): INotifierSubscription {
    const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const platform = Choice(source.platform, PLATFORMS, "youtube");
    const fallback = DefaultSubscription(guildId, platform);

    return {
        guildId: Text(source.guildId, guildId, 20),
        platform,

        name: Text(source.name, "Unbenannt", MAX_NAME_LENGTH),
        identifier: Text(source.identifier, "", MAX_IDENTIFIER_LENGTH),
        sourceUrl: Text(source.sourceUrl, "", MAX_URL_LENGTH),
        avatarUrl: Optional(source.avatarUrl, MAX_URL_LENGTH),

        channelId: Optional(source.channelId, 20),
        mentionRoleId: Optional(source.mentionRoleId, 20),
        liveRoleId: SUPPORTS_LIVE[platform] ? Optional(source.liveRoleId, 20) : null,
        discordUserId: Optional(source.discordUserId, 20),

        liveTemplate: Text(source.liveTemplate, fallback.liveTemplate, MAX_TEMPLATE_LENGTH),
        videoTemplate: Text(source.videoTemplate, fallback.videoTemplate, MAX_TEMPLATE_LENGTH),
        offlineTemplate: Text(source.offlineTemplate, fallback.offlineTemplate, MAX_TEMPLATE_LENGTH),

        accent: Color(source.accent, fallback.accent),
        style: Choice(source.style, STYLES, "container"),

        enabled: source.enabled === true || source.enabled === 1,
        autoPublish: source.autoPublish === true || source.autoPublish === 1,
        createThread: source.createThread === true || source.createThread === 1,
        editOnEnd: source.editOnEnd !== false && source.editOnEnd !== 0,
        cooldown: typeof source.cooldown === "number" ? ClampNumber(source.cooldown, MIN_COOLDOWN, MAX_COOLDOWN) : 5,

        quietFrom: Time(source.quietFrom),
        quietTo: Time(source.quietTo),

        lastItemId: Optional(source.lastItemId, MAX_IDENTIFIER_LENGTH),
        lastMessageId: Optional(source.lastMessageId, 20),
        lastNotified: Stamp(source.lastNotified),
        lastCheck: Stamp(source.lastCheck),
        lastError: Optional(source.lastError, 500),

        isLive: source.isLive === true || source.isLive === 1,
        notifyCount: typeof source.notifyCount === "number" ? Math.max(0, Math.trunc(source.notifyCount)) : 0,

        createdAt: Stamp(source.createdAt) ?? fallback.createdAt,
        updatedAt: Stamp(source.updatedAt) ?? fallback.updatedAt,
    };
}

function Time(value: unknown): string | null {
    return typeof value === "string" && IsTime(value.trim()) ? value.trim() : null;
}

function Stamp(value: unknown): Date | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== "string" && typeof value !== "number") return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

// ── Ruhezeit ───────────────────────────────────────────────────────────────

// Dieselbe Zeitzone wie im RunnableService: wer "22:00" einträgt, meint deutsche Zeit,
// nicht die des Servers. Auf einer UTC-Maschine läge das Fenster sonst um ein bis zwei
// Stunden daneben - und zwar je nach Sommerzeit unterschiedlich.
export const TIME_ZONE = "Europe/Berlin";

const CLOCK = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

export function LocalMinutes(at: Date): number {
    const parts = CLOCK.formatToParts(at);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

    return (value("hour") % 24) * 60 + value("minute");
}

// Von 22:00 bis 07:00 läuft über Mitternacht - deshalb kein simples from <= x <= to.
export function InQuietHours(from: string | null, to: string | null, at: Date = new Date()): boolean {
    if (!from || !to || !IsTime(from) || !IsTime(to)) return false;
    if (from === to) return false;

    const minutes = LocalMinutes(at);
    const start = Minutes(from);
    const end = Minutes(to);

    return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function Minutes(value: string): number {
    const [hours, mins] = value.split(":");

    return Number(hours) * 60 + Number(mins);
}

// ── Ereignis-Fenster ───────────────────────────────────────────────────────
// Ein Neustart darf nicht die letzten Videos nachfeuern, und ein Twitch-Reconnect
// nicht denselben Stream doppelt melden.
export function ShouldNotify(
    subscription: INotifierSubscription,
    eventId: string,
    kind: EventKind,
    at: Date = new Date()
): { notify: boolean; reason: string } {
    if (!subscription.enabled) return { notify: false, reason: "deaktiviert" };
    if (!subscription.channelId) return { notify: false, reason: "kein Kanal" };

    // Die allererste Prüfung wird nur gemerkt, nie gemeldet. Sonst feuert das Einrichten
    // sofort das letzte Video nach, das oft Wochen alt ist und längst jeder gesehen hat.
    if (subscription.lastItemId === null) return { notify: false, reason: "Erstsichtung" };

    if (subscription.lastItemId === eventId) return { notify: false, reason: "bereits gemeldet" };
    if (kind === "live" && subscription.isLive) return { notify: false, reason: "läuft bereits" };

    if (InQuietHours(subscription.quietFrom, subscription.quietTo, at)) {
        return { notify: false, reason: "Ruhezeit" };
    }

    if (subscription.cooldown > 0 && subscription.lastNotified) {
        const elapsed = at.getTime() - subscription.lastNotified.getTime();

        if (elapsed < subscription.cooldown * 60_000) return { notify: false, reason: "Cooldown" };
    }

    return { notify: true, reason: "" };
}

export function TemplateFor(subscription: INotifierSubscription, kind: EventKind): string {
    return kind === "live" ? subscription.liveTemplate : subscription.videoTemplate;
}

export function Key(subscription: { platform: Platform; identifier: string }): string {
    return `${subscription.platform}:${subscription.identifier}`;
}

export function StyleLabel(style: NotifierStyle): string {
    return style === "container" ? "Container" : "Klartext";
}

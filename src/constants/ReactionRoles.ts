import { Guild } from "discord.js";
import IReactionRolePanel, {
    IEmojiRef,
    IReactionRoleEntry,
    ReactionRoleMode,
    ReactionRoleStyle,
    ReactionRoleTone,
} from "../interfaces/services/reactionroles/IReactionRolePanel";
import { IRoleChange } from "../interfaces/services/reactionroles/IReactionRolesService";

export const CONFIG_KEY = "reactionroles";

/** Setup-Oberfläche (nur Admins) und die veröffentlichte Nachricht (alle) trennen sich am Präfix. */
export const PANEL_PREFIX = "rr:panel";
export const CLAIM_PREFIX = "rr:claim";
export const PICK_PREFIX = "rr:pick";

export const MAX_PANELS = 25;
export const MAX_ENTRIES = 25;
export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_LABEL_LENGTH = 80;
export const MAX_ENTRY_DESCRIPTION_LENGTH = 100;
export const MAX_URL_LENGTH = 512;

/** Wert der Option "Keine Farbe" in reactionroles.json. */
export const NO_COLOR = "none";

export const MODES: ReactionRoleMode[] = ["toggle", "unique", "verify"];
export const STYLES: ReactionRoleStyle[] = ["buttons", "select"];
export const TONES: ReactionRoleTone[] = ["primary", "secondary", "success", "danger"];

const HEX = /^#[0-9a-fA-F]{6}$/;

const CUSTOM_EMOJI = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/;
const EMOJI_NAME = /^:?([a-zA-Z0-9_]{2,32}):?$/;

// Deckt ✅, 👍🏽, 🇩🇪, 1️⃣ und ZWJ-Ketten wie 👨‍👩‍👧 ab.
const UNICODE_EMOJI =
    /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*])(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}\u{200D}0-9#*])*$/u;

const MAX_EMOJI_INPUT = 64;

export function NewId(prefix: string): string {
    return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`;
}

export function NormalizeMode(value: unknown): ReactionRoleMode {
    return MODES.includes(value as ReactionRoleMode) ? (value as ReactionRoleMode) : "toggle";
}

export function NormalizeStyle(value: unknown): ReactionRoleStyle {
    return STYLES.includes(value as ReactionRoleStyle) ? (value as ReactionRoleStyle) : "buttons";
}

export function NormalizeTone(value: unknown): ReactionRoleTone {
    return TONES.includes(value as ReactionRoleTone) ? (value as ReactionRoleTone) : "secondary";
}

export function NormalizeAccent(value: unknown): string | null {
    return typeof value === "string" && HEX.test(value) ? value.toUpperCase() : null;
}

/**
 * Discord lädt eine eigene Adresse selbst nach — deshalb muss sie öffentlich und https sein.
 * Alles andere würde erst beim Senden auffallen.
 */
export function NormalizeUrl(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const url = value.trim();

    if (url.length === 0 || url.length > MAX_URL_LENGTH) return null;
    if (!/^https:\/\/\S+$/.test(url)) return null;

    return url;
}

export function IsMediaUrl(value: string): boolean {
    return value.startsWith("https://");
}

/**
 * Ein Bildfeld hält entweder eine eigene https-Adresse oder die ID eines Galerie-Bildes.
 * Beides sind Strings, verwechseln kann man sie nicht — Galerie-IDs sind Zahlen.
 */
export function NormalizeMedia(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const media = value.trim();

    if (media.length === 0 || media.length > MAX_URL_LENGTH) return null;

    return IsMediaUrl(media) ? NormalizeUrl(media) : media;
}

function NormalizeEmoji(value: unknown): IEmojiRef | null {
    if (typeof value !== "object" || value === null) return null;

    const emoji = value as Partial<IEmojiRef>;
    if (typeof emoji.name !== "string" || emoji.name.length === 0) return null;

    return {
        id: typeof emoji.id === "string" && emoji.id.length > 0 ? emoji.id : null,
        name: emoji.name,
        animated: emoji.animated === true,
    };
}

/** Die entries-Spalte ist JSON — was daraus zurückkommt, wird nie ungeprüft weitergereicht. */
export function NormalizeEntries(value: unknown): IReactionRoleEntry[] {
    if (!Array.isArray(value)) return [];

    return value
        .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
        .filter((entry) => typeof entry.roleId === "string" && entry.roleId.length > 0)
        .slice(0, MAX_ENTRIES)
        .map((entry) => ({
            id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : NewId("e"),
            roleId: entry.roleId as string,
            label: typeof entry.label === "string" ? entry.label.slice(0, MAX_LABEL_LENGTH) : "Rolle",
            description:
                typeof entry.description === "string" && entry.description.length > 0
                    ? entry.description.slice(0, MAX_ENTRY_DESCRIPTION_LENGTH)
                    : null,
            emoji: NormalizeEmoji(entry.emoji),
            tone: NormalizeTone(entry.tone),
        }));
}

export function DefaultPanel(guildId: string): IReactionRolePanel {
    return {
        panelId: NewId("p"),
        guildId,
        channelId: null,
        messageId: null,
        title: "Rollen auswählen",
        description: "Hol dir deine Rollen — du kannst sie jederzeit wieder abgeben.",
        accent: "#5865F2",
        thumbnail: null,
        image: null,
        style: "buttons",
        mode: "toggle",
        entries: [],
        updatedAt: new Date(),
    };
}

/**
 * Nimmt Unicode-Emojis, `<:name:id>`, `<a:name:id>`, `:name:` und den blanken Namen eines
 * Server-Emojis. Alles, was der Bot nicht wirklich benutzen kann, fliegt raus — sonst
 * bricht später der Button-Build der veröffentlichten Nachricht.
 */
export function ParseEmoji(input: string, guild: Guild): IEmojiRef | null {
    const value = input.trim();
    if (value.length === 0 || value.length > MAX_EMOJI_INPUT) return null;

    const custom = CUSTOM_EMOJI.exec(value);

    if (custom) {
        const known = guild.emojis.cache.get(custom[3]) ?? guild.client.emojis.cache.get(custom[3]);
        if (!known) return null;

        return { id: known.id, name: known.name ?? custom[2], animated: known.animated === true };
    }

    const named = EMOJI_NAME.exec(value);

    if (named) {
        const lowered = named[1].toLowerCase();
        const known =
            guild.emojis.cache.find((emoji) => emoji.name?.toLowerCase() === lowered) ??
            guild.client.emojis.cache.find((emoji) => emoji.name?.toLowerCase() === lowered);

        if (!known) return null;

        return { id: known.id, name: known.name ?? named[1], animated: known.animated === true };
    }

    if (UNICODE_EMOJI.test(value)) return { id: null, name: value, animated: false };

    return null;
}

/** Für Buttons und Select-Optionen. */
export function EmojiComponent(emoji: IEmojiRef | null): { id: string; name: string; animated: boolean } | string | undefined {
    if (!emoji) return undefined;

    return emoji.id ? { id: emoji.id, name: emoji.name, animated: emoji.animated } : emoji.name;
}

/** Für Fliesstext. */
export function EmojiText(emoji: IEmojiRef | null): string {
    if (!emoji) return "▫️";

    return emoji.id ? `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>` : emoji.name;
}

function Without(roles: string[], removed: string[]): string[] {
    return roles.filter((role) => !removed.includes(role));
}

/** Ein Button-Klick: genau eine Rolle steht zur Debatte. */
export function ResolveClick(
    mode: ReactionRoleMode,
    current: string[],
    panelRoles: string[],
    roleId: string
): IRoleChange {
    const owned = current.includes(roleId);

    if (mode === "verify") return owned ? { add: [], remove: [] } : { add: [roleId], remove: [] };

    if (owned) return { add: [], remove: [roleId] };

    const siblings = mode === "unique" ? Without(panelRoles.filter((role) => current.includes(role)), [roleId]) : [];

    return { add: [roleId], remove: siblings };
}

/** Eine Select-Auswahl: die Auswahl ersetzt den bisherigen Stand dieses Panels. */
export function ResolveSelect(
    mode: ReactionRoleMode,
    current: string[],
    panelRoles: string[],
    picked: string[]
): IRoleChange {
    const wanted = picked.filter((role) => panelRoles.includes(role));
    const owned = panelRoles.filter((role) => current.includes(role));

    return {
        add: wanted.filter((role) => !current.includes(role)),
        remove: mode === "verify" ? [] : Without(owned, wanted),
    };
}

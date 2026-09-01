import { ActivityType } from "discord.js";
import IStatusEntry, { IStatusRecord, StatusKind } from "../interfaces/services/status/IStatusEntry";

export const MAX_STATUS_LENGTH = 128;

// Ein Select trägt 25 Optionen - mehr Einträge könnte das Panel nicht mehr anbieten.
// Die beiden festen kommen obendrauf, deshalb zwei weniger.
export const MAX_ENTRIES = 23;

// Discord lässt fünf Presence-Updates pro 20 Sekunden zu. Alles unter 15 Sekunden
// läuft in dieses Limit, sobald der Bot nebenbei noch etwas anderes tut.
export const MIN_INTERVAL = 15;
export const MAX_INTERVAL = 3_600;
export const DEFAULT_INTERVAL = 30;

export interface IKindInfo {
    id: StatusKind;
    label: string;
    description: string;
    emoji: string;
    type: ActivityType;
    // Wie Discord den Eintrag in der Mitgliederliste anschreibt.
    prefix: string;
}

export const KINDS: IKindInfo[] = [
    {
        id: "playing",
        label: "Spielt",
        description: "Spielt <Text>",
        emoji: "🎮",
        type: ActivityType.Playing,
        prefix: "Spielt",
    },
    {
        id: "listening",
        label: "Hört",
        description: "Hört <Text>",
        emoji: "🎧",
        type: ActivityType.Listening,
        prefix: "Hört",
    },
    {
        id: "watching",
        label: "Schaut",
        description: "Schaut <Text>",
        emoji: "👀",
        type: ActivityType.Watching,
        prefix: "Schaut",
    },
    {
        id: "competing",
        label: "Tritt an",
        description: "Tritt an in <Text>",
        emoji: "🏆",
        type: ActivityType.Competing,
        prefix: "Tritt an in",
    },
    {
        id: "custom",
        label: "Freitext",
        description: "Nur der Text, ohne Vorsatz",
        emoji: "💬",
        type: ActivityType.Custom,
        prefix: "",
    },
];

const BY_KIND = new Map(KINDS.map((entry) => [entry.id, entry]));

export function Kind(value: unknown): IKindInfo {
    return BY_KIND.get(value as StatusKind) ?? KINDS[0];
}

export function IsKind(value: unknown): value is StatusKind {
    return BY_KIND.has(value as StatusKind);
}

// Die beiden Pflichteinträge stehen nicht in der Datenbank: sie sollen sich weder
// löschen noch abschalten lassen, und was nicht gespeichert wird, kann auch nicht fehlen.
export const FIXED_PREFIX = "fest:";

export const FIXED: IStatusEntry[] = [
    { id: `${FIXED_PREFIX}help`, text: "EarthCraft | /help", kind: "listening", enabled: true, fixed: true },
    { id: `${FIXED_PREFIX}author`, text: "Entwickelt von MecryTv", kind: "custom", enabled: true, fixed: true },
];

export interface IPlaceholder {
    token: string;
    description: string;
}

export const PLACEHOLDERS: IPlaceholder[] = [
    { token: "{servers}", description: "Anzahl der Server" },
    { token: "{members}", description: "Anzahl der Mitglieder" },
    { token: "{channels}", description: "Anzahl der Kanäle" },
    { token: "{tickets}", description: "Offene Tickets" },
    { token: "{ping}", description: "Gateway-Ping in Millisekunden" },
    { token: "{uptime}", description: "Laufzeit des Bots" },
];

export function Clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;

    return Math.min(Math.max(Math.round(value), min), max);
}

export function Text(value: unknown): string {
    return typeof value === "string" ? value.trim().slice(0, MAX_STATUS_LENGTH) : "";
}

// Alles aus der Datenbank kann veraltet oder von Hand verbogen sein.
export function NormalizeEntry(raw: unknown): IStatusEntry | null {
    if (typeof raw !== "object" || raw === null) return null;

    const source = raw as Partial<IStatusRecord> & { id?: number };
    const text = Text(source.text);

    // Ohne Text gibt es nichts anzuzeigen - so eine Zeile fliegt raus.
    if (!text || source.id === undefined) return null;

    return {
        id: String(source.id),
        text,
        kind: IsKind(source.kind) ? source.kind : "playing",
        enabled: source.enabled === true || (source.enabled as unknown) === 1,
        fixed: false,
    };
}

// Wie die Laufzeit im Status steht: grob gerundet, weil Sekunden dort niemand liest.
export function Uptime(milliseconds: number): string {
    const minutes = Math.floor(milliseconds / 60_000);

    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24) return `${hours}h ${minutes % 60}m`;

    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

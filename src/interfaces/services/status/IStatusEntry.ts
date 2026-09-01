export type StatusKind = "playing" | "listening" | "watching" | "competing" | "custom";

// Wie ein Status im Panel und in der Rotation aussieht. Die beiden festen Einträge
// tragen eine Kennung mit Präfix statt einer Datenbank-ID.
export default interface IStatusEntry {
    id: string;
    text: string;
    kind: StatusKind;
    enabled: boolean;
    fixed: boolean;
}

// Die Zeile in der Datenbank - ohne die festen Einträge, die es dort nicht gibt.
export interface IStatusRecord {
    text: string;
    kind: StatusKind;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface IStatusSettings {
    scope: string;
    interval: number;
    enabled: boolean;
    updatedAt: Date;
}

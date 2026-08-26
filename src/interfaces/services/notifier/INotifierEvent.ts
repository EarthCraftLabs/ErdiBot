import { Platform } from "./INotifierSubscription";

export type EventKind = "live" | "video";

// Was eine Plattform beim Abfragen gefunden hat. Alles darüber hinaus interessiert den Notifier nicht.
export interface INotifierEvent {
    kind: EventKind;
    id: string;
    title: string;
    url: string;
    thumbnail: string | null;
    game: string | null;
    viewers: number | null;
    publishedAt: Date;
}

// Beim Einrichten: aus einem Handle, einer URL oder einer ID wird ein eindeutiger Kanal.
export interface IResolvedChannel {
    identifier: string;
    name: string;
    url: string;
    avatarUrl: string | null;
}

export interface IPlatformAdapter {
    platform: Platform;
    label: string;
    emoji: string;

    // Wie oft die Plattform höchstens abgefragt wird, in Sekunden.
    interval: number;

    // Fehlt der API-Key, bleibt der Adapter stumm statt zu werfen.
    readonly Ready: boolean;
    readonly Hint: string;

    Resolve(input: string): Promise<IResolvedChannel | null>;
    Check(identifier: string): Promise<INotifierEvent | null>;
}

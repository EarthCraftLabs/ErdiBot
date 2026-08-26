import LogType from "../../../enums/LogType";

// Ein Log-Eintrag ist bewusst flach: Titel, Text, optional zwei Bilder.
// Alles Weitere - Zeitstempel, Farbe, Format - macht der Builder.
export interface ILogEntry {
    type: LogType;
    title: string;
    description: string;
    thumbnailUrl?: string | null;
    imageUrl?: string | null;
}

export interface ILogTarget {
    guildId: string;
    logType: LogType;
    channelId: string;
    name: string;
}

// Woran ein Ereignis hängt: wer war es, warum, und was war betroffen.
export interface IActor {
    id: string;
    tag: string;
    reason: string | null;
}

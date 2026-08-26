import { NotifierStyle, Platform } from "./INotifierSubscription";

// Genau die Spalten der Tabelle - was aus der Datenbank kommt, ist noch nicht normalisiert.
export default interface INotifierRecord {
    guildId: string;
    platform: Platform;

    name: string;
    identifier: string;
    sourceUrl: string;
    avatarUrl: string | null;

    channelId: string | null;
    mentionRoleId: string | null;
    liveRoleId: string | null;
    discordUserId: string | null;

    liveTemplate: string;
    videoTemplate: string;
    offlineTemplate: string;

    accent: string;
    style: NotifierStyle;

    enabled: boolean;
    autoPublish: boolean;
    createThread: boolean;
    editOnEnd: boolean;
    cooldown: number;

    quietFrom: string | null;
    quietTo: string | null;

    lastItemId: string | null;
    lastMessageId: string | null;
    lastNotified: Date | null;
    lastCheck: Date | null;
    lastError: string | null;

    isLive: boolean;
    notifyCount: number;

    createdAt: Date;
    updatedAt: Date;
}

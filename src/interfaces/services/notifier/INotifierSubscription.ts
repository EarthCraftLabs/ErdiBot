export type Platform = "youtube" | "twitch" | "tiktok";

// Wie die Benachrichtigung aussieht. Beides gleichzeitig geht nicht: eine Nachricht mit dem
// IsComponentsV2-Flag darf laut Discord kein "content" tragen.
export type NotifierStyle = "container" | "text";

export interface INotifierSubscription {
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

export default INotifierSubscription;

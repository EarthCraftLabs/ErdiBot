import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import INotifierRecord from "../../interfaces/services/notifier/INotifierRecord";
import { PLATFORMS, STYLES } from "../../constants/Notifier";

const NotifierSubscription: ITableDefinition<INotifierRecord> = {
    name: "NotifierSubscription",
    table: "notifier_subscription",
    columns: {
        guildId: { type: ColumnType.STRING, length: 20 },
        platform: { type: ColumnType.ENUM, values: [...PLATFORMS] },

        name: { type: ColumnType.STRING, length: 60 },
        identifier: { type: ColumnType.STRING, length: 120 },
        sourceUrl: { type: ColumnType.STRING, length: 255 },
        avatarUrl: { type: ColumnType.STRING, length: 255, nullable: true, blankAsNull: true },

        channelId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        mentionRoleId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        liveRoleId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        discordUserId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },

        liveTemplate: { type: ColumnType.TEXT },
        videoTemplate: { type: ColumnType.TEXT },
        offlineTemplate: { type: ColumnType.TEXT },

        accent: { type: ColumnType.CHAR, length: 7 },
        style: { type: ColumnType.ENUM, values: [...STYLES] },

        enabled: { type: ColumnType.BOOLEAN, default: 0 },
        autoPublish: { type: ColumnType.BOOLEAN, default: 0 },
        createThread: { type: ColumnType.BOOLEAN, default: 0 },
        editOnEnd: { type: ColumnType.BOOLEAN, default: 1 },
        cooldown: { type: ColumnType.SMALLINT, unsigned: true, default: 5 },

        quietFrom: { type: ColumnType.CHAR, length: 5, nullable: true, blankAsNull: true },
        quietTo: { type: ColumnType.CHAR, length: 5, nullable: true, blankAsNull: true },

        lastItemId: { type: ColumnType.STRING, length: 120, nullable: true, blankAsNull: true },
        lastMessageId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        lastNotified: { type: ColumnType.DATETIME, nullable: true },
        lastCheck: { type: ColumnType.DATETIME, nullable: true },
        // Wie bei ScheduledTask ohne blankAsNull: ein DEFAULT auf TEXT lehnt MySQL 8 ab.
        lastError: { type: ColumnType.TEXT, nullable: true },

        isLive: { type: ColumnType.BOOLEAN, default: 0 },
        notifyCount: { type: ColumnType.INTEGER, unsigned: true, default: 0 },

        createdAt: { type: ColumnType.DATETIME },
        updatedAt: { type: ColumnType.DATETIME },
    },
    // Ein Kanal darf pro Server nur einmal beobachtet werden - sonst kommt jede Meldung doppelt.
    indexes: [
        { name: "uniq_notifier_target", columns: ["guildId", "platform", "identifier"], unique: true },
        { name: "idx_notifier_due", columns: ["enabled", "platform"] },
    ],
};

export default NotifierSubscription;

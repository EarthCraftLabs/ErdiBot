import ColumnType from "../../enums/ColumnType";
import TicketMode from "../../enums/TicketMode";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import { ITicketConfig } from "../../interfaces/services/ticket/ITicketConfig";

const TicketConfig: ITableDefinition<ITicketConfig> = {
    name: "TicketConfig",
    table: "ticket_config",
    columns: {
        guildId: { type: ColumnType.STRING, length: 20 },

        mode: { type: ColumnType.ENUM, values: [TicketMode.FORUM, TicketMode.CATEGORY] },
        forumChannelId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        categoryChannelId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },

        panelChannelId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        panelMessageId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        transcriptChannelId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        waitroomChannelId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },

        supportRoleIds: { type: ColumnType.JSON },
        maxOpenTickets: { type: ColumnType.TINYINT, unsigned: true, default: 3 },
        supportHours: { type: ColumnType.STRING, length: 100, nullable: true, blankAsNull: true },

        panelTitle: { type: ColumnType.STRING, length: 100 },
        panelMessage: { type: ColumnType.TEXT },
        panelImage: { type: ColumnType.STRING, length: 255, nullable: true, blankAsNull: true },
        accent: { type: ColumnType.CHAR, length: 7 },

        categories: { type: ColumnType.JSON },
        // Zählt die Tickets pro Server hoch. Erhöht wird atomar per SQL, nicht gelesen-und-geschrieben.
        ticketCounter: { type: ColumnType.INTEGER, unsigned: true, default: 0 },

        enabled: { type: ColumnType.BOOLEAN, default: 0 },
        createdAt: { type: ColumnType.DATETIME },
        updatedAt: { type: ColumnType.DATETIME },
    },
    indexes: [{ name: "uniq_ticket_config", columns: ["guildId"], unique: true }],
};

export default TicketConfig;

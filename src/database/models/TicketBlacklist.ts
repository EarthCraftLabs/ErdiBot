import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import ITicketBlacklist from "../../interfaces/services/ticket/ITicketBlacklist";

const TicketBlacklist: ITableDefinition<ITicketBlacklist> = {
    name: "TicketBlacklist",
    table: "ticket_blacklist",
    columns: {
        guildId: { type: ColumnType.STRING, length: 20 },
        userId: { type: ColumnType.STRING, length: 20 },
        reason: { type: ColumnType.STRING, length: 500 },
        moderatorId: { type: ColumnType.STRING, length: 20 },
        // null bedeutet: dauerhaft. Sonst räumt der Wartungs-Runnable den Eintrag weg.
        expiresAt: { type: ColumnType.DATETIME, nullable: true },
        createdAt: { type: ColumnType.DATETIME },
    },
    indexes: [{ name: "uniq_ticket_blacklist", columns: ["guildId", "userId"], unique: true }],
};

export default TicketBlacklist;

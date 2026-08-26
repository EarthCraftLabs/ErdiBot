import ColumnType from "../../enums/ColumnType";
import TicketMode from "../../enums/TicketMode";
import TicketPriority from "../../enums/TicketPriority";
import TicketStatus from "../../enums/TicketStatus";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import ITicketRecord from "../../interfaces/services/ticket/ITicketRecord";

const Ticket: ITableDefinition<ITicketRecord> = {
    name: "Ticket",
    table: "tickets",
    columns: {
        // Der Kanal beziehungsweise Forum-Beitrag ist der Schlüssel: aus einer Interaktion
        // im Ticket ist er immer bekannt, ohne Umweg über eine eigene ID.
        channelId: { type: ColumnType.STRING, length: 20 },
        guildId: { type: ColumnType.STRING, length: 20 },
        ticketNumber: { type: ColumnType.INTEGER, unsigned: true },

        creatorId: { type: ColumnType.STRING, length: 20 },
        categoryName: { type: ColumnType.STRING, length: 60 },
        mode: { type: ColumnType.ENUM, values: [TicketMode.FORUM, TicketMode.CATEGORY] },
        priority: {
            type: ColumnType.ENUM,
            values: [TicketPriority.LOW, TicketPriority.MEDIUM, TicketPriority.HIGH, TicketPriority.CRITICAL],
        },
        status: { type: ColumnType.ENUM, values: [TicketStatus.OPEN, TicketStatus.SNOOZED, TicketStatus.CLOSED] },

        claimedById: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },
        // Wann übernommen wurde - daraus wird die Reaktionszeit im Transcript.
        claimedAt: { type: ColumnType.DATETIME, nullable: true },
        mainMessageId: { type: ColumnType.STRING, length: 20, nullable: true, blankAsNull: true },

        anonymous: { type: ColumnType.BOOLEAN, default: 0 },
        frozen: { type: ColumnType.BOOLEAN, default: 0 },
        slowmode: { type: ColumnType.SMALLINT, unsigned: true, default: 0 },

        staffNotes: { type: ColumnType.JSON },
        addedUsers: { type: ColumnType.JSON },
        meeting: { type: ColumnType.JSON, nullable: true },

        createdAt: { type: ColumnType.DATETIME },
        closedAt: { type: ColumnType.DATETIME, nullable: true },
    },
    indexes: [
        { name: "uniq_ticket_channel", columns: ["channelId"], unique: true },
        // Für "wie viele offene Tickets hat dieser Nutzer" und die Termin-Erinnerung.
        { name: "idx_ticket_owner", columns: ["guildId", "creatorId", "status"] },
        { name: "idx_ticket_status", columns: ["status"] },
    ],
};

export default Ticket;

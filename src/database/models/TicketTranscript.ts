import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import ITicketTranscript from "../../interfaces/services/ticket/ITicketTranscript";

const TicketTranscript: ITableDefinition<ITicketTranscript> = {
    name: "TicketTranscript",
    table: "ticket_transcripts",
    columns: {
        // 16 Zeichen aus 62 möglichen: kurz genug zum Vorlesen, gross genug,
        // dass niemand fremde Transcripts durch Raten findet.
        transcriptId: { type: ColumnType.CHAR, length: 19 },
        guildId: { type: ColumnType.STRING, length: 20 },
        channelId: { type: ColumnType.STRING, length: 20 },
        ticketNumber: { type: ColumnType.INTEGER, unsigned: true },
        creatorId: { type: ColumnType.STRING, length: 20 },
        closedById: { type: ColumnType.STRING, length: 20 },
        messageCount: { type: ColumnType.INTEGER, unsigned: true, default: 0 },
        participantCount: { type: ColumnType.SMALLINT, unsigned: true, default: 0 },
        file: { type: ColumnType.STRING, length: 255 },
        createdAt: { type: ColumnType.DATETIME },
    },
    indexes: [{ name: "uniq_transcript", columns: ["transcriptId"], unique: true }],
};

export default TicketTranscript;

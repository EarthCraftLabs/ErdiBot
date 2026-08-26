import TicketMode from "../../../enums/TicketMode";
import TicketPriority from "../../../enums/TicketPriority";
import TicketStatus from "../../../enums/TicketStatus";
import { IMeeting, IStaffNote } from "./ITicket";

// Genau die Spalten der Tabelle. Die drei JSON-Felder kommen als unbekannter Inhalt zurück
// und werden erst beim Normalisieren zu ihren Typen.
export default interface ITicketRecord {
    channelId: string;
    guildId: string;
    ticketNumber: number;

    creatorId: string;
    categoryName: string;
    mode: TicketMode;
    priority: TicketPriority;
    status: TicketStatus;

    claimedById: string | null;
    claimedAt: Date | null;
    mainMessageId: string | null;

    anonymous: boolean;
    frozen: boolean;
    slowmode: number;

    staffNotes: IStaffNote[];
    addedUsers: string[];
    meeting: IMeeting | null;

    createdAt: Date;
    closedAt: Date | null;
}

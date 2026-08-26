import TicketMode from "../../../enums/TicketMode";
import TicketPriority from "../../../enums/TicketPriority";
import TicketStatus from "../../../enums/TicketStatus";

export interface IStaffNote {
    id: string;
    staffId: string;
    staffName: string;
    note: string;
    createdAt: string;
}

export interface IMeeting {
    scheduledAt: string;
    description: string;
    reminderSent: boolean;
    confirmed: boolean;
}

export interface ITicket {
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

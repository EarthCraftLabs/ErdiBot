import TicketMode from "../../../enums/TicketMode";
import TicketPriority from "../../../enums/TicketPriority";

// Eine Kategorie im Ticket-Panel. roleId "all" bedeutet: alle Support-Rollen zuständig.
export interface ITicketCategory {
    name: string;
    description: string;
    emoji: string;
    roleId: string;
    priority: TicketPriority;
}

export interface ITicketConfig {
    guildId: string;

    mode: TicketMode;
    forumChannelId: string | null;
    categoryChannelId: string | null;

    panelChannelId: string | null;
    panelMessageId: string | null;
    transcriptChannelId: string | null;
    waitroomChannelId: string | null;

    supportRoleIds: string[];
    maxOpenTickets: number;
    supportHours: string | null;

    panelTitle: string;
    panelMessage: string;
    panelImage: string | null;
    accent: string;

    categories: ITicketCategory[];
    ticketCounter: number;

    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

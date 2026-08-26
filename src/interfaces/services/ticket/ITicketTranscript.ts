export default interface ITicketTranscript {
    transcriptId: string;
    guildId: string;
    channelId: string;
    ticketNumber: number;
    creatorId: string;
    closedById: string;
    messageCount: number;
    participantCount: number;
    file: string;
    createdAt: Date;
}

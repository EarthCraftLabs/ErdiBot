export default interface ITicketBlacklist {
    guildId: string;
    userId: string;
    reason: string;
    moderatorId: string;
    expiresAt: Date | null;
    createdAt: Date;
}

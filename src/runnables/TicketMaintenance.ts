import { TextChannel, ThreadChannel } from "discord.js";
import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import TicketStatus from "../enums/TicketStatus";
import ITicketRecord from "../interfaces/services/ticket/ITicketRecord";
import ITicketBlacklist from "../interfaces/services/ticket/ITicketBlacklist";
import { NormalizeTicket, Number4 } from "../constants/Ticket";
import logger from "../utils/logger";

export default class TicketMaintenance extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "TicketMaintenance",
            description: "Erinnert an Ticket-Termine und räumt abgelaufene Sperren weg",
            type: TaskTypes.INTERVAL,
            expression: "15m",
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.database.IsReady) return;

        const expired = await this.Expired();
        const reminded = await this.Reminders();

        if (expired > 0 || reminded > 0) {
            logger.tasks(`🎫 Tickets: ${reminded} Erinnerung(en), ${expired} abgelaufene Sperre(n) entfernt`);
        }
    }

    // Abgelaufene Sperren werden beim Ticket-Öffnen ohnehin geprüft - hier fliegen sie
    // trotzdem raus, damit die Tabelle nicht endlos wächst.
    private async Expired(): Promise<number> {
        return this.client.database
            .GetRepository<ITicketBlacklist>("TicketBlacklist")
            .Delete({ expiresAt: { lte: new Date() } })
            .catch(() => 0);
    }

    private async Reminders(): Promise<number> {
        const rows = await this.client.database
            .GetRepository<ITicketRecord>("Ticket")
            .Find({ status: TicketStatus.OPEN }, { limit: 500 })
            .catch(() => []);

        const now = Date.now();
        let sent = 0;

        for (const row of rows) {
            const ticket = NormalizeTicket(row, row.guildId);
            const meeting = ticket.meeting;

            if (!meeting || meeting.reminderSent || !meeting.confirmed) continue;
            if (new Date(meeting.scheduledAt).getTime() > now) continue;

            const channel = await this.client.channels.fetch(ticket.channelId).catch(() => null);

            if (!channel?.isTextBased() || channel.isDMBased()) {
                // Der Kanal ist weg - ohne dieses Merken versucht es der Task alle 15 Minuten neu.
                await this.client.ticketService.Patch(ticket, { meeting: { ...meeting, reminderSent: true } });

                continue;
            }

            const config = await this.client.ticketService.Config(ticket.guildId);
            const roles = this.client.ticketService.RolesFor(config, ticket.categoryName);

            const target = channel as TextChannel | ThreadChannel;

            if (target.isThread() && (target as ThreadChannel).archived) {
                await (target as ThreadChannel).setArchived(false).catch(() => null);
            }

            const ok = await target
                .send({
                    content:
                        `🔔 **Termin-Erinnerung für Ticket #${Number4(ticket.ticketNumber)}**\n` +
                        `<@${ticket.creatorId}> ${roles.map((roleId) => `<@&${roleId}>`).join(" ")}\n\n` +
                        `📝 ${meeting.description}`,
                    allowedMentions: { users: [ticket.creatorId], roles },
                })
                .catch(() => null);

            await this.client.ticketService.Patch(ticket, { meeting: { ...meeting, reminderSent: true } });

            if (ok) sent++;
        }

        return sent;
    }
}

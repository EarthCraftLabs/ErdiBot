import { Events, Message, TextChannel, ThreadChannel, WebhookClient } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

const WEBHOOK_NAME = "Ticket-Support";
const ALIAS = "Support-Team";

export default class TicketAnonymous extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageCreate,
            description: "Schreibt Team-Nachrichten im anonymen Modus unter einem Alias um",
            once: false,
        });
    }

    async Execute(message: Message): Promise<void> {
        if (!message.guild || message.author.bot || message.webhookId) return;
        if (!this.client.database.IsReady) return;

        const service = this.client.ticketService;
        const ticket = await service.Get(message.channelId).catch(() => null);

        if (!ticket?.anonymous) return;

        const config = await service.Config(ticket.guildId);
        const member = message.member;

        // Nur das Team schreibt anonym - der Ersteller soll erkennbar bleiben.
        if (!member || !service.IsSupporter(member, config)) return;
        if (message.author.id === ticket.creatorId) return;

        const sent = await this.Relay(message);

        if (sent) await message.delete().catch(() => null);
    }

    // Der Webhook hängt am Kanal, im Forum am übergeordneten Forum-Kanal - Threads
    // können keine eigenen Webhooks haben, dort läuft es über thread_id.
    private async Relay(message: Message): Promise<boolean> {
        const channel = message.channel as TextChannel | ThreadChannel;
        const thread = channel.isThread() ? (channel as ThreadChannel) : null;
        const parent = thread?.parent ?? (channel as TextChannel);

        if (!parent || !("fetchWebhooks" in parent)) return false;

        const webhook = await this.Webhook(parent as TextChannel);
        if (!webhook) return false;

        const client = new WebhookClient({ id: webhook.id, token: webhook.token });

        const done = await client
            .send({
                content: message.content || undefined,
                username: ALIAS,
                avatarURL: message.guild?.iconURL({ size: 256 }) ?? undefined,
                files: [...message.attachments.values()].map((file) => file.url),
                threadId: thread?.id,
                allowedMentions: { parse: [] },
            })
            .catch((error) => {
                logger.debug(`[Ticket] Anonyme Nachricht fehlgeschlagen: ${error}`);

                return null;
            });

        client.destroy();

        return done !== null;
    }

    private async Webhook(channel: TextChannel) {
        const existing = await channel.fetchWebhooks().catch(() => null);
        const mine = existing?.find((hook) => hook.name === WEBHOOK_NAME && hook.token);

        if (mine?.token) return { id: mine.id, token: mine.token };

        const created = await channel
            .createWebhook({ name: WEBHOOK_NAME, reason: "Anonymer Ticket-Modus" })
            .catch(() => null);

        return created?.token ? { id: created.id, token: created.token } : null;
    }
}

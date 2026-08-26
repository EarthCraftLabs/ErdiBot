import { AuditLogEvent, Events, GuildChannel } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, Mention } from "../../constants/Logging";

const WEBHOOK_EVENTS = [AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookUpdate, AuditLogEvent.WebhookDelete];

const TITLES: Record<number, string> = {
    [AuditLogEvent.WebhookCreate]: "Webhook erstellt",
    [AuditLogEvent.WebhookUpdate]: "Webhook geändert",
    [AuditLogEvent.WebhookDelete]: "Webhook gelöscht",
};

export default class WebhooksUpdate extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.WebhooksUpdate, description: "Protokolliert Webhook-Änderungen", once: false });
    }

    async Execute(channel: GuildChannel): Promise<void> {
        if (!channel.guild) return;

        const service = this.client.loggingService;

        // Discord meldet nur "in diesem Kanal hat sich etwas an den Webhooks getan" - was
        // genau, steht ausschliesslich im Audit-Log.
        const entries = await Promise.all(
            WEBHOOK_EVENTS.map((type) => service.Audit(channel.guild, type, { withinMs: 10_000 }))
        );

        const entry = entries
            .filter((found): found is NonNullable<typeof found> => found !== null)
            .sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];

        const actor = service.Actor(entry ?? null);

        const description = [
            Line("📍", "Kanal", `${channel} (\`${channel.id}\`)`),
            actor ? Line("👮", "Ausgeführt von", Mention(actor.id, actor.tag)) : null,
            actor?.reason ? Line("📋", "Grund", actor.reason) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(channel.guild.id, {
            type: LogType.AUDIT,
            title: entry ? (TITLES[entry.action as number] ?? "Webhook geändert") : "Webhook geändert",
            description,
        });
    }
}

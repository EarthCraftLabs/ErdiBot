import { AuditLogEvent, Collection, Events, Message, PartialMessage, Snowflake } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Channel, Line, List, Mention } from "../../constants/Logging";

export default class MessageBulkDelete extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageBulkDelete,
            description: "Protokolliert massenhaft gelöschte Nachrichten",
            once: false,
        });
    }

    async Execute(messages: Collection<Snowflake, Message | PartialMessage>): Promise<void> {
        const first = messages.first();
        if (!first?.guild) return;

        const service = this.client.loggingService;
        const entry = await service.Audit(first.guild, AuditLogEvent.MessageBulkDelete);
        const actor = service.Actor(entry);

        // Nur die Autoren nennen, nicht die Inhalte: bei 100 Nachrichten sprengt das
        // jeden Container, und die Namen beantworten die eigentliche Frage.
        const authors = [
            ...new Set(
                messages
                    .map((message) => message.author?.tag)
                    .filter((tag): tag is string => typeof tag === "string")
            ),
        ];

        const description = [
            Line("🗑️", "Anzahl", `${messages.size} Nachrichten`),
            Line("📍", "Kanal", Channel(first.channelId)),
            Line("👥", "Betroffene Autoren", List(authors)),
            actor
                ? Line("👮", "Gelöscht von", `${Mention(actor.id, actor.tag)}${actor.reason ? ` — ${actor.reason}` : ""}`)
                : Line("👮", "Gelöscht von", "_nicht ermittelbar_"),
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(first.guild.id, {
            type: LogType.MESSAGE,
            title: "Nachrichten massenhaft gelöscht",
            description,
        });
    }
}

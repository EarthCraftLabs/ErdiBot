import { AuditLogEvent, Events, Message, PartialMessage } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Channel, Cut, Line, List, Mention } from "../../constants/Logging";

export default class MessageDelete extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageDelete,
            description: "Protokolliert gelöschte Nachrichten",
            once: false,
        });
    }

    async Execute(message: Message | PartialMessage): Promise<void> {
        if (!message.guild) return;
        if (message.author?.bot) return;

        const service = this.client.loggingService;

        // Bei einer Partial-Nachricht war sie nicht im Cache: Autor und Inhalt sind dann
        // nicht mehr zu bekommen. Der Eintrag kommt trotzdem - dass etwas gelöscht wurde,
        // ist die halbe Information.
        const content = message.content?.trim();
        const attachments = message.attachments?.map((file) => file.name) ?? [];

        const entry = message.author
            ? await service.Audit(message.guild, AuditLogEvent.MessageDelete, {
                  targetId: message.author.id,
                  matches: (found) => (found.extra as { channel?: { id: string } })?.channel?.id === message.channelId,
              })
            : null;

        const actor = service.Actor(entry);

        const description = [
            Line("👤", "Autor", message.author ? Mention(message.author.id, message.author.tag) : "_nicht im Cache_"),
            Line("📍", "Kanal", Channel(message.channelId)),
            Line("🆔", "Nachricht", `\`${message.id}\``),
            attachments.length > 0 ? Line("📎", "Anhänge", List(attachments)) : null,
            actor
                ? Line("👮", "Gelöscht von", `${Mention(actor.id, actor.tag)}${actor.reason ? ` — ${actor.reason}` : ""}`)
                : Line("🙋", "Gelöscht von", "Autor selbst oder nicht ermittelbar"),
            "",
            `📝 **Inhalt:**\n${content ? Cut(content, 1500) : "_nicht verfügbar (nicht im Cache oder nur Anhang)_"}`,
        ]
            .filter((line) => line !== null)
            .join("\n");

        await service.Send(message.guild.id, {
            type: LogType.MESSAGE,
            title: "Nachricht gelöscht",
            description,
            thumbnailUrl: message.author?.displayAvatarURL({ size: 256 }) ?? null,
        });
    }
}

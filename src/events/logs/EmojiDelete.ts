import { AuditLogEvent, Events, GuildEmoji } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, Mention } from "../../constants/Logging";

export default class EmojiDelete extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.GuildEmojiDelete, description: "Protokolliert gelöschte Emojis", once: false });
    }

    async Execute(emoji: GuildEmoji): Promise<void> {
        const service = this.client.loggingService;
        const actor = service.Actor(
            await service.Audit(emoji.guild, AuditLogEvent.EmojiDelete, { targetId: emoji.id })
        );

        const description = [
            Line("😀", "Emoji", `\`:${emoji.name}:\``),
            Line("🆔", "ID", `\`${emoji.id}\``),
            actor ? Line("👮", "Entfernt von", Mention(actor.id, actor.tag)) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(emoji.guild.id, { type: LogType.AUDIT, title: "Emoji entfernt", description });
    }
}

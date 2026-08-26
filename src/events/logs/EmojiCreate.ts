import { AuditLogEvent, Events, GuildEmoji } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, Mention } from "../../constants/Logging";

export default class EmojiCreate extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.GuildEmojiCreate, description: "Protokolliert neue Emojis", once: false });
    }

    async Execute(emoji: GuildEmoji): Promise<void> {
        const service = this.client.loggingService;
        const actor = service.Actor(
            await service.Audit(emoji.guild, AuditLogEvent.EmojiCreate, { targetId: emoji.id })
        );

        const description = [
            Line("😀", "Emoji", `${emoji} \`:${emoji.name}:\``),
            Line("🆔", "ID", `\`${emoji.id}\``),
            Line("🎞️", "Animiert", emoji.animated ? "ja" : "nein"),
            actor ? Line("👮", "Hinzugefügt von", Mention(actor.id, actor.tag)) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(emoji.guild.id, {
            type: LogType.AUDIT,
            title: "Emoji hinzugefügt",
            description,
            thumbnailUrl: emoji.imageURL({ size: 128 }),
        });
    }
}

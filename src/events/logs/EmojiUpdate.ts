import { AuditLogEvent, Events, GuildEmoji } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Change, Line, Mention } from "../../constants/Logging";

export default class EmojiUpdate extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.GuildEmojiUpdate, description: "Protokolliert umbenannte Emojis", once: false });
    }

    async Execute(before: GuildEmoji, after: GuildEmoji): Promise<void> {
        const name = Change("Name", before.name, after.name, "📛");
        if (!name) return;

        const service = this.client.loggingService;
        const actor = service.Actor(
            await service.Audit(after.guild, AuditLogEvent.EmojiUpdate, { targetId: after.id })
        );

        const description = [
            Line("😀", "Emoji", `${after}`),
            name,
            actor ? Line("👮", "Geändert von", Mention(actor.id, actor.tag)) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(after.guild.id, {
            type: LogType.AUDIT,
            title: "Emoji umbenannt",
            description,
            thumbnailUrl: after.imageURL({ size: 128 }),
        });
    }
}

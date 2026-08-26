import { AuditLogEvent, ChannelType, Events, GuildChannel } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, Mention } from "../../constants/Logging";

export default class ChannelCreate extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.ChannelCreate, description: "Protokolliert neue Kanäle", once: false });
    }

    async Execute(channel: GuildChannel): Promise<void> {
        if (!channel.guild) return;

        const service = this.client.loggingService;
        const actor = service.Actor(
            await service.Audit(channel.guild, AuditLogEvent.ChannelCreate, { targetId: channel.id })
        );

        const description = [
            Line("📍", "Kanal", `${channel} (\`${channel.id}\`)`),
            Line("🗂️", "Typ", ChannelType[channel.type] ?? String(channel.type)),
            Line("📁", "Kategorie", channel.parent ? channel.parent.name : "_keine_"),
            actor ? Line("👮", "Erstellt von", Mention(actor.id, actor.tag)) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(channel.guild.id, { type: LogType.CHANNEL, title: "Kanal erstellt", description });
    }
}

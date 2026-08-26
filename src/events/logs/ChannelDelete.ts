import { AuditLogEvent, ChannelType, Events, GuildChannel } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, Mention } from "../../constants/Logging";

export default class ChannelDelete extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.ChannelDelete, description: "Protokolliert gelöschte Kanäle", once: false });
    }

    async Execute(channel: GuildChannel): Promise<void> {
        if (!channel.guild) return;

        const service = this.client.loggingService;
        const actor = service.Actor(
            await service.Audit(channel.guild, AuditLogEvent.ChannelDelete, { targetId: channel.id })
        );

        const description = [
            Line("📍", "Kanal", `\`${channel.name}\` (\`${channel.id}\`)`),
            Line("🗂️", "Typ", ChannelType[channel.type] ?? String(channel.type)),
            Line("📁", "Kategorie", channel.parent ? channel.parent.name : "_keine_"),
            actor ? Line("👮", "Gelöscht von", Mention(actor.id, actor.tag)) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(channel.guild.id, { type: LogType.CHANNEL, title: "Kanal gelöscht", description });
    }
}

import { AuditLogEvent, Events, GuildBan } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, Mention } from "../../constants/Logging";

export default class BanRemove extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildBanRemove,
            description: "Protokolliert Entbannungen im Moderations-Log",
            once: false,
        });
    }

    async Execute(ban: GuildBan): Promise<void> {
        const service = this.client.loggingService;
        const entry = await service.Audit(ban.guild, AuditLogEvent.MemberBanRemove, { targetId: ban.user.id });
        const actor = service.Actor(entry);

        const description = [
            Line("👤", "Mitglied", Mention(ban.user.id, ban.user.tag)),
            actor ? Line("👮", "Entbannt von", Mention(actor.id, actor.tag)) : null,
            actor?.reason ? Line("📋", "Grund", actor.reason) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(ban.guild.id, {
            type: LogType.MODERATION,
            title: "Bann aufgehoben",
            description,
            thumbnailUrl: ban.user.displayAvatarURL({ size: 256 }),
        });
    }
}

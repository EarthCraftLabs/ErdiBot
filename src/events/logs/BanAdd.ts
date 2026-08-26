import { AuditLogEvent, Events, GuildBan } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, Mention } from "../../constants/Logging";

export default class BanAdd extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildBanAdd,
            description: "Protokolliert Banns im Moderations-Log",
            once: false,
        });
    }

    async Execute(ban: GuildBan): Promise<void> {
        const service = this.client.loggingService;
        const entry = await service.Audit(ban.guild, AuditLogEvent.MemberBanAdd, { targetId: ban.user.id });
        const actor = service.Actor(entry);

        const description = [
            Line("👤", "Mitglied", Mention(ban.user.id, ban.user.tag)),
            actor ? Line("👮", "Gebannt von", Mention(actor.id, actor.tag)) : null,
            Line("📋", "Grund", actor?.reason ?? ban.reason ?? "_kein Grund angegeben_"),
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(ban.guild.id, {
            type: LogType.MODERATION,
            title: "Mitglied gebannt",
            description,
            thumbnailUrl: ban.user.displayAvatarURL({ size: 256 }),
        });
    }
}

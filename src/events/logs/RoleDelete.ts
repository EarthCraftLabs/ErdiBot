import { AuditLogEvent, Events, Role } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, Mention } from "../../constants/Logging";

export default class RoleDelete extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.GuildRoleDelete, description: "Protokolliert gelöschte Rollen", once: false });
    }

    async Execute(role: Role): Promise<void> {
        const service = this.client.loggingService;
        const actor = service.Actor(await service.Audit(role.guild, AuditLogEvent.RoleDelete, { targetId: role.id }));

        const description = [
            Line("🏷️", "Rolle", `\`${role.name}\` (\`${role.id}\`)`),
            Line("🎨", "Farbe", role.hexColor),
            Line("👥", "Hatte Mitglieder", String(role.members.size)),
            actor ? Line("👮", "Gelöscht von", Mention(actor.id, actor.tag)) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(role.guild.id, { type: LogType.ROLE, title: "Rolle gelöscht", description });
    }
}

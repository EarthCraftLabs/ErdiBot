import { AuditLogEvent, Events, Role } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, Mention } from "../../constants/Logging";

export default class RoleCreate extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.GuildRoleCreate, description: "Protokolliert neue Rollen", once: false });
    }

    async Execute(role: Role): Promise<void> {
        const service = this.client.loggingService;
        const actor = service.Actor(await service.Audit(role.guild, AuditLogEvent.RoleCreate, { targetId: role.id }));

        const description = [
            Line("🏷️", "Rolle", `${role} (\`${role.id}\`)`),
            Line("🎨", "Farbe", role.hexColor),
            Line("👁️", "Separat angezeigt", role.hoist ? "ja" : "nein"),
            Line("🔔", "Erwähnbar", role.mentionable ? "ja" : "nein"),
            actor ? Line("👮", "Erstellt von", Mention(actor.id, actor.tag)) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(role.guild.id, { type: LogType.ROLE, title: "Rolle erstellt", description });
    }
}

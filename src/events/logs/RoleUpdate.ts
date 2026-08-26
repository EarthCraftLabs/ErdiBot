import { AuditLogEvent, Events, Role } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Change, Line, List, Mention } from "../../constants/Logging";

export default class RoleUpdate extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.GuildRoleUpdate, description: "Protokolliert geänderte Rollen", once: false });
    }

    async Execute(before: Role, after: Role): Promise<void> {
        const changes = [
            Change("Name", before.name, after.name, "📛"),
            Change("Farbe", before.hexColor, after.hexColor, "🎨"),
            Change("Separat angezeigt", before.hoist, after.hoist, "👁️"),
            Change("Erwähnbar", before.mentionable, after.mentionable, "🔔"),
        ].filter((line): line is string => line !== null);

        const beforePermissions = before.permissions.toArray();
        const afterPermissions = after.permissions.toArray();

        const granted = afterPermissions.filter((permission) => !beforePermissions.includes(permission));
        const revoked = beforePermissions.filter((permission) => !afterPermissions.includes(permission));

        if (granted.length > 0) changes.push(Line("➕", "Rechte erhalten", List(granted)));
        if (revoked.length > 0) changes.push(Line("➖", "Rechte entzogen", List(revoked)));

        // Discord feuert roleUpdate auch bei reinen Sortierungsänderungen - dann gibt es nichts zu melden.
        if (changes.length === 0) return;

        const service = this.client.loggingService;
        const actor = service.Actor(await service.Audit(after.guild, AuditLogEvent.RoleUpdate, { targetId: after.id }));

        const description = [
            Line("🏷️", "Rolle", `${after} (\`${after.id}\`)`),
            actor ? Line("👮", "Geändert von", Mention(actor.id, actor.tag)) : null,
            "",
            ...changes,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(after.guild.id, { type: LogType.ROLE, title: "Rolle geändert", description });
    }
}

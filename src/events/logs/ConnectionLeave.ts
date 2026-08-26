import { AuditLogEvent, Events, GuildMember, PartialGuildMember } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, List, Mention } from "../../constants/Logging";

export default class ConnectionLeave extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildMemberRemove,
            description: "Protokolliert Austritte und Kicks",
            once: false,
        });
    }

    async Execute(member: GuildMember | PartialGuildMember): Promise<void> {
        const service = this.client.loggingService;

        // Discord kennt kein "kick"-Event: ein Kick sieht aus wie ein Austritt und ist nur
        // über das Audit-Log davon zu unterscheiden.
        const entry = await service.Audit(member.guild, AuditLogEvent.MemberKick, { targetId: member.id });
        const actor = service.Actor(entry);

        const roles = member.roles?.cache
            .filter((role) => role.id !== member.guild.id)
            .map((role) => role.toString());

        const joined = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

        const description = [
            Line("👤", "Mitglied", Mention(member.id, member.user?.tag)),
            joined ? Line("📅", "Beigetreten", `<t:${joined}:D>`) : null,
            Line("🔢", "Verbleibend", String(member.guild.memberCount)),
            Line("🏷️", "Rollen", List(roles ?? [])),
            actor ? `\n👮 **Gekickt von:** ${Mention(actor.id, actor.tag)}` : null,
            actor?.reason ? Line("📋", "Grund", actor.reason) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(member.guild.id, {
            type: actor ? LogType.MODERATION : LogType.CONNECTION,
            title: actor ? "Mitglied gekickt" : "Mitglied verlassen",
            description,
            thumbnailUrl: member.user?.displayAvatarURL({ size: 256 }) ?? null,
        });
    }
}

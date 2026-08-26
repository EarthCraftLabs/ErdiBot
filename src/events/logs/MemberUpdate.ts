import { AuditLogEvent, Events, GuildMember, PartialGuildMember } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Change, Line, List, Mention } from "../../constants/Logging";

export default class MemberUpdate extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildMemberUpdate,
            description: "Protokolliert Nickname, Rollen und Timeouts",
            once: false,
        });
    }

    async Execute(before: GuildMember | PartialGuildMember, after: GuildMember): Promise<void> {
        const who = Line("👤", "Mitglied", Mention(after.id, after.user.tag));
        const thumbnail = after.user.displayAvatarURL({ size: 256 });

        // Ein Timeout ist eine Moderationshandlung und gehört nicht ins Profil-Log.
        if (before.communicationDisabledUntilTimestamp !== after.communicationDisabledUntilTimestamp) {
            await this.Timeout(after, who, thumbnail);
        }

        const service = this.client.loggingService;
        const nickname = Change("Nickname", before.nickname, after.nickname, "🏷️");

        if (nickname) {
            await service.Send(after.guild.id, {
                type: LogType.PROFILE,
                title: "Nickname geändert",
                description: [who, nickname].join("\n"),
                thumbnailUrl: thumbnail,
            });
        }

        const beforeRoles = before.roles?.cache;
        const added = after.roles.cache.filter((role) => !beforeRoles?.has(role.id));
        const removed = beforeRoles?.filter((role) => !after.roles.cache.has(role.id));

        if (added.size === 0 && (removed?.size ?? 0) === 0) return;

        const entry = await service.Audit(after.guild, AuditLogEvent.MemberRoleUpdate, { targetId: after.id });
        const actor = service.Actor(entry);

        const description = [
            who,
            added.size > 0 ? Line("➕", "Erhalten", List(added.map((role) => role.toString()))) : null,
            removed && removed.size > 0 ? Line("➖", "Verloren", List(removed.map((role) => role.toString()))) : null,
            actor ? Line("👮", "Geändert von", Mention(actor.id, actor.tag)) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(after.guild.id, {
            type: LogType.PROFILE,
            title: "Rollen geändert",
            description,
            thumbnailUrl: thumbnail,
        });
    }

    private async Timeout(member: GuildMember, who: string, thumbnail: string): Promise<void> {
        const service = this.client.loggingService;
        const until = member.communicationDisabledUntilTimestamp;

        const entry = await service.Audit(member.guild, AuditLogEvent.MemberUpdate, { targetId: member.id });
        const actor = service.Actor(entry);

        const description = [
            who,
            until ? Line("⏳", "Läuft ab", `<t:${Math.floor(until / 1000)}:f> · <t:${Math.floor(until / 1000)}:R>`) : null,
            actor ? Line("👮", "Von", Mention(actor.id, actor.tag)) : null,
            actor?.reason ? Line("📋", "Grund", actor.reason) : null,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(member.guild.id, {
            type: LogType.MODERATION,
            title: until ? "Timeout gesetzt" : "Timeout aufgehoben",
            description,
            thumbnailUrl: thumbnail,
        });
    }
}

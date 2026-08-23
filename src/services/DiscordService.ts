import { Guild, GuildMember, PermissionFlagsBits, Role } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import IApiGuild from "../interfaces/services/discord/IApiGuild";
import IApiMember from "../interfaces/services/discord/IApiMember";
import IApiRole from "../interfaces/services/discord/IApiRole";
import IDiscordService, { RoleResult } from "../interfaces/services/discord/IDiscordService";
import { SNOWFLAKE } from "../constants/Discord";
import logger from "../utils/logger";

const CACHE_MAX = 500;
const CACHE_TTL = 60_000;

export default class DiscordService implements IDiscordService {
    client: BotClient;

    private members: LRUCache<string, GuildMember>;

    constructor(client: BotClient) {
        this.client = client;
        this.members = new LRUCache({ max: CACHE_MAX, ttl: CACHE_TTL });
    }

    get Size(): number {
        return this.members.size;
    }

    async Guild(guildId: string): Promise<Guild | null> {
        if (!SNOWFLAKE.test(guildId)) return null;

        const cached = this.client.guilds.cache.get(guildId);
        if (cached) return cached;

        return this.client.guilds.fetch(guildId).catch(() => null);
    }

    async Member(guildId: string, userId: string): Promise<GuildMember | null> {
        if (!SNOWFLAKE.test(userId)) return null;

        const key = `${guildId}:${userId}`;
        const cached = this.members.get(key);

        if (cached) return cached;

        const guild = await this.Guild(guildId);
        if (!guild) return null;

        const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
        if (!member) return null;

        this.members.set(key, member);

        return member;
    }

    Guilds(): IApiGuild[] {
        return [...this.client.guilds.cache.values()].map((guild) => this.ToGuild(guild));
    }

    ToGuild(guild: Guild): IApiGuild {
        return {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL(),
            memberCount: guild.memberCount,
            roles: [...guild.roles.cache.values()]
                .sort((left, right) => right.position - left.position)
                .map((role) => this.ToRole(guild, role)),
        };
    }

    ToMember(member: GuildMember): IApiMember {
        return {
            id: member.id,
            username: member.user.username,
            displayName: member.displayName,
            nickname: member.nickname,
            avatar: member.displayAvatarURL(),
            joinedAt: member.joinedAt?.toISOString() ?? null,
            roles: [...member.roles.cache.keys()].filter((id) => id !== member.guild.id),
        };
    }

    async GrantRole(guildId: string, userId: string, roleId: string): Promise<RoleResult> {
        return this.Apply(guildId, userId, roleId, true);
    }

    async RevokeRole(guildId: string, userId: string, roleId: string): Promise<RoleResult> {
        return this.Apply(guildId, userId, roleId, false);
    }

    Invalidate(guildId?: string, userId?: string): void {
        if (!guildId) {
            this.members.clear();
            return;
        }

        if (userId) {
            this.members.delete(`${guildId}:${userId}`);
            return;
        }

        for (const key of [...this.members.keys()]) {
            if (key.startsWith(`${guildId}:`)) this.members.delete(key);
        }
    }

    private ToRole(guild: Guild, role: Role): IApiRole {
        return {
            id: role.id,
            name: role.name,
            color: role.color,
            position: role.position,
            managed: role.managed,
            assignable: this.Blocked(guild, role) === null,
        };
    }

    private async Apply(guildId: string, userId: string, roleId: string, grant: boolean): Promise<RoleResult> {
        const guild = await this.Guild(guildId);
        if (!guild) return { ok: false, status: 404, error: "Unbekannter Server" };

        const member = await this.Member(guildId, userId);
        if (!member) return { ok: false, status: 404, error: "Unbekanntes Mitglied" };

        const role = SNOWFLAKE.test(roleId) ? guild.roles.cache.get(roleId) : undefined;
        if (!role) return { ok: false, status: 404, error: "Unbekannte Rolle" };

        const blocked = this.Blocked(guild, role);
        if (blocked) return { ok: false, status: 403, error: blocked };

        if (member.roles.cache.has(roleId) === grant) return { ok: true, changed: false };

        try {
            if (grant) await member.roles.add(role);
            else await member.roles.remove(role);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            logger.error(`[DiscordService] Rolle "${role.name}" konnte nicht geändert werden: ${normalized.message}`);

            return { ok: false, status: 502, error: "Discord hat die Änderung abgelehnt" };
        }

        this.Invalidate(guildId, userId);

        logger.info(
            `🛡️  Rolle "${role.name}" ${grant ? "vergeben an" : "entzogen von"} ` +
                `${member.user.username} in ${guild.name}`
        );

        return { ok: true, changed: true };
    }

    private Blocked(guild: Guild, role: Role): string | null {
        const me = guild.members.me;

        if (!me) return "Der Bot ist nicht auf diesem Server";
        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return "Dem Bot fehlt die Berechtigung Rollen verwalten";
        if (role.id === guild.id) return "Die @everyone-Rolle kann nicht vergeben werden";
        if (role.managed) return "Diese Rolle wird von einer Integration verwaltet";
        if (me.roles.highest.comparePositionTo(role) <= 0) return "Die Rolle steht über der höchsten Rolle des Bots";

        return null;
    }
}

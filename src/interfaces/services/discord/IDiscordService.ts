import { Guild, GuildMember } from "discord.js";
import IApiGuild from "./IApiGuild";
import IApiMember from "./IApiMember";

export type RoleResult = { ok: true; changed: boolean } | { ok: false; status: number; error: string };

export default interface IDiscordService {
    readonly Size: number;

    Guild(guildId: string): Promise<Guild | null>;
    Member(guildId: string, userId: string): Promise<GuildMember | null>;

    Guilds(): IApiGuild[];
    ToGuild(guild: Guild): IApiGuild;
    ToMember(member: GuildMember): IApiMember;

    GrantRole(guildId: string, userId: string, roleId: string): Promise<RoleResult>;
    RevokeRole(guildId: string, userId: string, roleId: string): Promise<RoleResult>;

    Invalidate(guildId?: string, userId?: string): void;
}

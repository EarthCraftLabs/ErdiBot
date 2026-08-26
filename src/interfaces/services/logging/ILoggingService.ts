import { AuditLogEvent, Guild, GuildAuditLogsEntry, GuildTextBasedChannel } from "discord.js";
import BotClient from "../../../client/BotClient";
import LogType from "../../../enums/LogType";
import IDiscordLogChannel from "../../database/models/IDiscordLogChannel";
import { IActor, ILogEntry } from "./ILogEntry";

export interface IAuditOptions {
    targetId?: string | null;
    withinMs?: number;
    matches?: (entry: GuildAuditLogsEntry) => boolean;
}

export interface ILogHealth {
    logType: LogType;
    channelId: string;
    name: string;
    exists: boolean;
    isThread: boolean;
    archived: boolean;
    writable: boolean;
    problem: string | null;
}

export default interface ILoggingService {
    client: BotClient;

    Targets(guildId: string): Promise<IDiscordLogChannel[]>;
    Target(guildId: string, logType: LogType): Promise<IDiscordLogChannel | null>;

    Set(guildId: string, logType: LogType, channelId: string, name: string): Promise<void>;
    Clear(guildId: string, logType: LogType): Promise<boolean>;

    Send(guildId: string, entry: ILogEntry): Promise<boolean>;
    Writable(channelId: string): Promise<GuildTextBasedChannel | null>;
    Health(guildId: string): Promise<ILogHealth[]>;

    Audit(guild: Guild, type: AuditLogEvent, options?: IAuditOptions): Promise<GuildAuditLogsEntry | null>;
    Actor(entry: GuildAuditLogsEntry | null): IActor | null;
}

import {
    AuditLogEvent,
    Guild,
    GuildAuditLogsEntry,
    GuildTextBasedChannel,
    ThreadChannel,
} from "discord.js";
import BotClient from "../client/BotClient";
import BuildLogMessage from "../builder/LogMessage";
import LogType from "../enums/LogType";
import IDiscordLogChannel from "../interfaces/database/models/IDiscordLogChannel";
import { IActor, ILogEntry } from "../interfaces/services/logging/ILogEntry";
import ILoggingService, { IAuditOptions, ILogHealth } from "../interfaces/services/logging/ILoggingService";
import { AUDIT_WINDOW, CATEGORIES, Category } from "../constants/Logging";
import logger from "../utils/logger";

const MODEL = "DiscordLogChannel";

export default class LoggingService implements ILoggingService {
    client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    async Initialize(): Promise<void> {
        logger.info(`🗒️  Logging bereit (${CATEGORIES.length} Kategorien)`);
    }

    async Targets(guildId: string): Promise<IDiscordLogChannel[]> {
        return this.Records().Find({ guildId });
    }

    async Target(guildId: string, logType: LogType): Promise<IDiscordLogChannel | null> {
        return this.Records().FindOne({ guildId, logType });
    }

    async Set(guildId: string, logType: LogType, channelId: string, name: string): Promise<void> {
        const values = { name, channelId };
        const records = this.Records();

        const updated = await records.Update({ guildId, logType }, values);

        if (updated === 0) await records.Insert({ guildId, logType, ...values });
    }

    async Clear(guildId: string, logType: LogType): Promise<boolean> {
        return (await this.Records().Delete({ guildId, logType })) > 0;
    }

    // Der einzige Weg, auf dem ein Log rausgeht. Gibt zurück, ob es geklappt hat -
    // Aufrufer dürfen das ignorieren, ein fehlender Log-Kanal ist kein Fehler.
    async Send(guildId: string, entry: ILogEntry): Promise<boolean> {
        if (!this.client.database.IsReady) return false;

        const target = await this.Target(guildId, entry.type).catch(() => null);
        if (!target) return false;

        const channel = await this.Writable(target.channelId);
        if (!channel) return false;

        const sent = await channel.send(BuildLogMessage(entry)).catch((error) => {
            logger.debug(`[Logging] ${Category(entry.type).label} konnte nicht senden: ${error}`);

            return null;
        });

        return sent !== null;
    }

    async Health(guildId: string): Promise<ILogHealth[]> {
        const targets = await this.Targets(guildId).catch(() => []);
        const byType = new Map(targets.map((target) => [target.logType, target]));

        const health: ILogHealth[] = [];

        for (const category of CATEGORIES) {
            const target = byType.get(category.type);
            if (!target) continue;

            const channel = await this.client.channels.fetch(target.channelId).catch(() => null);
            const thread = channel?.isThread() ? (channel as ThreadChannel) : null;

            const problem = !channel
                ? "Kanal existiert nicht mehr"
                : !channel.isTextBased()
                  ? "Kanal nimmt keine Nachrichten an"
                  : !this.MayWrite(channel as GuildTextBasedChannel)
                    ? "Dem Bot fehlt die Schreibberechtigung"
                    : null;

            health.push({
                logType: category.type,
                channelId: target.channelId,
                name: target.name,
                exists: channel !== null,
                isThread: thread !== null,
                archived: thread?.archived === true,
                writable: problem === null,
                problem,
            });
        }

        return health;
    }

    // ── Audit-Log ──────────────────────────────────────────────────────────
    // Discord-Events sagen, WAS passiert ist, aber nicht WER es war. Das steht
    // nur im Audit-Log, und dort auch erst kurz nach dem Event.

    async Audit(guild: Guild, type: AuditLogEvent, options: IAuditOptions = {}): Promise<GuildAuditLogsEntry | null> {
        const { targetId = null, withinMs = AUDIT_WINDOW, matches = null } = options;

        // Ohne dieses Recht liefert Discord einen Fehler statt einer leeren Liste.
        if (!guild.members.me?.permissions.has("ViewAuditLog")) return null;

        const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
        if (!logs) return null;

        return (
            logs.entries.find((entry) => {
                // Das Ziel eines Eintrags ist je nach Typ ein anderes Objekt - manche davon
                // (etwa Invite) haben gar keine id. Deshalb defensiv zugreifen statt casten.
                if (targetId && (entry.target as { id?: string } | null)?.id !== targetId) return false;
                if (Date.now() - entry.createdTimestamp > withinMs) return false;
                if (matches && !matches(entry)) return false;

                return true;
            }) ?? null
        );
    }

    Actor(entry: GuildAuditLogsEntry | null): IActor | null {
        if (!entry?.executor) return null;

        // executor kann ein unvollständiger User sein - dann bleibt nur die ID.
        return { id: entry.executor.id, tag: entry.executor.tag ?? entry.executor.id, reason: entry.reason ?? null };
    }

    // ── Intern ─────────────────────────────────────────────────────────────

    private Records() {
        return this.client.database.GetRepository<IDiscordLogChannel>(MODEL);
    }

    // Ein archivierter Thread nimmt über die API keine Nachrichten an. Der Discord-Client
    // entarchiviert beim Tippen automatisch, der Bot muss es selbst tun - sonst gehen Logs
    // still verloren, sobald ein Thread nach seiner autoArchiveDuration eingeschlafen ist.
    // Öffentlich, weil der Guardian seinen Fehler-Kanal über denselben Weg erreicht.
    async Writable(channelId: string): Promise<GuildTextBasedChannel | null> {
        const channel = await this.client.channels.fetch(channelId).catch(() => null);

        if (!channel?.isTextBased() || channel.isDMBased()) return null;

        const target = channel as GuildTextBasedChannel;

        if (target.isThread()) {
            const thread = target as ThreadChannel;

            if (thread.locked) return null;

            if (thread.archived) {
                const woken = await thread.setArchived(false).catch(() => null);
                if (!woken) return null;
            }
        }

        return this.MayWrite(target) ? target : null;
    }

    private MayWrite(channel: GuildTextBasedChannel): boolean {
        const me = channel.guild.members.me;
        if (!me) return false;

        const permissions = channel.permissionsFor(me);
        if (!permissions) return false;

        return channel.isThread()
            ? permissions.has(["ViewChannel", "SendMessagesInThreads"])
            : permissions.has(["ViewChannel", "SendMessages"]);
    }
}

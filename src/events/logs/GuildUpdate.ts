import { AuditLogEvent, Events, Guild } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Change, Line, Mention } from "../../constants/Logging";

export default class GuildUpdate extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.GuildUpdate, description: "Protokolliert Server-Einstellungen", once: false });
    }

    async Execute(before: Guild, after: Guild): Promise<void> {
        const changes = [
            Change("Name", before.name, after.name, "📛"),
            Change("Besitzer", before.ownerId, after.ownerId, "👑"),
            Change("Beschreibung", before.description, after.description, "📝"),
            Change("Verifizierungsstufe", before.verificationLevel, after.verificationLevel, "🛡️"),
            Change("Explizit-Filter", before.explicitContentFilter, after.explicitContentFilter, "🔞"),
            Change("AFK-Kanal", before.afkChannel?.name, after.afkChannel?.name, "💤"),
            Change("Systemkanal", before.systemChannel?.name, after.systemChannel?.name, "📢"),
            before.icon !== after.icon ? Line("🖼️", "Server-Icon", "wurde geändert") : null,
            before.banner !== after.banner ? Line("🎌", "Server-Banner", "wurde geändert") : null,
        ].filter((line): line is string => line !== null);

        if (changes.length === 0) return;

        const service = this.client.loggingService;
        const actor = service.Actor(await service.Audit(after, AuditLogEvent.GuildUpdate));

        const description = [actor ? Line("👮", "Geändert von", Mention(actor.id, actor.tag)) : null, "", ...changes]
            .filter(Boolean)
            .join("\n");

        await service.Send(after.id, {
            type: LogType.AUDIT,
            title: "Server-Einstellungen geändert",
            description,
            thumbnailUrl: after.iconURL({ size: 256 }),
        });
    }
}

import { AuditLogEvent, Events, GuildChannel, TextChannel, VoiceChannel } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Change, Line, Mention } from "../../constants/Logging";

export default class ChannelUpdate extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.ChannelUpdate, description: "Protokolliert geänderte Kanäle", once: false });
    }

    async Execute(before: GuildChannel, after: GuildChannel): Promise<void> {
        if (!after.guild) return;

        const changes = [
            Change("Name", before.name, after.name, "📛"),
            Change("Kategorie", before.parent?.name, after.parent?.name, "📁"),
            Change("Thema", (before as TextChannel).topic, (after as TextChannel).topic, "📝"),
            Change("NSFW", (before as TextChannel).nsfw, (after as TextChannel).nsfw, "🔞"),
            Change(
                "Slowmode",
                (before as TextChannel).rateLimitPerUser,
                (after as TextChannel).rateLimitPerUser,
                "⏱️"
            ),
            Change("Bitrate", (before as VoiceChannel).bitrate, (after as VoiceChannel).bitrate, "🎚️"),
            Change("Nutzerlimit", (before as VoiceChannel).userLimit, (after as VoiceChannel).userLimit, "👥"),
        ].filter((line): line is string => line !== null);

        // Reine Sortierungs- und Rechte-Änderungen feuern ebenfalls - ohne sichtbare
        // Änderung gibt es nichts zu protokollieren.
        if (changes.length === 0) return;

        const service = this.client.loggingService;
        const actor = service.Actor(
            await service.Audit(after.guild, AuditLogEvent.ChannelUpdate, { targetId: after.id })
        );

        const description = [
            Line("📍", "Kanal", `${after} (\`${after.id}\`)`),
            actor ? Line("👮", "Geändert von", Mention(actor.id, actor.tag)) : null,
            "",
            ...changes,
        ]
            .filter(Boolean)
            .join("\n");

        await service.Send(after.guild.id, { type: LogType.CHANNEL, title: "Kanal geändert", description });
    }
}

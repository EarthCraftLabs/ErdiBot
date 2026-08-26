import { Events, Message, PartialMessage } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Channel, Cut, Line, Mention } from "../../constants/Logging";

export default class MessageUpdate extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.MessageUpdate,
            description: "Protokolliert bearbeitete Nachrichten",
            once: false,
        });
    }

    async Execute(before: Message | PartialMessage, after: Message | PartialMessage): Promise<void> {
        if (!after.guild) return;
        if (after.author?.bot) return;

        // Discord feuert messageUpdate auch, wenn nur eine Link-Vorschau nachgeladen oder
        // eine Nachricht angepinnt wird. Ohne diese Prüfung besteht das Log daraus.
        if (before.content === after.content) return;

        const description = [
            Line("👤", "Autor", after.author ? Mention(after.author.id, after.author.tag) : "_nicht im Cache_"),
            Line("📍", "Kanal", Channel(after.channelId)),
            Line("🔗", "Sprung", `[zur Nachricht](${after.url})`),
            "",
            `📝 **Vorher:**\n${before.content ? Cut(before.content, 700) : "_nicht im Cache_"}`,
            "",
            `✏️ **Nachher:**\n${after.content ? Cut(after.content, 700) : "_leer_"}`,
        ].join("\n");

        await this.client.loggingService.Send(after.guild.id, {
            type: LogType.MESSAGE,
            title: "Nachricht bearbeitet",
            description,
            thumbnailUrl: after.author?.displayAvatarURL({ size: 256 }) ?? null,
        });
    }
}

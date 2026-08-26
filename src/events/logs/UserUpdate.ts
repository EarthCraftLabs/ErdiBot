import { Events, PartialUser, User } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Change, Line, Mention } from "../../constants/Logging";

export default class UserUpdate extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.UserUpdate,
            description: "Protokolliert Benutzername und Avatar",
            once: false,
        });
    }

    async Execute(before: User | PartialUser, after: User): Promise<void> {
        const name = Change("Benutzername", before.username, after.username, "📛");
        const avatarChanged = before.avatar !== after.avatar;

        if (!name && !avatarChanged) return;

        const who = Line("👤", "Mitglied", Mention(after.id, after.tag));

        const description = [who, name, avatarChanged ? Line("🖼️", "Avatar", "wurde geändert") : null]
            .filter(Boolean)
            .join("\n");

        // userUpdate ist kein Server-Event: Discord meldet es für jede Guild, in der der
        // Bot den Nutzer sieht. Also an jede davon einzeln loggen.
        const guilds = this.client.guilds.cache.filter((guild) => guild.members.cache.has(after.id));

        for (const guild of guilds.values()) {
            await this.client.loggingService.Send(guild.id, {
                type: LogType.PROFILE,
                title: avatarChanged && !name ? "Avatar geändert" : "Profil geändert",
                description,
                thumbnailUrl: after.displayAvatarURL({ size: 256 }),
            });
        }
    }
}

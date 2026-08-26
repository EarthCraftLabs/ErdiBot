import { Events, GuildMember } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Line, Mention } from "../../constants/Logging";

export default class ConnectionJoin extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildMemberAdd,
            description: "Protokolliert Beitritte im Verbindungs-Log",
            once: false,
        });
    }

    async Execute(member: GuildMember): Promise<void> {
        const created = Math.floor(member.user.createdTimestamp / 1000);
        const age = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);

        const description = [
            Line("👤", "Mitglied", Mention(member.id, member.user.tag)),
            Line("📅", "Konto erstellt", `<t:${created}:D> (vor ${age} Tagen)`),
            Line("🔢", "Mitglied Nr.", String(member.guild.memberCount)),
            member.user.bot ? Line("🤖", "Typ", "Bot") : null,
            // Ein frisches Konto ist das häufigste Merkmal von Raid- und Spam-Accounts.
            age < 7 ? "\n⚠️ **Das Konto ist jünger als eine Woche.**" : null,
        ]
            .filter(Boolean)
            .join("\n");

        await this.client.loggingService.Send(member.guild.id, {
            type: LogType.CONNECTION,
            title: "Mitglied beigetreten",
            description,
            thumbnailUrl: member.user.displayAvatarURL({ size: 256 }),
        });
    }
}

import { Events, Invite } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Channel, Line } from "../../constants/Logging";

export default class InviteDelete extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.InviteDelete, description: "Protokolliert gelöschte Einladungen", once: false });
    }

    async Execute(invite: Invite): Promise<void> {
        if (!invite.guild) return;

        const description = [
            Line("🔗", "Code", `\`${invite.code}\``),
            Line("📍", "Kanal", Channel(invite.channelId)),
        ].join("\n");

        await this.client.loggingService.Send(invite.guild.id, {
            type: LogType.AUDIT,
            title: "Einladung gelöscht",
            description,
        });
    }
}

import { Events, Invite } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Channel, Line, Mention } from "../../constants/Logging";

export default class InviteCreate extends Event {
    constructor(client: BotClient) {
        super(client, { name: Events.InviteCreate, description: "Protokolliert neue Einladungen", once: false });
    }

    async Execute(invite: Invite): Promise<void> {
        if (!invite.guild) return;

        const expires = invite.expiresTimestamp ? Math.floor(invite.expiresTimestamp / 1000) : null;

        const description = [
            Line("🔗", "Code", `\`${invite.code}\``),
            Line("📍", "Kanal", Channel(invite.channelId)),
            invite.inviter ? Line("👮", "Erstellt von", Mention(invite.inviter.id, invite.inviter.tag)) : null,
            Line("🔢", "Maximale Nutzungen", invite.maxUses ? String(invite.maxUses) : "unbegrenzt"),
            Line("⏳", "Läuft ab", expires ? `<t:${expires}:R>` : "nie"),
        ]
            .filter(Boolean)
            .join("\n");

        await this.client.loggingService.Send(invite.guild.id, {
            type: LogType.AUDIT,
            title: "Einladung erstellt",
            description,
        });
    }
}

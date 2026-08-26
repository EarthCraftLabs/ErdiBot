import { Events, VoiceState } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import { Channel, Line, Mention } from "../../constants/Logging";

export default class VoiceStateLog extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.VoiceStateUpdate,
            description: "Protokolliert Aktivität in Sprachkanälen",
            once: false,
        });
    }

    async Execute(before: VoiceState, after: VoiceState): Promise<void> {
        const member = after.member ?? before.member;
        const guildId = after.guild?.id ?? before.guild?.id;

        if (!member || !guildId || member.user.bot) return;

        const who = Line("👤", "Mitglied", Mention(member.id, member.user.tag));

        const change = this.Describe(before, after, who);
        if (!change) return;

        await this.client.loggingService.Send(guildId, {
            type: LogType.VOICE,
            title: change.title,
            description: change.description,
            thumbnailUrl: member.user.displayAvatarURL({ size: 256 }),
        });
    }

    private Describe(before: VoiceState, after: VoiceState, who: string): { title: string; description: string } | null {
        if (!before.channelId && after.channelId) {
            return {
                title: "Sprachkanal betreten",
                description: [who, Line("🔊", "Kanal", Channel(after.channelId))].join("\n"),
            };
        }

        if (before.channelId && !after.channelId) {
            return {
                title: "Sprachkanal verlassen",
                description: [who, Line("🔇", "Kanal", Channel(before.channelId))].join("\n"),
            };
        }

        if (before.channelId !== after.channelId) {
            return {
                title: "Sprachkanal gewechselt",
                description: [
                    who,
                    Line("⬅️", "Von", Channel(before.channelId)),
                    Line("➡️", "Nach", Channel(after.channelId)),
                ].join("\n"),
            };
        }

        // Selbst stumm geschaltet ist Alltag und würde das Log fluten. Nur die serverseitige
        // Schaltung ist eine Moderationshandlung und damit einen Eintrag wert.
        if (before.serverMute !== after.serverMute) {
            return {
                title: after.serverMute ? "Server-stumm geschaltet" : "Server-Stummschaltung aufgehoben",
                description: [who, Line("🔊", "Kanal", Channel(after.channelId))].join("\n"),
            };
        }

        if (before.serverDeaf !== after.serverDeaf) {
            return {
                title: after.serverDeaf ? "Server-taub geschaltet" : "Server-Taubschaltung aufgehoben",
                description: [who, Line("🔊", "Kanal", Channel(after.channelId))].join("\n"),
            };
        }

        return null;
    }
}

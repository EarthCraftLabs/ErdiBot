import { Events, GuildMember, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import BuildWelcome from "../../builder/WelcomeMessage";
import logger from "../../utils/logger";

export default class GuildMemberAdd extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.GuildMemberAdd,
            description: "Schickt die Willkommensnachricht in den eingerichteten Kanal",
            once: false,
        });
    }

    async Execute(member: GuildMember): Promise<void> {
        if (member.user.bot) return;
        if (!this.client.database.IsReady) return;

        const config = await this.client.welcomeService.Get(member.guild.id);
        if (!config.enabled || !config.channelId) return;

        const channel = member.guild.channels.cache.get(config.channelId);

        if (!channel?.isTextBased()) {
            logger.warn(`👋 Willkommens-Kanal ${config.channelId} in ${member.guild.name} ist weg`);

            return;
        }

        try {
            const context = this.client.welcomeService.Context(member);
            const { components, files, componentsV2 } = await BuildWelcome(this.client, config, context);

            if (componentsV2) await channel.send({ components, files, flags: MessageFlags.IsComponentsV2 });
            else await channel.send({ files });
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.HandleGeneric(
                `Willkommensnachricht für ${member.user.tag} fehlgeschlagen`,
                "WelcomeService",
                normalized.stack
            );
        }
    }
}

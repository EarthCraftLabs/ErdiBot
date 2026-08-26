import { ThreadChannel } from "discord.js";
import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import IDiscordLogChannel from "../interfaces/database/models/IDiscordLogChannel";
import logger from "../utils/logger";

export default class LogThreadHeartbeat extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "LogThreadHeartbeat",
            description: "Weckt archivierte Log-Threads, damit keine Einträge verloren gehen",
            type: TaskTypes.DAILY,
            time: "04:00",
        });
    }

    async Execute(): Promise<void> {
        if (!this.client.database.IsReady) return;

        const targets = await this.client.database.GetRepository<IDiscordLogChannel>("DiscordLogChannel").Find({});

        let woken = 0;
        let broken = 0;

        for (const target of targets) {
            const channel = await this.client.channels.fetch(target.channelId).catch(() => null);

            if (!channel) {
                broken++;
                logger.warn(`🗒️  Log-Kanal ${target.channelId} (${target.logType}) existiert nicht mehr`);

                continue;
            }

            if (!channel.isThread()) continue;

            const thread = channel as ThreadChannel;

            if (thread.locked) {
                broken++;
                logger.warn(`🗒️  Log-Thread ${target.channelId} (${target.logType}) ist gesperrt`);

                continue;
            }

            // Nur der Weckruf zählt: allein das Entarchivieren setzt die Archivierungsfrist
            // zurück. Eine Nachricht zu schicken wäre sichtbarer Müll im Log-Kanal.
            if (thread.archived) {
                const ok = await thread.setArchived(false).catch(() => null);

                if (ok) woken++;
                else broken++;
            }
        }

        if (woken > 0 || broken > 0) {
            logger.tasks(`🗒️  Log-Threads: ${woken} geweckt${broken > 0 ? `, ${broken} nicht erreichbar` : ""}`);
        }
    }
}

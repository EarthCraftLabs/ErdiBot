import { ActivityType, Events } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

export default class Ready extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.ClientReady,
            description: "Ready event",
            once: true,
        });
    }

    async Execute(): Promise<void> {
        logger.info(`✅ Logged in as ${this.client.user?.username}`);

        let status = [
            {
                name: 'Ascension | /help',
                type: ActivityType.Listening,
            },
            {
                name: 'TypeScript Bot',
                type: ActivityType.Playing,
            },
            {
                name: 'Developed by MecryTv',
                type: ActivityType.Custom,
            }
        ];

        const statusInterval = setInterval(() => {
            const randomStatus = Math.floor(Math.random() * status.length);
            this.client.user?.setActivity(status[randomStatus]);
        }, 10000);

        logger.beforeExit(() => clearInterval(statusInterval));
    }
}
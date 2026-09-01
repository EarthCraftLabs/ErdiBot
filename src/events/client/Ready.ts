import { Events } from "discord.js";
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

        // Die Status-Rotation zieht der StatusService auf - hier stand sie fest im Code
        // und war weder abschaltbar noch erweiterbar.
        await this.client.statusService.Restart();
    }
}

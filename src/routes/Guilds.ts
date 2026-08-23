import BotClient from "../client/BotClient";
import Route from "../structures/Route";

export default class Guilds extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/guilds",
            description: "Alle Server, auf denen der Bot ist",
        });
    }

    async Handle(): Promise<unknown> {
        const guilds = this.client.discordService.Guilds();

        return { total: guilds.length, guilds };
    }
}

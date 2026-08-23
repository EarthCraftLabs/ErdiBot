import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";

export default class Guild extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/guilds/:guildId",
            description: "Ein Server samt seiner Rollen",
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { guildId } = request.params as { guildId: string };
        const guild = await this.client.discordService.Guild(guildId);

        if (!guild) return reply.code(404).send({ error: "Unbekannter Server" });

        return this.client.discordService.ToGuild(guild);
    }
}

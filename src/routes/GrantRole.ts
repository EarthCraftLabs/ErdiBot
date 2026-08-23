import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";

export default class GrantRole extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "PUT",
            path: "/guilds/:guildId/members/:userId/roles/:roleId",
            description: "Gibt einem Mitglied eine Rolle",
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { guildId, userId, roleId } = request.params as Record<string, string>;
        const result = await this.client.discordService.GrantRole(guildId, userId, roleId);

        if (!result.ok) return reply.code(result.status).send({ error: result.error });

        return { changed: result.changed };
    }
}

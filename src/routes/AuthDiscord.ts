import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";

export default class AuthDiscord extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/auth/discord",
            description: "Startet die Anmeldung über Discord",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 20, timeWindow: "1 minute" },
        });
    }

    async Handle(_request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const service = this.client.oauthService;

        if (!service.Ready) return reply.code(503).send({ error: `OAuth2 ist nicht eingerichtet - ${service.Hint}` });

        // Der state entsteht erst hier, damit jeder Anlauf seinen eigenen bekommt.
        return reply.redirect(service.Authorize(), 302);
    }
}

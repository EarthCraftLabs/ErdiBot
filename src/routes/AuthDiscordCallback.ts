import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";

interface ICallbackQuery {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
}

export default class AuthDiscordCallback extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/auth/discord/callback",
            description: "Nimmt Discord entgegen, trägt den Nutzer ein und vergibt die Rolle",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 20, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { code, state, error, error_description } = request.query as ICallbackQuery;

        // Wer auf dem Consent-Screen abbricht, landet mit error=access_denied wieder hier.
        if (error) return reply.code(400).send({ error: error_description ?? error });

        const result = await this.client.oauthService.Login(code ?? "", state ?? "");

        if (!result.ok) return reply.code(result.status).send({ error: result.error });

        return result.value;
    }
}

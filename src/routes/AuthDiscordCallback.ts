import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { ParseDuration } from "../utils/duration";

const COOKIE_NAME = "erdibot_token";
const DEFAULT_LIFETIME = 2_592_000_000;

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

        // Der Callback landet im Browser: im Verlauf, in der Adressleiste, auf Screenshots.
        // Das Token gehört deshalb ins Cookie und nicht in die sichtbare Antwort.
        const { token, ...body } = result.value;

        reply.header("set-cookie", this.Cookie(token));

        return body;
    }

    private Cookie(token: string): string {
        const lifetime = ParseDuration(this.client.config.SERVER_JWT_EXPIRES_IN) ?? DEFAULT_LIFETIME;

        const parts = [
            `${COOKIE_NAME}=${token}`,
            "Path=/",
            "HttpOnly",
            "SameSite=Lax",
            `Max-Age=${Math.floor(lifetime / 1000)}`,
        ];

        // Secure würde das Cookie über http verwerfen - lokal läuft der Server ohne TLS.
        if (this.client.server.BaseURL.startsWith("https://")) parts.push("Secure");

        return parts.join("; ");
    }
}

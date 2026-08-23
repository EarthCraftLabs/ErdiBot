import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";

export default class Member extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/guilds/:guildId/members/:userId",
            description: "Ein Mitglied samt Nickname, Beitrittsdatum und Rollen",
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { guildId, userId } = request.params as { guildId: string; userId: string };
        const member = await this.client.discordService.Member(guildId, userId);

        if (!member) return reply.code(404).send({ error: "Unbekanntes Mitglied" });

        return this.client.discordService.ToMember(member);
    }
}

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "path";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { IsTranscriptId } from "../constants/Ticket";
import { TRANSCRIPT_ROOT } from "../services/TicketService";

export default class Transcripts extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/transcripts/:id",
            description: "Liefert ein Ticket-Transcript als HTML aus",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { id } = request.params as { id?: string };

        // Nur das exakte ID-Format wird durchgelassen. Damit ist ein Ausbruch aus dem
        // Verzeichnis über "../" von vornherein ausgeschlossen.
        if (!IsTranscriptId(id)) return reply.code(400).send({ error: "Bad Request" });

        const record = await this.client.ticketService.Transcript(id).catch(() => null);

        if (!record) return reply.code(404).send({ error: "Not Found" });

        const file = path.join(TRANSCRIPT_ROOT, `${id}.html`);
        const info = await stat(file).catch(() => null);

        if (!info?.isFile()) return reply.code(404).send({ error: "Not Found" });

        return reply
            .header("Content-Type", "text/html; charset=utf-8")
            .header("Content-Length", info.size)
            // Transcripts enthalten Gesprächsinhalte - sie gehören in keinen Zwischenspeicher
            // und in keinen Suchindex.
            .header("Cache-Control", "private, no-store")
            .header("X-Robots-Tag", "noindex, nofollow")
            .header("Referrer-Policy", "no-referrer")
            .send(createReadStream(file));
    }
}

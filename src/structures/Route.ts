import { FastifyReply, FastifyRequest, HTTPMethods } from "fastify";
import BotClient from "../client/BotClient";
import IRoute from "../interfaces/routes/IRoute";
import IRouteOptions, { IRateLimit } from "../interfaces/routes/IRouteOptions";

export default abstract class Route implements IRoute {
    client: BotClient;
    method: HTTPMethods;
    path: string;
    description: string;
    requiresAuth: boolean;
    rateLimit: IRateLimit | null;

    constructor(client: BotClient, options: IRouteOptions) {
        this.client = client;
        this.method = options.method;
        this.path = options.path;
        this.description = options.description;
        this.requiresAuth = options.requiresAuth ?? true;
        this.rateLimit = options.rateLimit ?? null;
    }

    get Key(): string {
        return `${this.method} ${this.path}`;
    }

    abstract Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown>;
}

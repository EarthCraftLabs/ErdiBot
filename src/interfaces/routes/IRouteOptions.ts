import { HTTPMethods } from "fastify";

export interface IRateLimit {
    max: number;
    timeWindow: string | number;
}

export default interface IRouteOptions {
    method: HTTPMethods;
    path: string;
    description: string;
    prefixed?: boolean;
    requiresAuth?: boolean;
    rateLimit?: IRateLimit;
}

export interface IDatabaseConfig {
    HOST: string;
    PORT?: number;
    USER: string;
    PASSWORD?: string;
    NAME: string;
}

// Zusammengesetzt aus config.json (Infrastruktur) und .env (Geheimnisse) - siehe utils/config.ts.
export interface IConfig {
    CLIENT_TOKEN: string;
    CLIENT_ID: string;
    CLIENT_SECRET: string;
    DATABASE: IDatabaseConfig;

    DEV_CLIENT_TOKEN: string;
    DEV_CLIENT_ID: string;
    DEV_CLIENT_SECRET: string;
    DEV_GUILD_ID: string;
    DEV_USER_IDs: string[];
    DEV_DATABASE: IDatabaseConfig;

    SERVER_PORT: number;
    SERVER_PUBLIC_URL: string;
    SERVER_JWT_SECRET: string;
    SERVER_JWT_EXPIRES_IN: string;
    SERVER_RATE_LIMIT_MAX: number;
    SERVER_RATE_LIMIT_WINDOW: string;

    OAUTH_GUILD_ID: string;
    OAUTH_ROLE_ID: string;

    YOUTUBE_API_KEY: string;
    TWITCH_CLIENT_ID: string;
    TWITCH_CLIENT_SECRET: string;
}

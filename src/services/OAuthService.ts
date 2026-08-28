import { randomBytes } from "node:crypto";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import IOAuthService, { IOAuthLogin, IOAuthUser, OAuthResult } from "../interfaces/services/oauth/IOAuthService";
import { SNOWFLAKE } from "../constants/Discord";
import { ParseDuration } from "../utils/duration";
import { CreateToken } from "../utils/jwt";
import logger from "../utils/logger";

const API = "https://discord.com/api/v10";
const AUTHORIZE = "https://discord.com/oauth2/authorize";
const CALLBACK_PATH = "/auth/discord/callback";
const TIMEOUT = 10_000;

// "guilds" braucht der Beitritt nicht - es steht im Link, weil die Seite später die
// Serverliste des Nutzers lesen soll. "guilds.join" ist der Scope, der wirklich beitritt.
const SCOPES = ["identify", "guilds", "guilds.join"];

// Ein State ist genau einen Callback lang gültig. Zehn Minuten reichen für den
// Consent-Screen und halten liegengebliebene Versuche aus dem Speicher.
const STATE_TTL = 600_000;
const STATE_MAX = 1_000;

const DEFAULT_TOKEN_LIFETIME = 2_592_000_000;

interface ITokenResponse {
    access_token?: string;
    token_type?: string;
    scope?: string;
}

interface IUserResponse {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
    email?: string | null;
}

export default class OAuthService implements IOAuthService {
    client: BotClient;

    private states: LRUCache<string, true>;

    constructor(client: BotClient) {
        this.client = client;
        this.states = new LRUCache({ max: STATE_MAX, ttl: STATE_TTL });
    }

    get Ready(): boolean {
        return Boolean(this.ClientId && this.ClientSecret);
    }

    get Hint(): string {
        if (!this.ClientSecret) return "CLIENT_SECRET fehlt in der .env.";
        if (!this.GuildId) return "OAUTH_GUILD_ID fehlt in der config.json.";
        if (!this.RoleId) return "OAUTH_ROLE_ID fehlt in der config.json - es wird keine Rolle vergeben.";

        return "Vollständig eingerichtet.";
    }

    // Muss zeichengenau mit dem Eintrag unter OAuth2 -> Redirects im Developer Portal
    // übereinstimmen, sonst lehnt Discord den Tausch mit "invalid_grant" ab.
    get RedirectURI(): string {
        return `${this.client.server.BaseURL}${CALLBACK_PATH}`;
    }

    get Pending(): number {
        return this.states.size;
    }

    Authorize(): string {
        const state = randomBytes(24).toString("base64url");

        this.states.set(state, true);

        const query = new URLSearchParams({
            client_id: this.ClientId,
            response_type: "code",
            redirect_uri: this.RedirectURI,
            scope: SCOPES.join(" "),
            state,
        });

        return `${AUTHORIZE}?${query}`;
    }

    async Login(code: string, state: string): Promise<OAuthResult<IOAuthLogin>> {
        if (!this.Ready) return { ok: false, status: 503, error: `OAuth2 ist nicht eingerichtet - ${this.Hint}` };
        if (!code) return { ok: false, status: 400, error: "Es wurde kein Code übergeben" };

        // Einmal einlösbar: ein abgefangener Callback lässt sich nicht erneut abspielen.
        if (!state || !this.states.delete(state)) {
            return { ok: false, status: 400, error: "Der state ist ungültig oder abgelaufen" };
        }

        const accessToken = await this.Exchange(code);
        if (!accessToken) return { ok: false, status: 401, error: "Discord hat den Code abgelehnt" };

        const user = await this.Identify(accessToken);
        if (!user) return { ok: false, status: 502, error: "Discord hat kein Profil geliefert" };

        const joined = await this.Join(user.id, accessToken);
        const role = joined === null ? false : await this.Assign(user.id);

        return {
            ok: true,
            value: {
                user,
                token: this.Issue(user.id),
                joined: joined === true,
                role,
            },
        };
    }

    private get ClientId(): string {
        const { developerMode, config } = this.client;

        return developerMode ? config.DEV_CLIENT_ID : config.CLIENT_ID;
    }

    private get ClientSecret(): string {
        const { developerMode, config } = this.client;

        return developerMode ? config.DEV_CLIENT_SECRET : config.CLIENT_SECRET;
    }

    private get GuildId(): string {
        return this.client.config.OAUTH_GUILD_ID;
    }

    private get RoleId(): string {
        return this.client.config.OAUTH_ROLE_ID;
    }

    private async Exchange(code: string): Promise<string | null> {
        const body = new URLSearchParams({
            client_id: this.ClientId,
            client_secret: this.ClientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: this.RedirectURI,
        });

        const response = await this.Post<ITokenResponse>("/oauth2/token", body);

        if (!response?.access_token) {
            logger.error("[OAuth] Der Code konnte nicht eingelöst werden - stimmen Secret und Redirect-URI?");

            return null;
        }

        // Ohne guilds.join gibt es keinen Beitritt. Lieber hier auffallen als später stumm scheitern.
        if (!response.scope?.split(" ").includes("guilds.join")) {
            logger.warn("[OAuth] Der Link enthält kein guilds.join - der Nutzer wird nicht beitreten können.");
        }

        return response.access_token;
    }

    private async Identify(accessToken: string): Promise<IOAuthUser | null> {
        const response = await this.Get<IUserResponse>("/users/@me", accessToken);

        if (!response?.id || !response.username) return null;

        return {
            id: response.id,
            username: response.username,
            globalName: response.global_name ?? null,
            avatar: response.avatar
                ? `https://cdn.discordapp.com/avatars/${response.id}/${response.avatar}.png`
                : null,
            email: response.email ?? null,
        };
    }

    // true = neu beigetreten, false = war schon Mitglied, null = Beitritt nicht möglich.
    private async Join(userId: string, accessToken: string): Promise<boolean | null> {
        if (!SNOWFLAKE.test(this.GuildId)) {
            logger.warn("[OAuth] Kein Auto-Join - OAUTH_GUILD_ID fehlt oder ist keine gültige ID.");

            return null;
        }

        const guild = await this.client.discordService.Guild(this.GuildId);

        if (!guild) {
            logger.error(`[OAuth] Der Bot ist nicht auf dem Server ${this.GuildId} - kein Auto-Join möglich.`);

            return null;
        }

        const existing = await this.client.discordService.Member(this.GuildId, userId).catch(() => null);
        if (existing) return false;

        try {
            // Bei einem neuen Mitglied setzt Discord die Rolle direkt mit; war der Nutzer schon
            // da, antwortet es mit 204 und ignoriert sie - deshalb prüft Assign() danach nach.
            await guild.members.add(userId, {
                accessToken,
                roles: SNOWFLAKE.test(this.RoleId) ? [this.RoleId] : undefined,
            });
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            logger.error(`[OAuth] Beitritt für ${userId} fehlgeschlagen: ${normalized.message}`);

            return null;
        }

        this.client.discordService.Invalidate(this.GuildId, userId);

        logger.info(`🔗 ${userId} ist über den OAuth2-Link ${guild.name} beigetreten`);

        return true;
    }

    // GrantRole prüft Hierarchie und Rechte und tut nichts, wenn die Rolle schon sitzt -
    // damit deckt ein Aufruf beide Fälle ab: frisch beigetreten und schon Mitglied.
    private async Assign(userId: string): Promise<boolean> {
        if (!SNOWFLAKE.test(this.RoleId)) return false;

        const result = await this.client.discordService.GrantRole(this.GuildId, userId, this.RoleId);

        if (!result.ok) {
            logger.error(`[OAuth] Rolle für ${userId} fehlgeschlagen: ${result.error}`);

            return false;
        }

        return true;
    }

    private Issue(userId: string): string {
        const lifetime = ParseDuration(this.client.config.SERVER_JWT_EXPIRES_IN) ?? DEFAULT_TOKEN_LIFETIME;

        return CreateToken(this.client.config.SERVER_JWT_SECRET, userId, lifetime, ["user"]);
    }

    private async Post<T>(path: string, body: URLSearchParams): Promise<T | null> {
        return this.Request<T>(path, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });
    }

    private async Get<T>(path: string, accessToken: string): Promise<T | null> {
        return this.Request<T>(path, { headers: { Authorization: `Bearer ${accessToken}` } });
    }

    private async Request<T>(path: string, init: RequestInit): Promise<T | null> {
        try {
            const response = await fetch(`${API}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT) });

            if (!response.ok) {
                logger.debug(`[OAuth] ${response.status} ${response.statusText} für ${path}`);

                return null;
            }

            return (await response.json()) as T;
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            logger.error(`[OAuth] ${path} ist fehlgeschlagen: ${normalized.message}`);

            return null;
        }
    }
}

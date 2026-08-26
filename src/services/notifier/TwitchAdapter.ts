import BotClient from "../../client/BotClient";
import { INotifierEvent, IPlatformAdapter, IResolvedChannel } from "../../interfaces/services/notifier/INotifierEvent";
import { Platform } from "../../interfaces/services/notifier/INotifierSubscription";
import { GetJson, RateLimited } from "./Http";
import logger from "../../utils/logger";

const API = "https://api.twitch.tv/helix";
const OAUTH = "https://id.twitch.tv/oauth2/token";

const FROM_URL = /twitch\.tv\/([\w]{4,25})/i;
const LOGIN = /^@?([\w]{4,25})$/;

// Helix beantwortet bis zu 100 Kanäle pro Anfrage - eine Abfrage für den ganzen Bot statt eine pro Kanal.
export const MAX_BATCH = 100;

const TOKEN_MARGIN = 60_000;

interface ITokenResponse {
    access_token?: string;
    expires_in?: number;
}

interface IUserResponse {
    data?: Array<{ id: string; login: string; display_name: string; profile_image_url?: string }>;
}

interface IStreamResponse {
    data?: Array<{
        id: string;
        user_id: string;
        user_login: string;
        user_name: string;
        game_name?: string;
        title?: string;
        viewer_count?: number;
        started_at?: string;
        thumbnail_url?: string;
    }>;
}

export default class TwitchAdapter implements IPlatformAdapter {
    readonly platform: Platform = "twitch";
    readonly label = "Twitch";
    readonly emoji = "🟣";

    // Streams sollen schnell gemeldet werden, und eine Batch-Abfrage kostet unabhängig
    // von der Anzahl Kanäle genau einen Punkt des 800-Punkte-Budgets pro Minute.
    readonly interval = 60;

    private client: BotClient;

    private token: string | null = null;
    private expiresAt = 0;
    private blockedUntil = 0;

    // Twitch kennt nur user_id, gespeichert wird der Login - die Zuordnung ändert sich nie.
    private ids = new Map<string, string>();

    constructor(client: BotClient) {
        this.client = client;
    }

    get Ready(): boolean {
        return Boolean(this.client.config.TWITCH_CLIENT_ID && this.client.config.TWITCH_CLIENT_SECRET);
    }

    get Hint(): string {
        return this.Ready
            ? "Vollständig eingerichtet."
            : "TWITCH_CLIENT_ID und TWITCH_CLIENT_SECRET fehlen in der .env.";
    }

    async Resolve(input: string): Promise<IResolvedChannel | null> {
        if (!this.Ready) return null;

        const trimmed = input.trim();
        const match = FROM_URL.exec(trimmed) ?? LOGIN.exec(trimmed);
        if (!match) return null;

        const login = match[1].toLowerCase();
        const user = (await this.Get<IUserResponse>(`/users?login=${encodeURIComponent(login)}`))?.data?.[0];

        if (!user) return null;

        this.ids.set(user.login, user.id);

        return {
            identifier: user.login,
            name: user.display_name || user.login,
            url: `https://www.twitch.tv/${user.login}`,
            avatarUrl: user.profile_image_url ?? null,
        };
    }

    async Check(identifier: string): Promise<INotifierEvent | null> {
        const found = await this.CheckMany([identifier]);

        return found.get(identifier) ?? null;
    }

    // Der eigentliche Weg: alle beobachteten Logins auf einmal. Wer nicht in der Antwort
    // steht, ist offline - genau das braucht der Notifier, um die Live-Rolle zu entziehen.
    async CheckMany(logins: string[]): Promise<Map<string, INotifierEvent>> {
        const result = new Map<string, INotifierEvent>();
        if (!this.Ready || logins.length === 0) return result;

        for (let index = 0; index < logins.length; index += MAX_BATCH) {
            const batch = logins.slice(index, index + MAX_BATCH);
            const query = batch.map((login) => `user_login=${encodeURIComponent(login)}`).join("&");
            const response = await this.Get<IStreamResponse>(`/streams?${query}&first=${MAX_BATCH}`);

            for (const stream of response?.data ?? []) {
                this.ids.set(stream.user_login, stream.user_id);

                result.set(stream.user_login.toLowerCase(), {
                    kind: "live",
                    id: stream.id,
                    title: stream.title || "Ohne Titel",
                    url: `https://www.twitch.tv/${stream.user_login}`,
                    thumbnail: Thumbnail(stream.thumbnail_url),
                    game: stream.game_name || null,
                    viewers: stream.viewer_count ?? null,
                    publishedAt: stream.started_at ? new Date(stream.started_at) : new Date(),
                });
            }
        }

        return result;
    }

    private async Get<T>(path: string): Promise<T | null> {
        if (Date.now() < this.blockedUntil) return null;

        const token = await this.Token();
        if (!token) return null;

        try {
            return await GetJson<T>(`${API}${path}`, {
                headers: { "Client-Id": this.client.config.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
            });
        } catch (error) {
            if (!(error instanceof RateLimited)) throw error;

            // Bis zum Reset gar nicht erst anfragen - sonst verlängert jeder Versuch die Sperre.
            this.blockedUntil = Date.now() + error.retryAfter * 1000;
            logger.warn(`[Notifier] Twitch drosselt, Pause für ${error.retryAfter}s`);

            return null;
        }
    }

    // App Access Token, gültig rund 60 Tage. Eine Minute Sicherheitsabstand vor Ablauf.
    private async Token(): Promise<string | null> {
        if (this.token && Date.now() < this.expiresAt - TOKEN_MARGIN) return this.token;

        const body = new URLSearchParams({
            client_id: this.client.config.TWITCH_CLIENT_ID,
            client_secret: this.client.config.TWITCH_CLIENT_SECRET,
            grant_type: "client_credentials",
        });

        const response = await GetJson<ITokenResponse>(OAUTH, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        }).catch(() => null);

        if (!response?.access_token) {
            logger.error("[Notifier] Twitch-Token konnte nicht geholt werden - stimmen Client-ID und Secret?");

            return null;
        }

        this.token = response.access_token;
        this.expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;

        return this.token;
    }
}

// Twitch liefert die Vorschau als Vorlage mit Platzhaltern für die Größe.
function Thumbnail(template: string | undefined): string | null {
    if (!template) return null;

    // Der Zeitstempel umgeht Discords Bild-Cache - sonst zeigt jeder Stream dasselbe alte Bild.
    return `${template.replace("{width}", "1280").replace("{height}", "720")}?t=${Date.now()}`;
}

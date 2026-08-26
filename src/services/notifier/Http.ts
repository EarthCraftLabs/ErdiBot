import logger from "../../utils/logger";

const TIMEOUT = 10_000;
const USER_AGENT = "ErdiBot/1.0 (+https://github.com/EarthCraftLabs/ErdiBot)";

export class RateLimited extends Error {
    readonly retryAfter: number;

    constructor(seconds: number) {
        super(`Rate-Limit erreicht, nächster Versuch in ${seconds}s`);
        this.name = "RateLimited";
        this.retryAfter = seconds;
    }
}

// Rate-Limits sind bei jeder der drei Plattformen anders formuliert, aber immer in Sekunden
// oder als Unix-Zeitstempel. Beides landet hier als "wie lange noch warten".
function RetryAfter(response: Response): number {
    const header = response.headers.get("retry-after") ?? response.headers.get("ratelimit-reset");
    if (!header) return 60;

    const value = Number(header);
    if (!Number.isFinite(value)) return 60;

    // Twitch schickt einen Unix-Zeitstempel, alle anderen eine Anzahl Sekunden.
    const seconds = value > 1_000_000_000 ? Math.ceil(value - Date.now() / 1000) : value;

    return Math.min(Math.max(Math.ceil(seconds), 1), 900);
}

async function Request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(TIMEOUT),
    });

    if (response.status === 429 || response.status === 503) throw new RateLimited(RetryAfter(response));

    return response;
}

export async function GetJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
    const response = await Request(url, init);

    if (!response.ok) {
        logger.debug(`[Notifier] ${response.status} ${response.statusText} für ${Redact(url)}`);

        return null;
    }

    return (await response.json()) as T;
}

export async function GetText(url: string, init: RequestInit = {}): Promise<string | null> {
    const response = await Request(url, init);

    if (!response.ok) {
        logger.debug(`[Notifier] ${response.status} ${response.statusText} für ${Redact(url)}`);

        return null;
    }

    return response.text();
}

// API-Keys stehen im Query-String und dürfen nicht in den Logs landen.
export function Redact(url: string): string {
    return url.replace(/([?&](?:key|client_secret|access_token)=)[^&]+/gi, "$1***");
}

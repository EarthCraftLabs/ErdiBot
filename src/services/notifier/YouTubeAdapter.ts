import BotClient from "../../client/BotClient";
import { INotifierEvent, IPlatformAdapter, IResolvedChannel } from "../../interfaces/services/notifier/INotifierEvent";
import { Platform } from "../../interfaces/services/notifier/INotifierSubscription";
import { ParseFeed } from "./Feed";
import { GetJson, GetText } from "./Http";

const API = "https://www.googleapis.com/youtube/v3";
const FEED = "https://www.youtube.com/feeds/videos.xml?channel_id=";

const CHANNEL_ID = /^UC[\w-]{22}$/;
const FROM_URL = /youtube\.com\/(?:channel\/(UC[\w-]{22})|(@[\w.-]+))/i;
const HANDLE = /^@?([\w.-]{3,30})$/;

interface IChannelResponse {
    items?: Array<{
        id: string;
        snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> };
    }>;
}

interface IVideoResponse {
    items?: Array<{
        id: string;
        snippet?: {
            title?: string;
            publishedAt?: string;
            liveBroadcastContent?: string;
            thumbnails?: Record<string, { url?: string }>;
        };
        liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string };
    }>;
}

function BestThumbnail(thumbnails: Record<string, { url?: string }> | undefined): string | null {
    if (!thumbnails) return null;

    for (const size of ["maxres", "standard", "high", "medium", "default"]) {
        const url = thumbnails[size]?.url;
        if (url) return url;
    }

    return null;
}

export default class YouTubeAdapter implements IPlatformAdapter {
    readonly platform: Platform = "youtube";
    readonly label = "YouTube";
    readonly emoji = "📺";

    // Der RSS-Feed aktualisiert sich nicht sekundengenau - häufiger fragen bringt nichts.
    readonly interval = 300;

    private client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    // Neue Videos kommen aus dem RSS-Feed: kein API-Key, kein Quota-Verbrauch.
    // Der Key wird nur zum Anreichern gebraucht - ohne ihn fehlen Vorschaubild und Live-Erkennung.
    get Ready(): boolean {
        return true;
    }

    get Hint(): string {
        return this.Key
            ? "Vollständig eingerichtet."
            : "Ohne YOUTUBE_API_KEY läuft nur die RSS-Erkennung — kein Vorschaubild, keine Live-Unterscheidung.";
    }

    private get Key(): string {
        return this.client.config.YOUTUBE_API_KEY;
    }

    async Resolve(input: string): Promise<IResolvedChannel | null> {
        const trimmed = input.trim();
        const fromUrl = FROM_URL.exec(trimmed);
        const direct = CHANNEL_ID.test(trimmed) ? trimmed : (fromUrl?.[1] ?? null);

        if (direct) return this.ByChannelId(direct);

        const handle = fromUrl?.[2] ?? (HANDLE.test(trimmed) ? trimmed : null);
        if (!handle) return null;

        return this.ByHandle(handle.startsWith("@") ? handle : `@${handle}`);
    }

    async Check(identifier: string): Promise<INotifierEvent | null> {
        const xml = await GetText(`${FEED}${encodeURIComponent(identifier)}`);
        if (!xml) return null;

        const item = ParseFeed(xml);
        if (!item) return null;

        const videoId = item.id.replace(/^yt:video:/, "");

        return {
            ...(await this.Details(videoId)),
            id: videoId,
            title: item.title,
            url: item.link,
            thumbnail: item.thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            game: null,
            viewers: null,
            publishedAt: item.published ?? new Date(),
        };
    }

    // 1 Quota-Einheit pro neu gesehenem Video. Ohne Key bleibt es bei "video".
    private async Details(videoId: string): Promise<{ kind: "live" | "video" }> {
        if (!this.Key) return { kind: "video" };

        const url =
            `${API}/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoId)}` +
            `&key=${encodeURIComponent(this.Key)}`;

        const response = await GetJson<IVideoResponse>(url).catch(() => null);
        const item = response?.items?.[0];

        if (!item) return { kind: "video" };

        // Ein beendeter Stream ist ein Video, kein Live-Ereignis mehr.
        const live = item.snippet?.liveBroadcastContent === "live" && !item.liveStreamingDetails?.actualEndTime;

        return { kind: live ? "live" : "video" };
    }

    private async ByChannelId(channelId: string): Promise<IResolvedChannel | null> {
        const base = {
            identifier: channelId,
            name: channelId,
            url: `https://www.youtube.com/channel/${channelId}`,
            avatarUrl: null,
        };

        if (!this.Key) return this.Verify(base);

        const url = `${API}/channels?part=snippet&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(this.Key)}`;
        const item = (await GetJson<IChannelResponse>(url).catch(() => null))?.items?.[0];

        if (!item) return this.Verify(base);

        return {
            identifier: item.id,
            name: item.snippet?.title ?? channelId,
            url: item.snippet?.customUrl
                ? `https://www.youtube.com/${item.snippet.customUrl}`
                : `https://www.youtube.com/channel/${item.id}`,
            avatarUrl: BestThumbnail(item.snippet?.thumbnails),
        };
    }

    // forHandle kostet 1 Einheit - eine Suche über search.list würde 100 kosten.
    private async ByHandle(handle: string): Promise<IResolvedChannel | null> {
        if (!this.Key) return null;

        const url = `${API}/channels?part=snippet&forHandle=${encodeURIComponent(handle)}&key=${encodeURIComponent(this.Key)}`;
        const item = (await GetJson<IChannelResponse>(url).catch(() => null))?.items?.[0];

        if (!item) return null;

        return {
            identifier: item.id,
            name: item.snippet?.title ?? handle,
            url: `https://www.youtube.com/${item.snippet?.customUrl ?? handle}`,
            avatarUrl: BestThumbnail(item.snippet?.thumbnails),
        };
    }

    // Ohne API-Key beweist ein abrufbarer Feed, dass es den Kanal gibt.
    private async Verify(channel: IResolvedChannel): Promise<IResolvedChannel | null> {
        const xml = await GetText(`${FEED}${encodeURIComponent(channel.identifier)}`).catch(() => null);
        if (!xml) return null;

        const title = /<title>([\s\S]*?)<\/title>/i.exec(xml);

        return { ...channel, name: title ? title[1].trim() : channel.name };
    }
}

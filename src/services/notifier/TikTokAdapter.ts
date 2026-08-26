import BotClient from "../../client/BotClient";
import { INotifierEvent, IPlatformAdapter, IResolvedChannel } from "../../interfaces/services/notifier/INotifierEvent";
import { Platform } from "../../interfaces/services/notifier/INotifierSubscription";
import { CONFIG_KEY } from "../../constants/Notifier";
import { ParseFeed } from "./Feed";
import { GetText } from "./Http";

const FROM_URL = /tiktok\.com\/@([\w.]{2,24})/i;
const HANDLE = /^@?([\w.]{2,24})$/;

// TikTok hat keine öffentliche API für "neues Video eines fremden Creators". Die Display-API
// verlangt OAuth des Creators selbst plus App-Review. Deshalb läuft die Erkennung über eine
// austauschbare Feed-Bridge, deren URL in der notifier.json steht.
const DEFAULT_BRIDGE = "https://rsshub.app/tiktok/user/@{handle}";

export default class TikTokAdapter implements IPlatformAdapter {
    readonly platform: Platform = "tiktok";
    readonly label = "TikTok";
    readonly emoji = "🎵";

    // Fremde Bridges sind selten großzügig - zehn Minuten sind höflich und reichen für Uploads.
    readonly interval = 600;

    private client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    get Ready(): boolean {
        return this.Bridge.includes("{handle}");
    }

    get Hint(): string {
        return this.Ready
            ? `Feed-Bridge: ${this.Bridge}`
            : 'In src/config/notifier.json muss "tiktok_bridge" eine URL mit {handle} enthalten.';
    }

    private get Bridge(): string {
        return this.client.configService.Value(CONFIG_KEY, "tiktok_bridge", DEFAULT_BRIDGE);
    }

    private Url(handle: string): string {
        return this.Bridge.replace("{handle}", encodeURIComponent(handle));
    }

    async Resolve(input: string): Promise<IResolvedChannel | null> {
        if (!this.Ready) return null;

        const trimmed = input.trim();
        const match = FROM_URL.exec(trimmed) ?? HANDLE.exec(trimmed);
        if (!match) return null;

        const handle = match[1].toLowerCase();

        // Ein abrufbarer Feed ist der einzige Beweis, dass es das Profil gibt.
        const xml = await GetText(this.Url(handle)).catch(() => null);
        if (!xml) return null;

        const title = /<title>([\s\S]*?)<\/title>/i.exec(xml);

        return {
            identifier: handle,
            name: title ? title[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() || `@${handle}` : `@${handle}`,
            url: `https://www.tiktok.com/@${handle}`,
            avatarUrl: null,
        };
    }

    async Check(identifier: string): Promise<INotifierEvent | null> {
        if (!this.Ready) return null;

        const xml = await GetText(this.Url(identifier));
        if (!xml) return null;

        const item = ParseFeed(xml);
        if (!item) return null;

        return {
            kind: "video",
            id: item.id,
            title: item.title,
            url: item.link,
            thumbnail: item.thumbnail,
            game: null,
            viewers: null,
            publishedAt: item.published ?? new Date(),
        };
    }
}

// Ein vollwertiger XML-Parser wäre für zwei feste Feed-Formate eine Dependency zu viel.
// YouTube liefert Atom (<entry>), RSS-Bridges liefern RSS (<item>) - beides ist flach genug.

const ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
};

export interface IFeedItem {
    id: string;
    title: string;
    link: string;
    thumbnail: string | null;
    published: Date | null;
}

export function Decode(value: string): string {
    return value
        .replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (match) => ENTITIES[match] ?? match)
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .trim();
}

function Unwrap(value: string): string {
    const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(value);

    return Decode(cdata ? cdata[1] : value);
}

// Greift <tag>…</tag> heraus. Namensräume wie <yt:videoId> zählen als eigener Tag-Name.
export function Tag(block: string, name: string): string | null {
    const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);

    return match ? Unwrap(match[1]) : null;
}

export function Attribute(block: string, tag: string, attribute: string): string | null {
    const element = new RegExp(`<${tag}\\b[^>]*>`, "i").exec(block);
    if (!element) return null;

    const match = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i").exec(element[0]);

    return match ? Decode(match[1]) : null;
}

// Nur der erste Eintrag zählt: beide Feeds liefern die neueste Veröffentlichung zuerst.
export function FirstEntry(xml: string): string | null {
    const match = /<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/i.exec(xml);

    return match ? match[2] : null;
}

function Stamp(value: string | null): Date | null {
    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

// Sucht ein Vorschaubild an den drei Stellen, an denen es üblicherweise steht.
function Thumbnail(block: string): string | null {
    const media = Attribute(block, "media:thumbnail", "url") ?? Attribute(block, "media:content", "url");
    if (media) return media;

    const enclosure = Attribute(block, "enclosure", "url");
    if (enclosure) return enclosure;

    const description = Tag(block, "description") ?? Tag(block, "content:encoded") ?? "";
    const image = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(description);

    return image ? Decode(image[1]) : null;
}

export function ParseFeed(xml: string): IFeedItem | null {
    const block = FirstEntry(xml);
    if (!block) return null;

    const link = Attribute(block, "link", "href") ?? Tag(block, "link");
    const title = Tag(block, "title");

    // yt:videoId ist stabil, <id> und <guid> sind es meistens - der Link ist die letzte Rettung.
    const id = Tag(block, "yt:videoId") ?? Tag(block, "guid") ?? Tag(block, "id") ?? link;

    if (!id || !link) return null;

    return {
        id,
        title: title || "Ohne Titel",
        link,
        thumbnail: Thumbnail(block),
        published: Stamp(Tag(block, "published") ?? Tag(block, "pubDate") ?? Tag(block, "updated")),
    };
}

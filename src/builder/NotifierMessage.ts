import { ColorResolvable, MessageCreateOptions, MessageFlags } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import INotifierSubscription from "../interfaces/services/notifier/INotifierSubscription";
import { INotifierEvent } from "../interfaces/services/notifier/INotifierEvent";
import { PLATFORM_EMOJI, PLATFORM_LABEL } from "../constants/Notifier";

// Dieselbe Nachricht bauen Testlauf und echtes Ereignis - der Stil entscheidet, was rausgeht.
export default function BuildNotification(
    subscription: INotifierSubscription,
    event: INotifierEvent,
    content: string,
    allowedMentions: { roles: string[]; users: string[] }
): MessageCreateOptions {
    const emoji = PLATFORM_EMOJI[subscription.platform];
    const platform = PLATFORM_LABEL[subscription.platform];

    // Klartext: eine Zeile, Discord zeigt seine eigene Vorschau zum Link. Am unauffälligsten.
    if (subscription.style === "text") {
        return { content: content.slice(0, 2000), allowedMentions };
    }

    const builder = new ComponentV2Builder({ accentColor: subscription.accent as ColorResolvable });
    const badge = event.kind === "live" ? "🔴 LIVE" : "🆕 NEU";

    builder.text(`${emoji} **${badge} · ${platform}**`).separator();

    // Der Avatar wird zum Thumbnail neben dem Text - ohne ihn steht der Text allein.
    if (subscription.avatarUrl) {
        builder.section(content, { type: "thumbnail", url: subscription.avatarUrl, description: subscription.name });
    } else {
        builder.text(content);
    }

    const facts = [
        event.game ? `🎮 ${event.game}` : null,
        event.viewers !== null ? `👥 ${event.viewers.toLocaleString("de-DE")}` : null,
        `<t:${Math.floor(event.publishedAt.getTime() / 1000)}:R>`,
    ].filter(Boolean) as string[];

    if (facts.length > 0) builder.subtext(facts.join(" · "));
    if (event.thumbnail) builder.gallery(event.thumbnail);

    builder.buttons(
        { url: event.url, label: event.kind === "live" ? "Zum Stream" : "Zum Video", emoji },
        { url: subscription.sourceUrl, label: "Kanal", emoji: "🔗" }
    );

    // Kein "content" hier: Discord lehnt eine Nachricht mit IsComponentsV2 ab, die eines trägt.
    // Erwähnungen im Container-Text pingen trotzdem, solange allowedMentions sie zulässt.
    return { components: [builder.build()], flags: MessageFlags.IsComponentsV2, allowedMentions };
}

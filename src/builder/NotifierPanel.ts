import { ChannelType, ColorResolvable } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "./ComponentV2Builder";
import { ISelectEntryOptions } from "../interfaces/builder/IComponentV2Builder";
import { INotifierPanelView, INotifierState } from "../interfaces/services/notifier/INotifierPanel";
import INotifierSubscription, { Platform } from "../interfaces/services/notifier/INotifierSubscription";
import {
    CONFIG_KEY,
    InQuietHours,
    MAX_ENTRIES,
    PLACEHOLDERS,
    PLATFORM_ACCENT,
    PLATFORM_EMOJI,
    PLATFORM_LABEL,
    PLATFORMS,
    StyleLabel,
    SUPPORTS_LIVE,
} from "../constants/Notifier";

export const PANEL_PREFIX = "notifier:panel";

export const PanelStates = new LRUCache<string, INotifierState>({ max: 50, ttl: 30 * 60_000 });

export function NewPanelState(guildId: string, entries: INotifierSubscription[]): INotifierState {
    return {
        guildId,
        view: "home",
        entries,
        index: entries.length > 0 ? 0 : -1,
        draft: null,
        platform: null,
        dirty: false,
        notice: null,
    };
}

// Der Entwurf beim Anlegen hat Vorrang - erst nach dem Speichern zählt der Eintrag aus der Liste.
export function Active(state: INotifierState): INotifierSubscription | null {
    if (state.draft) return state.draft;

    return state.entries[state.index] ?? null;
}

function Status(entry: INotifierSubscription): string {
    if (!entry.enabled) return "🔴";
    if (!entry.channelId) return "🟡";
    if (entry.lastError) return "🟠";
    if (entry.isLive) return "🔴 LIVE";

    return "🟢";
}

function Stamp(date: Date | null): string {
    return date ? `<t:${Math.floor(date.getTime() / 1000)}:R>` : "_nie_";
}

function Head(state: INotifierState, title: string, subtitle?: string): ComponentV2Builder {
    const accent = (Active(state)?.accent ?? "#5865F2") as ColorResolvable;
    const builder = new ComponentV2Builder({ accentColor: accent }).title(title, subtitle);

    if (state.notice) builder.subtext(state.notice);
    if (state.dirty) builder.subtext("✏️ Ungespeicherte Änderungen — unten auf **Speichern** drücken.");

    return builder.separator();
}

function PlatformOptions(client: BotClient): ISelectEntryOptions[] {
    return PLATFORMS.map((platform) => {
        const adapter = client.notifierService.Adapter(platform);

        return {
            label: PLATFORM_LABEL[platform],
            value: platform,
            description: adapter.Ready ? `Bereit · alle ${adapter.interval / 60} Min. geprüft` : "Nicht eingerichtet",
            emoji: PLATFORM_EMOJI[platform],
        };
    });
}

function Home(builder: ComponentV2Builder, client: BotClient, state: INotifierState): void {
    const { entries } = state;

    if (entries.length === 0) {
        builder.text(
            "Noch keine Kanäle eingerichtet.\n\n" +
                "Ein Kanal besteht aus einer Plattform, einem Namen, dem Link zum Kanal und " +
                "dem Discord-Kanal, in den die Meldung soll."
        );
    } else {
        builder.text(
            entries
                .map((entry, index) => {
                    const marker = index === state.index ? "▸" : " ";
                    const target = entry.channelId ? `<#${entry.channelId}>` : "_kein Kanal_";

                    return `${marker} ${Status(entry)} ${PLATFORM_EMOJI[entry.platform]} **${entry.name}** → ${target}`;
                })
                .join("\n")
        );
    }

    const missing = client.notifierService.Adapters.filter((adapter) => !adapter.Ready);

    if (missing.length > 0) {
        builder.subtext(`⚠️ Nicht eingerichtet: ${missing.map((adapter) => adapter.label).join(", ")}`);
    }

    if (entries.length > 0) {
        builder.select({
            customId: `${PANEL_PREFIX}:pick`,
            placeholder: "📡 | Kanal bearbeiten...",
            options: entries.map((entry, index) => ({
                label: `${entry.name}`.slice(0, 100),
                value: String(index),
                description: `${PLATFORM_LABEL[entry.platform]} · ${entry.enabled ? "aktiv" : "inaktiv"}`.slice(0, 100),
                emoji: PLATFORM_EMOJI[entry.platform],
            })),
        });
    }

    builder.buttons(
        {
            customId: `${PANEL_PREFIX}:add`,
            label: "Kanal hinzufügen",
            emoji: "➕",
            tone: "success",
            disabled: entries.length >= MAX_ENTRIES,
        },
        { customId: `${PANEL_PREFIX}:status`, label: "Status", emoji: "📊", tone: "primary" },
        { customId: `${PANEL_PREFIX}:refresh`, label: "Neu laden", emoji: "🔄" }
    );

    if (entries.length >= MAX_ENTRIES) builder.subtext(`Mehr als ${MAX_ENTRIES} Kanäle gehen nicht.`);
}

function Add(builder: ComponentV2Builder, client: BotClient, state: INotifierState): void {
    builder.text(
        "**Welche Plattform?**\n\n" +
            "Danach wird nach dem Link oder Handle gefragt. Der Bot löst daraus den echten Kanal auf und " +
            "übernimmt Name und Profilbild — beides lässt sich später überschreiben."
    );

    for (const adapter of client.notifierService.Adapters) {
        if (!adapter.Ready) builder.subtext(`${adapter.emoji} **${adapter.label}:** ${adapter.Hint}`);
    }

    builder.select({
        customId: `${PANEL_PREFIX}:platform`,
        placeholder: "🌐 | Plattform wählen...",
        options: PlatformOptions(client),
    });

    builder.buttons({ customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" });
}

function Entry(builder: ComponentV2Builder, client: BotClient, state: INotifierState, entry: INotifierSubscription): void {
    const adapter = client.notifierService.Adapter(entry.platform);

    builder.text(
        `${PLATFORM_EMOJI[entry.platform]} **${entry.name}** · ${PLATFORM_LABEL[entry.platform]}\n` +
            `${entry.enabled ? "🟢 **Aktiv**" : "🔴 **Inaktiv**"} · geprüft alle ${adapter.interval / 60} Min.\n` +
            `📢 **Kanal:** ${entry.channelId ? `<#${entry.channelId}>` : "_noch keiner_"}\n` +
            `🔗 **Quelle:** ${entry.sourceUrl || "_keine_"}`
    );

    if (entry.lastError) builder.subtext(`⚠️ Letzter Fehler: ${entry.lastError.slice(0, 200)}`);

    builder.channelSelect({
        customId: `${PANEL_PREFIX}:channel`,
        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        placeholder: "📢 | Benachrichtigungs-Kanal wählen...",
    });

    builder.buttons(
        { customId: `${PANEL_PREFIX}:message`, label: "Nachricht", emoji: "💬", tone: "primary" },
        { customId: `${PANEL_PREFIX}:roles`, label: "Rollen", emoji: "🎭", tone: "primary" },
        { customId: `${PANEL_PREFIX}:options`, label: "Optionen", emoji: "⚙️", tone: "primary" },
        { customId: `${PANEL_PREFIX}:rename`, label: "Umbenennen", emoji: "🏷️" },
        { customId: `${PANEL_PREFIX}:toggle`, label: entry.enabled ? "Deaktivieren" : "Aktivieren", emoji: "🔌" }
    );

    builder.buttons(
        { customId: `${PANEL_PREFIX}:save`, label: "Speichern", emoji: "💾", tone: "success", disabled: !state.dirty },
        { customId: `${PANEL_PREFIX}:test`, label: "Testlauf", emoji: "🚀", disabled: !entry.channelId },
        { customId: `${PANEL_PREFIX}:check`, label: "Jetzt prüfen", emoji: "🔍" },
        { customId: `${PANEL_PREFIX}:delete`, label: "Entfernen", emoji: "🗑️", tone: "danger" },
        { customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️" }
    );
}

function MessageView(builder: ComponentV2Builder, client: BotClient, entry: INotifierSubscription): void {
    builder.text(
        `**Stil:** ${StyleLabel(entry.style)} · **Farbe:** \`${entry.accent}\`\n\n` +
            `**🔴 Live**\n>>> ${entry.liveTemplate.slice(0, 400)}`
    );

    builder.text(`**🆕 Video**\n>>> ${entry.videoTemplate.slice(0, 400)}`);

    if (SUPPORTS_LIVE[entry.platform]) {
        builder.text(`**⚫ Nach dem Stream**\n>>> ${entry.offlineTemplate.slice(0, 400)}`);
    }

    builder.separator();
    builder.subtext(PLACEHOLDERS.map((entry) => `\`${entry.token}\``).join(" · "));

    Select(builder, client, "styles", "style", "🎨 | Darstellung wählen...");
    Select(builder, client, "colors", "accent", "🌈 | Farbe wählen...");

    builder.buttons(
        { customId: `${PANEL_PREFIX}:edit:live`, label: "Live-Text", emoji: "🔴", tone: "primary" },
        { customId: `${PANEL_PREFIX}:edit:video`, label: "Video-Text", emoji: "🆕", tone: "primary" },
        {
            customId: `${PANEL_PREFIX}:edit:offline`,
            label: "Offline-Text",
            emoji: "⚫",
            tone: "primary",
            disabled: !SUPPORTS_LIVE[entry.platform],
        },
        { customId: `${PANEL_PREFIX}:placeholders`, label: "Platzhalter", emoji: "🔤" },
        { customId: `${PANEL_PREFIX}:entry`, label: "Zurück", emoji: "⬅️", tone: "danger" }
    );
}

function Roles(builder: ComponentV2Builder, entry: INotifierSubscription): void {
    const live = SUPPORTS_LIVE[entry.platform];

    builder.text(
        `🔔 **Ping-Rolle:** ${entry.mentionRoleId ? `<@&${entry.mentionRoleId}>` : "_keine_"}\n` +
            `   Wird bei jeder Meldung erwähnt, über den Platzhalter \`{mention}\`.\n\n` +
            `🎭 **Live-Rolle:** ${live ? (entry.liveRoleId ? `<@&${entry.liveRoleId}>` : "_keine_") : "_hier nicht möglich_"}\n` +
            `   Wird beim Stream-Start vergeben und beim Stream-Ende wieder entzogen.\n\n` +
            `👤 **Discord-Konto:** ${entry.discordUserId ? `<@${entry.discordUserId}>` : "_nicht verknüpft_"}\n` +
            `   Bekommt die Live-Rolle und steht als \`{discord}\` im Text.`
    );

    if (live && entry.liveRoleId && !entry.discordUserId) {
        builder.subtext("⚠️ Ohne verknüpftes Discord-Konto weiß der Bot nicht, wem er die Live-Rolle geben soll.");
    }

    builder.roleSelect({ customId: `${PANEL_PREFIX}:pingrole`, placeholder: "🔔 | Ping-Rolle wählen..." });

    if (live) builder.roleSelect({ customId: `${PANEL_PREFIX}:liverole`, placeholder: "🎭 | Live-Rolle wählen..." });

    builder.userSelect({ customId: `${PANEL_PREFIX}:discord`, placeholder: "👤 | Discord-Konto verknüpfen..." });

    builder.buttons(
        { customId: `${PANEL_PREFIX}:clearping`, label: "Ping-Rolle weg", emoji: "🚫", disabled: !entry.mentionRoleId },
        { customId: `${PANEL_PREFIX}:clearlive`, label: "Live-Rolle weg", emoji: "🚫", disabled: !entry.liveRoleId },
        { customId: `${PANEL_PREFIX}:clearuser`, label: "Konto lösen", emoji: "🚫", disabled: !entry.discordUserId },
        { customId: `${PANEL_PREFIX}:entry`, label: "Zurück", emoji: "⬅️", tone: "danger" }
    );
}

function Options(builder: ComponentV2Builder, entry: INotifierSubscription): void {
    const quiet =
        entry.quietFrom && entry.quietTo
            ? `${entry.quietFrom} – ${entry.quietTo}${InQuietHours(entry.quietFrom, entry.quietTo) ? " · **gerade aktiv**" : ""}`
            : "_aus_";

    builder.text(
        `⏱️ **Cooldown:** ${entry.cooldown === 0 ? "_aus_" : `${entry.cooldown} Min.`}\n` +
            `   Mindestabstand zwischen zwei Meldungen desselben Kanals.\n\n` +
            `🌙 **Ruhezeit:** ${quiet}\n` +
            `   In diesem Fenster wird nichts gemeldet. Läuft auch über Mitternacht.\n\n` +
            `📣 **Auto-Publish:** ${entry.autoPublish ? "an" : "aus"} · nur in Ankündigungs-Kanälen\n` +
            `🧵 **Thread anlegen:** ${entry.createThread ? "an" : "aus"}\n` +
            `⚫ **Nach Stream anpassen:** ${entry.editOnEnd ? "an" : "aus"}`
    );

    builder.buttons(
        { customId: `${PANEL_PREFIX}:edit:timing`, label: "Cooldown & Ruhezeit", emoji: "⏱️", tone: "primary" },
        { customId: `${PANEL_PREFIX}:publish`, label: "Auto-Publish", emoji: "📣" },
        { customId: `${PANEL_PREFIX}:thread`, label: "Thread", emoji: "🧵" },
        {
            customId: `${PANEL_PREFIX}:editend`,
            label: "Nach Stream",
            emoji: "⚫",
            disabled: !SUPPORTS_LIVE[entry.platform],
        },
        { customId: `${PANEL_PREFIX}:entry`, label: "Zurück", emoji: "⬅️", tone: "danger" }
    );
}

function StatusView(builder: ComponentV2Builder, client: BotClient, state: INotifierState): void {
    for (const adapter of client.notifierService.Adapters) {
        const watched = state.entries.filter((entry) => entry.platform === adapter.platform);

        builder.text(
            `${adapter.emoji} **${adapter.label}** — ${adapter.Ready ? "✅ bereit" : "❌ nicht eingerichtet"}\n` +
                `-# ${watched.length} Kanal/Kanäle · alle ${adapter.interval / 60} Min. · ${adapter.Hint}`
        );
    }

    builder.separator();

    if (state.entries.length === 0) {
        builder.text("Noch keine Kanäle eingerichtet.");
    } else {
        builder.text(
            state.entries
                .map(
                    (entry) =>
                        `${Status(entry)} **${entry.name}**\n` +
                        `-# ${entry.notifyCount}× gemeldet · zuletzt ${Stamp(entry.lastNotified)} · geprüft ${Stamp(entry.lastCheck)}` +
                        (entry.lastError ? `\n-# ⚠️ ${entry.lastError.slice(0, 120)}` : "")
                )
                .join("\n")
        );
    }

    builder.buttons(
        { customId: `${PANEL_PREFIX}:pollnow`, label: "Alle jetzt prüfen", emoji: "🔍", tone: "primary" },
        { customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" }
    );
}

// Wie im Welcome-Panel bewusst ohne `default`: eine vorausgewählte Option lässt sich
// nicht noch einmal auswählen. Der aktuelle Wert steht stattdessen im Text darüber.
function Select(builder: ComponentV2Builder, client: BotClient, field: string, action: string, placeholder: string): void {
    const options = client.configService.Options(CONFIG_KEY, field).map((option) => ({
        label: option.name.slice(0, 100),
        value: option.value,
        description: option.description ? option.description.slice(0, 100) : undefined,
        emoji: option.emoji || undefined,
    }));

    if (options.length === 0) return;

    builder.select({ customId: `${PANEL_PREFIX}:${action}`, placeholder, options });
}

export function RenderPanel(client: BotClient, state: INotifierState): INotifierPanelView {
    const entry = Active(state);

    if (state.view !== "home" && state.view !== "add" && state.view !== "status" && !entry) {
        state.view = "home";
    }

    const titles: Record<string, [string, string]> = {
        home: ["🔔 | Notifier", "YouTube und Twitch in deinen Discord"],
        add: ["➕ | Kanal hinzufügen", "Plattform wählen"],
        entry: ["📡 | Kanal", entry?.name ?? ""],
        message: ["💬 | Nachricht", entry?.name ?? ""],
        roles: ["🎭 | Rollen & Verknüpfung", entry?.name ?? ""],
        options: ["⚙️ | Optionen", entry?.name ?? ""],
        status: ["📊 | Status", "Plattformen und letzte Prüfungen"],
    };

    const [title, subtitle] = titles[state.view] ?? titles.home;
    const builder = Head(state, title, subtitle);

    if (state.view === "home") Home(builder, client, state);
    else if (state.view === "add") Add(builder, client, state);
    else if (state.view === "status") StatusView(builder, client, state);
    else if (entry && state.view === "entry") Entry(builder, client, state, entry);
    else if (entry && state.view === "message") MessageView(builder, client, entry);
    else if (entry && state.view === "roles") Roles(builder, entry);
    else if (entry && state.view === "options") Options(builder, entry);

    return { components: [builder.build()] };
}

export function AccentFor(platform: Platform): string {
    return PLATFORM_ACCENT[platform];
}

import { ColorResolvable } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "./ComponentV2Builder";
import LogType from "../enums/LogType";
import IDiscordLogChannel from "../interfaces/database/models/IDiscordLogChannel";
import { ILoggingPanelView, ILoggingState } from "../interfaces/services/logging/ILoggingPanel";
import { CATEGORIES, CHANNEL_TYPES, Category } from "../constants/Logging";

export const PANEL_PREFIX = "logging:panel";

export const PanelStates = new LRUCache<string, ILoggingState>({ max: 50, ttl: 30 * 60_000 });

const BASE_ACCENT = "#5865F2";

export function NewPanelState(guildId: string, targets: IDiscordLogChannel[]): ILoggingState {
    return {
        guildId,
        view: "home",
        targets: new Map(targets.map((target) => [target.logType as LogType, target])),
        health: [],
        logType: null,
        kind: null,
        notice: null,
    };
}

function Accent(state: ILoggingState): ColorResolvable {
    return (state.logType ? Category(state.logType).accent : BASE_ACCENT) as ColorResolvable;
}

function Head(state: ILoggingState, title: string, subtitle?: string): ComponentV2Builder {
    const builder = new ComponentV2Builder({ accentColor: Accent(state) }).title(title, subtitle);

    if (state.notice) builder.subtext(state.notice);

    return builder.separator();
}

function Home(builder: ComponentV2Builder, state: ILoggingState): void {
    const configured = state.targets.size;

    builder.text(
        CATEGORIES.map((category) => {
            const target = state.targets.get(category.type);
            const where = target ? `<#${target.channelId}>` : "_kein Kanal_";

            return `${target ? "🟢" : "⚪"} ${category.emoji} **${category.label}** → ${where}`;
        }).join("\n")
    );

    builder.subtext(`${configured} von ${CATEGORIES.length} Kategorien eingerichtet.`);

    builder.select({
        customId: `${PANEL_PREFIX}:category`,
        placeholder: "🗒️ | Kategorie einrichten...",
        options: CATEGORIES.map((category) => ({
            label: category.label.slice(0, 100),
            value: category.type,
            description: (state.targets.has(category.type) ? "✅ " : "") + category.description.slice(0, 90),
            emoji: category.emoji,
        })),
    });

    builder.buttons(
        { customId: `${PANEL_PREFIX}:status`, label: "Status", emoji: "📊", tone: "primary" },
        { customId: `${PANEL_PREFIX}:refresh`, label: "Neu laden", emoji: "🔄" }
    );
}

// Die Vorstufe zum Kanal-Picker. Text-Kanäle und Threads landen sonst in einer langen,
// gemischten Liste, in der man nicht mehr sieht, was was ist.
function Kind(builder: ComponentV2Builder, state: ILoggingState, type: LogType): void {
    const category = Category(type);
    const current = state.targets.get(type);

    builder.text(
        `${category.emoji} **${category.label}**\n` +
            `${category.description}\n\n` +
            `📥 **Was hier landet:** ${category.events}\n` +
            `📢 **Aktuell:** ${current ? `<#${current.channelId}>` : "_kein Kanal_"}`
    );

    builder.text("**Wohin soll es gehen — ein Text-Kanal oder ein Thread?**");

    builder.select({
        customId: `${PANEL_PREFIX}:kind`,
        placeholder: "📁 | Kanal-Art wählen...",
        options: [
            {
                label: "Text-Kanal",
                value: "text",
                description: "Ein normaler Server- oder Ankündigungs-Kanal",
                emoji: "💬",
            },
            {
                label: "Thread",
                value: "thread",
                description: "Ein bestehender Thread, auch ein Forum-Beitrag",
                emoji: "🧵",
            },
        ],
    });

    builder.buttons(
        { customId: `${PANEL_PREFIX}:clear`, label: "Kanal entfernen", emoji: "🗑️", tone: "danger", disabled: !current },
        { customId: `${PANEL_PREFIX}:test`, label: "Testlauf", emoji: "🚀", disabled: !current },
        { customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️" }
    );
}

function Pick(builder: ComponentV2Builder, state: ILoggingState, type: LogType): void {
    const category = Category(type);
    const thread = state.kind === "thread";

    builder.text(
        `${category.emoji} **${category.label}**\n\n` +
            `Wähle den ${thread ? "**Thread**" : "**Text-Kanal**"}, in den die Einträge geschrieben werden.`
    );

    if (thread) {
        // Ein archivierter Thread nimmt über die API nichts an. Der Bot weckt ihn beim
        // Senden auf, aber das kann fehlschlagen - deshalb der Hinweis vorab.
        builder.subtext(
            "🧵 Archivierte Threads werden beim Senden automatisch geweckt. " +
                "Ein **gesperrter** Thread lässt sich nicht wecken und nimmt keine Logs an."
        );
    }

    builder.channelSelect({
        customId: `${PANEL_PREFIX}:channel`,
        channelTypes: CHANNEL_TYPES[state.kind ?? "text"],
        placeholder: thread ? "🧵 | Thread wählen..." : "💬 | Text-Kanal wählen...",
    });

    builder.buttons(
        { customId: `${PANEL_PREFIX}:back`, label: "Andere Kanal-Art", emoji: "🔀" },
        { customId: `${PANEL_PREFIX}:home`, label: "Abbrechen", emoji: "⬅️", tone: "danger" }
    );
}

function Status(builder: ComponentV2Builder, state: ILoggingState): void {
    if (state.health.length === 0) {
        builder.text("Noch keine Kategorie eingerichtet — es gibt nichts zu prüfen.");
    } else {
        builder.text(
            state.health
                .map((entry) => {
                    const category = Category(entry.logType);
                    const icon = entry.writable ? "🟢" : "🔴";
                    const kind = entry.isThread ? `🧵 Thread${entry.archived ? " · _archiviert_" : ""}` : "💬 Text";

                    return (
                        `${icon} ${category.emoji} **${category.label}** → <#${entry.channelId}>\n` +
                        `-# ${kind}${entry.problem ? ` · ⚠️ ${entry.problem}` : " · schreibbereit"}`
                    );
                })
                .join("\n")
        );
    }

    const broken = state.health.filter((entry) => !entry.writable).length;

    if (broken > 0) {
        builder.subtext(`⚠️ ${broken} Kategorie(n) können nicht schreiben — die Logs gehen dort verloren.`);
    }

    builder.buttons(
        { customId: `${PANEL_PREFIX}:testall`, label: "Alle testen", emoji: "🚀", tone: "primary" },
        { customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" }
    );
}

export function RenderPanel(_client: BotClient, state: ILoggingState): ILoggingPanelView {
    // Ohne gewählte Kategorie gibt es in den Detail-Ansichten nichts zu zeigen.
    if ((state.view === "kind" || state.view === "pick") && !state.logType) state.view = "home";

    const category = state.logType ? Category(state.logType) : null;

    const titles: Record<string, [string, string]> = {
        home: ["🗒️ | Logging", "Was auf dem Server passiert, schriftlich"],
        kind: [`${category?.emoji ?? "🗒️"} | ${category?.label ?? "Kategorie"}`, "Kanal-Art wählen"],
        pick: [`${category?.emoji ?? "🗒️"} | ${category?.label ?? "Kategorie"}`, "Kanal wählen"],
        status: ["📊 | Status", "Erreichbarkeit und Schreibrechte"],
    };

    const [title, subtitle] = titles[state.view] ?? titles.home;
    const builder = Head(state, title, subtitle);

    if (state.view === "home") Home(builder, state);
    else if (state.view === "status") Status(builder, state);
    else if (state.logType && state.view === "kind") Kind(builder, state, state.logType);
    else if (state.logType && state.view === "pick") Pick(builder, state, state.logType);

    return { components: [builder.build()] };
}

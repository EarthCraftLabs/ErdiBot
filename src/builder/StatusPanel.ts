import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "./ComponentV2Builder";
import IStatusEntry from "../interfaces/services/status/IStatusEntry";
import { IStatusPanelView, IStatusState } from "../interfaces/services/status/IStatusPanel";
import {
    FIXED,
    KINDS,
    Kind,
    MAX_ENTRIES,
    MAX_INTERVAL,
    MAX_STATUS_LENGTH,
    MIN_INTERVAL,
    PLACEHOLDERS,
} from "../constants/Status";

export const PANEL_PREFIX = "status:panel";

export const PanelStates = new LRUCache<string, IStatusState>({ max: 50, ttl: 30 * 60_000 });

export function NewPanelState(
    entries: IStatusEntry[],
    interval: number,
    enabled: boolean
): IStatusState {
    return {
        view: "home",
        entries,
        interval,
        enabled,
        entryId: null,
        notice: null,
    };
}

export function ActiveEntry(state: IStatusState): IStatusEntry | null {
    return state.entries.find((entry) => entry.id === state.entryId) ?? null;
}

function Head(state: IStatusState, title: string, subtitle?: string): ComponentV2Builder {
    const builder = new ComponentV2Builder({ accentColor: state.enabled ? "#5865F2" : "#4E5058" }).title(
        title,
        subtitle
    );

    if (state.notice) builder.subtext(state.notice);

    return builder.separator();
}

// Wie der Eintrag später in Discord steht: "Hört EarthCraft | /help".
function Preview(entry: IStatusEntry): string {
    const info = Kind(entry.kind);

    return info.prefix ? `${info.prefix} ${entry.text}` : entry.text;
}

function Home(builder: ComponentV2Builder, client: BotClient, state: IStatusState): void {
    const active = state.entries.filter((entry) => entry.enabled);
    const running = client.statusService.Current;

    builder.text(
        `${state.enabled ? "🟢 **Rotation läuft**" : "🔴 **Rotation steht**"}\n` +
            `🔄 **Wechsel:** alle ${state.interval} Sekunden\n` +
            `📋 **Einträge:** ${active.length} aktiv von ${state.entries.length}\n` +
            `📡 **Gerade sichtbar:** ${running ? `\`${Preview(running)}\`` : "_nichts_"}`
    );

    builder.separator({ divider: false });

    builder.text(
        state.entries
            .map((entry) => {
                const info = Kind(entry.kind);
                const mark = entry.enabled ? "🟢" : "⚪";

                return `${mark} ${info.emoji} \`${Preview(entry)}\`${entry.fixed ? " · _fest_" : ""}`;
            })
            .join("\n")
    );

    builder.subtext(
        `Die beiden festen Einträge laufen immer mit. Eigene: ${state.entries.length - FIXED.length}/${MAX_ENTRIES}.`
    );

    builder.select({
        customId: `${PANEL_PREFIX}:pick`,
        placeholder: "✏️ | Eintrag bearbeiten …",
        options: state.entries.slice(0, 25).map((entry) => ({
            label: entry.text.slice(0, 100),
            value: entry.id,
            description: `${Kind(entry.kind).label}${entry.fixed ? " · fest" : entry.enabled ? "" : " · inaktiv"}`.slice(
                0,
                100
            ),
            emoji: Kind(entry.kind).emoji,
        })),
    });

    builder.buttons(
        {
            customId: `${PANEL_PREFIX}:new`,
            label: "Status anlegen",
            emoji: "➕",
            tone: "success",
            disabled: state.entries.length - FIXED.length >= MAX_ENTRIES,
        },
        { customId: `${PANEL_PREFIX}:interval`, label: "Intervall", emoji: "🔄", tone: "primary" },
        {
            customId: `${PANEL_PREFIX}:toggle`,
            label: state.enabled ? "Rotation aus" : "Rotation an",
            emoji: "🔌",
        },
        { customId: `${PANEL_PREFIX}:next`, label: "Weiterschalten", emoji: "⏭️" },
        { customId: `${PANEL_PREFIX}:placeholders`, label: "Platzhalter", emoji: "🔣" }
    );
}

function Entry(builder: ComponentV2Builder, state: IStatusState, entry: IStatusEntry): void {
    const info = Kind(entry.kind);

    builder.text(
        `${info.emoji} **${info.label}**\n` +
            `\`${Preview(entry)}\`\n\n` +
            `${entry.enabled ? "🟢 In der Rotation" : "⚪ Pausiert"}`
    );

    if (entry.fixed) {
        builder.subtext("Dieser Eintrag gehört zum Bot — er lässt sich weder ändern noch abschalten.");

        builder.buttons({ customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" });

        return;
    }

    builder.select({
        customId: `${PANEL_PREFIX}:kind`,
        placeholder: "🎭 | Art wählen …",
        options: KINDS.map((option) => ({
            label: option.label,
            value: option.id,
            description: option.description,
            emoji: option.emoji,
            default: option.id === entry.kind,
        })),
    });

    builder.buttons(
        { customId: `${PANEL_PREFIX}:edit`, label: "Text ändern", emoji: "✏️", tone: "primary" },
        { customId: `${PANEL_PREFIX}:pause`, label: entry.enabled ? "Pausieren" : "Aktivieren", emoji: "🔌" },
        { customId: `${PANEL_PREFIX}:delete`, label: "Löschen", emoji: "🗑️", tone: "danger" },
        { customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️" }
    );
}

function Placeholders(builder: ComponentV2Builder): void {
    builder.text("Diese Bausteine werden bei jedem Wechsel durch aktuelle Zahlen ersetzt:");
    builder.list(PLACEHOLDERS.map((entry) => `\`${entry.token}\` — ${entry.description}`));
    builder.subtext(`Ein Status darf ${MAX_STATUS_LENGTH} Zeichen lang sein — eingesetzte Zahlen zählen mit.`);

    builder.buttons({ customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" });
}

export function RenderPanel(client: BotClient, state: IStatusState): IStatusPanelView {
    const entry = ActiveEntry(state);

    if (state.view === "entry" && !entry) state.view = "home";

    const titles: Record<string, [string, string]> = {
        home: ["🎭 | Bot-Status", `Wechselt alle ${state.interval} Sekunden`],
        entry: ["✏️ | Status bearbeiten", entry?.text ?? ""],
        placeholders: ["🔣 | Platzhalter", `${PLACEHOLDERS.length} Bausteine`],
    };

    const [title, subtitle] = titles[state.view] ?? titles.home;
    const builder = Head(state, title, subtitle);

    if (state.view === "placeholders") Placeholders(builder);
    else if (state.view === "entry" && entry) Entry(builder, state, entry);
    else Home(builder, client, state);

    if (state.view === "home") {
        builder.subtext(`Der Wechsel geht von ${MIN_INTERVAL} bis ${MAX_INTERVAL} Sekunden.`);
    }

    return { components: [builder.build()] };
}

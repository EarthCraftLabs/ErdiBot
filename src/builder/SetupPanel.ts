import BotClient from "../client/BotClient";
import ComponentV2Builder from "./ComponentV2Builder";
import { IActionButtonOptions, ISelectEntryOptions } from "../interfaces/builder/IComponentV2Builder";

export const SETUP_PREFIX = "setup:panel";

export type SetupSection = "welcome" | "tickets" | "notifier" | "logging";

interface ISetupSection extends ISelectEntryOptions {
    value: SetupSection;
}

export const SECTIONS: ISetupSection[] = [
    {
        value: "welcome",
        label: "Willkommen",
        description: "Begrüssung und Willkommenskarte",
        emoji: "👋",
    },
    {
        value: "tickets",
        label: "Tickets",
        description: "Support-Tickets, Kategorien und Transcripts",
        emoji: "🎫",
    },
    {
        value: "notifier",
        label: "Notifier",
        description: "Meldungen für YouTube und Twitch",
        emoji: "🔔",
    },
    {
        value: "logging",
        label: "Logging",
        description: "Log-Kanäle für Serverereignisse",
        emoji: "🗒️",
    },
];

// Der Rückweg aus jedem Panel. Steht hier, weil alle vier Panels ihn brauchen und der
// Knopf sonst viermal mit leicht anderer ID im Code stünde.
export const HOME_BUTTON: IActionButtonOptions = {
    customId: `${SETUP_PREFIX}:home`,
    label: "Setup",
    emoji: "⬅️",
};

export function RenderSetup(client: BotClient, guildName?: string): ComponentV2Builder {
    return new ComponentV2Builder({ accentColor: "Blurple" })
        .title("🧰 | Setup", guildName ?? client.user?.username ?? "Einrichtung")
        .separator()
        .text("Wähle unten aus, was du einrichten möchtest.")
        .list(SECTIONS.map((section) => `${section.emoji} **${section.label}** — ${section.description}`))
        .separator()
        .select({
            customId: `${SETUP_PREFIX}:section`,
            placeholder: "🧰 | Bereich wählen...",
            options: SECTIONS,
        })
        .subtext("Jedes Panel bringt dich mit **⬅️ Setup** hierher zurück.");
}

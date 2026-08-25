import BotClient from "../client/BotClient";
import ComponentV2Builder from "./ComponentV2Builder";
import ISetupModule, { ISetupView } from "../interfaces/services/setup/ISetupModule";
import { CONFIG_KEY, PANEL_PREFIX } from "../constants/Setup";
import { MAX_SELECT_OPTIONS } from "../constants/Discord";
import {
    NewPanelState as NewWelcomeState,
    PanelStates as WelcomeStates,
    RenderPanel as RenderWelcome,
} from "./WelcomePanel";
import {
    NewPanelState as NewRolesState,
    PanelStates as RolesStates,
    RenderPanel as RenderRoles,
} from "./ReactionRolesPanel";

const ACCENT = "#B57BFF";

const Welcome: ISetupModule = {
    key: "welcome",

    async Status(client: BotClient, guildId: string): Promise<string> {
        const config = await client.welcomeService.Get(guildId);

        return (
            `${config.enabled ? "🟢 Aktiv" : "🔴 Inaktiv"} · ` +
            `${config.channelId ? `<#${config.channelId}>` : "kein Kanal"} · ` +
            `${config.card.layers.length} Ebene(n)`
        );
    },

    async Open(client: BotClient, guildId: string, messageId: string): Promise<ISetupView> {
        const config = await client.welcomeService.Get(guildId);
        const state = NewWelcomeState(guildId, config);

        WelcomeStates.set(messageId, state);

        return RenderWelcome(client, state);
    },
};

const ReactionRoles: ISetupModule = {
    key: "reactionroles",

    async Status(client: BotClient, guildId: string): Promise<string> {
        const panels = await client.reactionRolesService.List(guildId);
        const live = panels.filter((panel) => panel.messageId).length;

        if (panels.length === 0) return "⚪ Noch kein Panel angelegt";

        return `🟢 ${panels.length} Panel(s) · ${live} veröffentlicht`;
    },

    async Open(client: BotClient, guildId: string, messageId: string): Promise<ISetupView> {
        const state = NewRolesState(guildId);

        RolesStates.set(messageId, state);

        return RenderRoles(client, state);
    },
};

export const SETUP_MODULES: Record<string, ISetupModule> = {
    [Welcome.key]: Welcome,
    [ReactionRoles.key]: ReactionRoles,
};

export function SetupModule(key: string): ISetupModule | null {
    return SETUP_MODULES[key] ?? null;
}

/** Die Übersicht: was setup.json anbietet und wofür es ein Modul gibt. */
export async function RenderHub(client: BotClient, guildId: string): Promise<ISetupView> {
    const guild = client.guilds.cache.get(guildId);
    const builder = new ComponentV2Builder({ accentColor: ACCENT })
        .title("🛠️ | Setup", guild?.name ?? guildId)
        .separator();

    const options = client.configService
        .Options(CONFIG_KEY, "modules")
        .filter((option) => SetupModule(option.value) !== null)
        .slice(0, MAX_SELECT_OPTIONS);

    if (options.length === 0) {
        builder.text("Es ist kein Setup-Bereich eingerichtet — bitte `src/config/setup.json` prüfen.");

        return { components: [builder.build()], files: [] };
    }

    // Ein Status pro Bereich; fällt die Datenbank aus, bleibt der Rest der Übersicht trotzdem stehen.
    const states = await Promise.all(
        options.map((option) =>
            SetupModule(option.value)!
                .Status(client, guildId)
                .catch(() => "⚠️ Status nicht verfügbar")
        )
    );

    builder.text(
        options
            .map((option, index) => `${option.emoji} **${option.name}**\n-# ${option.description}\n-# ${states[index]}`)
            .join("\n\n")
    );

    builder.select({
        customId: `${PANEL_PREFIX}:module`,
        placeholder: "🧩 | Bereich einrichten...",
        options: options.map((option) => ({
            label: option.name.slice(0, 100),
            value: option.value,
            description: option.description ? option.description.slice(0, 100) : undefined,
            emoji: option.emoji || undefined,
        })),
    });

    builder.subtext("Das Panel läuft nach 30 Minuten ab — danach einfach `/setup` erneut aufrufen.");

    return { components: [builder.build()], files: [] };
}

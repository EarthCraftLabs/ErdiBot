import { Events, Interaction, MessageComponentInteraction, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { PANEL_PREFIX, PanelStates, RenderPanel } from "../../builder/LoggingPanel";
import { ILoggingState } from "../../interfaces/services/logging/ILoggingPanel";
import LogType from "../../enums/LogType";
import { CATEGORIES, Category, IsChannelKind, IsLogType } from "../../constants/Logging";

export default class LoggingHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bedient das Logging-Setup (Buttons und Selects)",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isMessageComponent()) return;
        if (!interaction.customId.startsWith(PANEL_PREFIX)) return;

        try {
            await this.Component(interaction);
        } catch (error) {
            if (!this.client.database.IsReady) {
                await this.Fail(interaction, "Der Bot hat gerade keine Verbindung zur Datenbank.");

                return;
            }

            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Logging Error: ${interaction.customId}`);
        }
    }

    private async Component(interaction: MessageComponentInteraction): Promise<void> {
        const state = PanelStates.get(interaction.message.id);

        if (!state) {
            await interaction.update(this.Notice("⌛ | Panel abgelaufen", "Öffne das Setup mit `/logging` erneut."));

            return;
        }

        const action = interaction.customId.slice(PANEL_PREFIX.length + 1);
        state.notice = null;

        if (interaction.isAnySelectMenu()) return this.Selected(interaction, state, action);
        if (!interaction.isButton()) return;

        switch (action) {
            case "home":
                state.view = "home";
                state.logType = null;
                state.kind = null;
                break;

            case "back":
                state.view = "kind";
                state.kind = null;
                break;

            case "status":
                return this.Status(interaction, state);

            case "refresh":
                return this.Reload(interaction, state);

            case "clear":
                return this.Clear(interaction, state);

            case "test":
                return this.Test(interaction, state, false);

            case "testall":
                return this.Test(interaction, state, true);

            default:
                break;
        }

        await this.Apply(interaction, state);
    }

    private async Selected(
        interaction: MessageComponentInteraction,
        state: ILoggingState,
        action: string
    ): Promise<void> {
        if (!interaction.isAnySelectMenu()) return;

        const value = interaction.values[0];

        if (action === "category" && IsLogType(value)) {
            state.logType = value;
            state.kind = null;
            state.view = "kind";
        }

        if (action === "kind" && IsChannelKind(value)) {
            state.kind = value;
            state.view = "pick";
        }

        if (action === "channel") return this.Save(interaction, state, value);

        await this.Apply(interaction, state);
    }

    private async Save(
        interaction: MessageComponentInteraction,
        state: ILoggingState,
        channelId: string
    ): Promise<void> {
        if (!state.logType) return this.Apply(interaction, state);

        const category = Category(state.logType);
        const channel = interaction.guild?.channels.cache.get(channelId);

        await this.client.loggingService.Set(state.guildId, state.logType, channelId, channel?.name ?? channelId);
        await this.Refill(state);

        state.notice = `💾 **${category.label}** schreibt jetzt nach <#${channelId}>.`;
        state.view = "home";
        state.logType = null;
        state.kind = null;

        await this.Apply(interaction, state);
    }

    private async Clear(interaction: MessageComponentInteraction, state: ILoggingState): Promise<void> {
        if (!state.logType) return this.Apply(interaction, state);

        const category = Category(state.logType);

        await this.client.loggingService.Clear(state.guildId, state.logType);
        state.targets.delete(state.logType);

        state.notice = `🗑️ **${category.label}** ist wieder abgeschaltet.`;
        state.view = "home";
        state.logType = null;
        state.kind = null;

        await this.Apply(interaction, state);
    }

    private async Test(interaction: MessageComponentInteraction, state: ILoggingState, all: boolean): Promise<void> {
        await interaction.deferUpdate();

        const types = all
            ? CATEGORIES.filter((category) => state.targets.has(category.type)).map((category) => category.type)
            : state.logType
              ? [state.logType]
              : [];

        let sent = 0;

        for (const type of types) {
            const category = Category(type);

            const ok = await this.client.loggingService.Send(state.guildId, {
                type,
                title: "Testlauf",
                description:
                    `Diese Nachricht kommt aus dem Setup, ausgelöst von ${interaction.user}.\n\n` +
                    `📥 **Hier landet künftig:** ${category.events}`,
            });

            if (ok) sent++;
        }

        state.notice =
            types.length === 0
                ? "⚠️ Es ist keine Kategorie eingerichtet."
                : sent === types.length
                  ? `🚀 ${sent} Testnachricht(en) verschickt.`
                  : `⚠️ Nur ${sent} von ${types.length} kamen durch — Details stehen im **Status**.`;

        if (all) return this.Status(interaction, state);

        state.view = "home";
        state.logType = null;

        await this.Apply(interaction, state);
    }

    private async Status(interaction: MessageComponentInteraction, state: ILoggingState): Promise<void> {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();

        state.health = await this.client.loggingService.Health(state.guildId);
        state.view = "status";
        state.logType = null;

        await this.Apply(interaction, state);
    }

    private async Reload(interaction: MessageComponentInteraction, state: ILoggingState): Promise<void> {
        await this.Refill(state);

        state.view = "home";
        state.logType = null;
        state.kind = null;

        await this.Apply(interaction, state);
    }

    private async Refill(state: ILoggingState): Promise<void> {
        const targets = await this.client.loggingService.Targets(state.guildId);

        state.targets = new Map(targets.map((target) => [target.logType as LogType, target]));
    }

    private async Apply(interaction: MessageComponentInteraction, state: ILoggingState): Promise<void> {
        const view = RenderPanel(this.client, state);

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });

            return;
        }

        await interaction.update({ ...view, flags: MessageFlags.IsComponentsV2 });
    }

    private Notice(title: string, message: string) {
        const builder = new ComponentV2Builder({ accentColor: "#ED4245" }).title(title).separator().text(message);

        return { components: [builder.build()], flags: MessageFlags.IsComponentsV2 as const };
    }

    private async Fail(interaction: Interaction, message: string): Promise<void> {
        if (!interaction.isRepliable()) return;

        const payload = {
            ...this.Notice("⚠️ | Geht gerade nicht", message),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        };

        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
    }
}

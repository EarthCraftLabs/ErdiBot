import { Events, Interaction, MessageComponentInteraction, MessageFlags, StringSelectMenuInteraction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import LogType from "../../enums/LogType";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { RenderSetup, SECTIONS, SETUP_PREFIX, SetupSection } from "../../builder/SetupPanel";
import {
    NewPanelState as NewWelcomeState,
    PanelStates as WelcomeStates,
    RenderPanel as RenderWelcome,
} from "../../builder/WelcomePanel";
import {
    NewSetupState as NewTicketState,
    RenderSetup as RenderTickets,
    SetupStates as TicketStates,
} from "../../builder/TicketSetupPanel";
import {
    NewPanelState as NewNotifierState,
    PanelStates as NotifierStates,
    RenderPanel as RenderNotifier,
} from "../../builder/NotifierPanel";
import {
    NewPanelState as NewLoggingState,
    PanelStates as LoggingStates,
    RenderPanel as RenderLogging,
} from "../../builder/LoggingPanel";

export default class SetupHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bündelt die Einrichtung unter /setup",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isMessageComponent()) return;
        if (!interaction.customId.startsWith(SETUP_PREFIX)) return;

        try {
            if (interaction.isStringSelectMenu()) await this.Open(interaction);
            else await this.Home(interaction);
        } catch (error) {
            if (!this.client.database.IsReady) {
                await this.Fail(interaction, "Der Bot hat gerade keine Verbindung zur Datenbank.");

                return;
            }

            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Setup Error: ${interaction.customId}`);
        }
    }

    // attachments leeren: kommt man aus dem Welcome-Panel zurück, hängt sonst die
    // Kartenvorschau unter einer Nachricht, die sie nicht mehr zeigt.
    private async Home(interaction: MessageComponentInteraction): Promise<void> {
        const builder = RenderSetup(this.client, interaction.guild?.name);

        await interaction.update({ ...builder.toMessage(), attachments: [] });
    }

    private async Open(interaction: StringSelectMenuInteraction): Promise<void> {
        const section = SECTIONS.find((entry) => entry.value === interaction.values[0]);

        if (!section || !interaction.guildId) return this.Home(interaction);

        // Die Panels laden ihre Konfiguration aus der Datenbank und rendern teils ein Bild -
        // das dauert länger als die drei Sekunden, die Discord der Antwort gibt.
        await interaction.deferUpdate();

        const view = await this.Section(interaction.message.id, interaction.guildId, section.value);

        await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2, attachments: [] });
    }

    // Der Zustand landet unter der Message-ID - genau dort, wo die vier bestehenden Handler
    // ihn nachschlagen. Ab hier bedient jedes Panel sich wieder selbst.
    private async Section(messageId: string, guildId: string, section: SetupSection) {
        if (section === "tickets") {
            // Der Transcript-Kanal steht im Logging-Setup: das Ticket-Panel zeigt ihn nur an.
            const log = await this.client.loggingService.Target(guildId, LogType.TICKET);
            const state = NewTicketState(guildId, await this.client.ticketService.Config(guildId), log?.channelId ?? null);
            TicketStates.set(messageId, state);

            return RenderTickets(this.client, state);
        }

        if (section === "notifier") {
            const state = NewNotifierState(guildId, await this.client.notifierService.List(guildId));
            NotifierStates.set(messageId, state);

            return RenderNotifier(this.client, state);
        }

        if (section === "logging") {
            const state = NewLoggingState(guildId, await this.client.loggingService.Targets(guildId));
            LoggingStates.set(messageId, state);

            return RenderLogging(this.client, state);
        }

        const state = NewWelcomeState(guildId, await this.client.welcomeService.Get(guildId));
        WelcomeStates.set(messageId, state);

        return RenderWelcome(this.client, state);
    }

    private async Fail(interaction: MessageComponentInteraction, text: string): Promise<void> {
        const message = new ComponentV2Builder({ accentColor: "Red" })
            .title("🗄️ | Datenbank nicht erreichbar")
            .separator()
            .text(text)
            .toMessage();

        const send =
            interaction.deferred || interaction.replied
                ? interaction.editReply(message)
                : interaction.reply({ ...message, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        await send.catch(() => {});
    }
}

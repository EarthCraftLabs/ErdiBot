import {
    Events,
    Interaction,
    LabelBuilder,
    StringSelectMenuBuilder,
    MessageComponentInteraction,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { ActiveEntry, PANEL_PREFIX, PanelStates, RenderPanel } from "../../builder/StatusPanel";
import { IStatusState } from "../../interfaces/services/status/IStatusPanel";
import { Clamp, IsKind, KINDS, MAX_INTERVAL, MAX_STATUS_LENGTH, MIN_INTERVAL, Text } from "../../constants/Status";

export default class StatusHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bedient das Bot-Status-Panel",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        const component = interaction.isMessageComponent();
        if (!component && !interaction.isModalSubmit()) return;
        if (!interaction.customId.startsWith(PANEL_PREFIX)) return;

        try {
            if (interaction.isModalSubmit()) await this.Modal(interaction);
            else await this.Component(interaction);
        } catch (error) {
            if (!this.client.database.IsReady) {
                await this.Fail(interaction, "Der Bot hat gerade keine Verbindung zur Datenbank.");

                return;
            }

            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Status Error: ${interaction.customId}`);
        }
    }

    private async Component(interaction: MessageComponentInteraction): Promise<void> {
        const state = PanelStates.get(interaction.message.id);

        if (!state) {
            await interaction.update(this.Notice("⌛ | Panel abgelaufen", "Öffne es mit `/status` erneut."));

            return;
        }

        const action = interaction.customId.slice(PANEL_PREFIX.length + 1);
        state.notice = null;

        // Modals müssen vor jedem Update geöffnet werden.
        if (action === "new") return this.Editor(interaction, state, null);
        if (action === "edit") return this.Editor(interaction, state, ActiveEntry(state)?.text ?? "");
        if (action === "interval") return this.IntervalEditor(interaction, state);

        if (interaction.isStringSelectMenu()) {
            const value = interaction.values[0];

            if (action === "pick") {
                state.entryId = value;
                state.view = "entry";
            }

            if (action === "kind" && IsKind(value)) {
                const entry = ActiveEntry(state);

                if (entry && !entry.fixed && (await this.client.statusService.Patch(entry.id, { kind: value }))) {
                    state.notice = "🎭 Art geändert.";
                }
            }

            return this.Reload(interaction, state);
        }

        if (!interaction.isButton()) return;

        switch (action) {
            case "home":
            case "placeholders":
                state.view = action === "home" ? "home" : "placeholders";
                state.entryId = action === "home" ? null : state.entryId;
                break;

            case "toggle":
                await this.client.statusService.SaveSettings({ enabled: !state.enabled });
                state.notice = state.enabled ? "🔌 Rotation gestoppt." : "🔌 Rotation läuft.";
                break;

            case "next":
                await this.client.statusService.Rotate();
                state.notice = "⏭️ Weitergeschaltet.";
                break;

            case "pause": {
                const entry = ActiveEntry(state);

                if (entry && !entry.fixed) {
                    await this.client.statusService.Patch(entry.id, { enabled: !entry.enabled });
                    state.notice = entry.enabled ? "⚪ Pausiert." : "🟢 Wieder in der Rotation.";
                }
                break;
            }

            case "delete": {
                const entry = ActiveEntry(state);

                if (entry && !entry.fixed && (await this.client.statusService.Remove(entry.id))) {
                    state.notice = `🗑️ \`${entry.text}\` entfernt.`;
                    state.entryId = null;
                    state.view = "home";
                }
                break;
            }

            default:
                break;
        }

        await this.Reload(interaction, state);
    }

    private async Modal(interaction: ModalSubmitInteraction): Promise<void> {
        const parts = interaction.customId.split(":");
        const kind = parts[2];
        const state = PanelStates.get(parts[3]);

        if (!state) {
            await interaction.reply({
                ...this.Notice("⌛ | Panel abgelaufen", "Öffne es mit `/status` erneut."),
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
        }

        const service = this.client.statusService;

        if (kind === "interval") {
            const seconds = Clamp(Number(interaction.fields.getTextInputValue("seconds")), MIN_INTERVAL, MAX_INTERVAL);

            await service.SaveSettings({ interval: seconds });
            state.notice = `🔄 Wechsel alle ${seconds} Sekunden.`;
        }

        if (kind === "text") {
            const text = Text(interaction.fields.getTextInputValue("text"));
            const entry = ActiveEntry(state);

            if (!text) state.notice = "⚠️ Ohne Text geht es nicht.";
            else if (entry && !entry.fixed) {
                await service.Patch(entry.id, { text });
                state.notice = "✏️ Text geändert.";
            } else {
                const picked = interaction.fields.getStringSelectValues("kind")[0];
                const chosen = IsKind(picked) ? picked : "playing";

                state.notice = (await service.Add(text, chosen))
                    ? "➕ Status angelegt."
                    : "⚠️ Es passt kein weiterer Status mehr rein.";

                state.view = "home";
            }
        }

        await this.Reload(interaction, state);
    }

    private async Editor(
        interaction: MessageComponentInteraction,
        state: IStatusState,
        value: string | null
    ): Promise<void> {
        if (!interaction.isButton()) return;

        // Beim Anlegen zeigt das Panel danach die Liste, nicht den alten Eintrag.
        if (value === null) state.entryId = null;

        await this.Show(
            interaction,
            "text",
            value === null ? "Status anlegen" : "Text ändern",
            [
                {
                    id: "text",
                    label: "Text",
                    value: value ?? "",
                    description: `Platzhalter wie {members} sind erlaubt · max. ${MAX_STATUS_LENGTH} Zeichen`,
                    max: MAX_STATUS_LENGTH,
                },
            ],
            // Nur beim Anlegen: bei einem bestehenden Eintrag steht die Art schon im Panel.
            value === null
        );
    }

    private async IntervalEditor(interaction: MessageComponentInteraction, state: IStatusState): Promise<void> {
        if (!interaction.isButton()) return;

        await this.Show(interaction, "interval", "Wechsel-Intervall", [
            {
                id: "seconds",
                label: "Sekunden",
                value: String(state.interval),
                description: `${MIN_INTERVAL} bis ${MAX_INTERVAL} — Discord lässt schnellere Wechsel nicht zu`,
                max: 4,
            },
        ]);
    }

    private async Show(
        interaction: MessageComponentInteraction,
        kind: string,
        title: string,
        fields: Array<{ id: string; label: string; value: string; description?: string; max: number }>,
        withKind = false
    ): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId(`${PANEL_PREFIX}:${kind}:${interaction.message.id}`)
            .setTitle(title.slice(0, 45));

        if (withKind) {
            modal.addLabelComponents(
                new LabelBuilder().setLabel("Art").setStringSelectMenuComponent(
                    new StringSelectMenuBuilder().setCustomId("kind").addOptions(
                        KINDS.map((option) => ({
                            label: option.label,
                            value: option.id,
                            description: option.description,
                            emoji: option.emoji,
                            default: option.id === "playing",
                        }))
                    )
                )
            );
        }

        modal.addLabelComponents(
            ...fields.map((field) => {
                const input = new TextInputBuilder()
                    .setCustomId(field.id)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(field.max);

                if (field.value) input.setValue(field.value);

                const label = new LabelBuilder().setLabel(field.label.slice(0, 45)).setTextInputComponent(input);

                return field.description ? label.setDescription(field.description.slice(0, 100)) : label;
            })
        );

        await interaction.showModal(modal);
    }

    // Nach jeder Änderung frisch aus der Datenbank: der Zustand im Panel ist nur eine
    // Anzeige, die Wahrheit steht in der Tabelle.
    private async Reload(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        state: IStatusState
    ): Promise<void> {
        const service = this.client.statusService;
        const settings = await service.Settings();

        state.entries = await service.Entries();
        state.interval = settings.interval;
        state.enabled = settings.enabled;

        const view = RenderPanel(this.client, state);

        if (interaction.isModalSubmit() || interaction.deferred || interaction.replied) {
            await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });

            return;
        }

        await interaction.update({ ...view, flags: MessageFlags.IsComponentsV2 });
    }

    private Notice(title: string, text: string) {
        const builder = new ComponentV2Builder({ accentColor: "Red" }).title(title).separator().text(text);

        return { components: [builder.build()], flags: MessageFlags.IsComponentsV2 as const };
    }

    private async Fail(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        text: string
    ): Promise<void> {
        const message = this.Notice("🗄️ | Datenbank nicht erreichbar", text);

        const send =
            interaction.deferred || interaction.replied
                ? interaction.editReply(message)
                : interaction.reply({ ...message, flags: MessageFlags.Ephemeral });

        await send.catch(() => {});
    }
}

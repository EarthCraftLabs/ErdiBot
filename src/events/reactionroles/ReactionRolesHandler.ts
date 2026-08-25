import {
    AnySelectMenuInteraction,
    ButtonInteraction,
    Events,
    Guild,
    Interaction,
    LabelBuilder,
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
import { ActiveEntry, PANEL_PREFIX, PanelStates, RenderPanel } from "../../builder/ReactionRolesPanel";
import { IReactionRolesState, MediaTarget } from "../../interfaces/services/reactionroles/IReactionRolesPanel";
import {
    MAX_DESCRIPTION_LENGTH,
    MAX_ENTRIES,
    MAX_ENTRY_DESCRIPTION_LENGTH,
    MAX_LABEL_LENGTH,
    MAX_TITLE_LENGTH,
    MAX_URL_LENGTH,
    IsMediaUrl,
    NO_COLOR,
    NormalizeMode,
    NormalizeStyle,
    NormalizeTone,
    NormalizeUrl,
    ParseEmoji,
} from "../../constants/ReactionRoles";

interface IField {
    id: string;
    label: string;
    value: string;
    description?: string;
    max?: number;
    required?: boolean;
}

export default class ReactionRolesHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bedient das ReactionRoles-Setup (Buttons, Selects, Modals)",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        const isComponent = interaction.isMessageComponent();
        if (!isComponent && !interaction.isModalSubmit()) return;
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

            await this.client.guardian.ReportError(
                normalized,
                interaction,
                `ReactionRoles Error: ${interaction.customId}`
            );
        }
    }

    private async Component(interaction: MessageComponentInteraction): Promise<void> {
        const state = PanelStates.get(interaction.message.id);

        if (!state) {
            await interaction.update(this.Notice("⌛ | Panel abgelaufen", "Öffne es mit `/setup` erneut."));

            return;
        }

        const [action, target] = interaction.customId.slice(PANEL_PREFIX.length + 1).split(":");
        state.notice = null;

        if (interaction.isAnySelectMenu()) return this.Selected(interaction, state, action);
        if (!interaction.isButton()) return;

        const entry = ActiveEntry(state);

        switch (action) {
            case "media":
                state.view = "media";
                state.target = null;
                break;

            case "pick":
                state.target = target as MediaTarget;
                state.view = "picker";
                break;

            case "clear":
                if (state.panel) {
                    state.panel[target as MediaTarget] = null;
                    state.dirty = true;
                }
                break;

            case "home":
                state.view = "home";
                state.panel = null;
                state.entryId = null;
                state.dirty = false;
                break;

            case "panel":
                state.view = "panel";
                state.entryId = null;
                state.target = null;
                break;

            case "refresh":
                break;

            case "new":
                state.panel = this.client.reactionRolesService.Create(state.guildId);
                state.entryId = null;
                state.view = "panel";
                state.dirty = true;
                state.notice = "➕ Neues Panel angelegt — vergiss das **Speichern** nicht.";
                break;

            case "save":
                return this.Save(interaction, state);

            case "discard":
                return this.Discard(interaction, state);

            case "delete":
                return this.Remove(interaction, state);

            case "publish":
                return this.Publish(interaction, state);

            case "unpublish":
                return this.Unpublish(interaction, state);

            case "noemoji":
                if (entry) {
                    entry.emoji = null;
                    state.dirty = true;
                }
                break;

            case "up":
            case "down":
                if (
                    state.panel &&
                    entry &&
                    this.client.reactionRolesService.MoveEntry(state.panel, entry.id, action === "up" ? -1 : 1)
                ) {
                    state.dirty = true;
                }
                break;

            case "removeentry":
                if (state.panel && entry && this.client.reactionRolesService.RemoveEntry(state.panel, entry.id)) {
                    state.notice = `🗑️ Eintrag \`${entry.label}\` gelöscht.`;
                    state.entryId = null;
                    state.view = "panel";
                    state.dirty = true;
                }
                break;

            default:
                return this.Prompt(interaction, state, action, target);
        }

        await this.Apply(interaction, state);
    }

    private async Selected(
        interaction: AnySelectMenuInteraction,
        state: IReactionRolesState,
        action: string
    ): Promise<void> {
        const value = interaction.values[0];
        const entry = ActiveEntry(state);

        if (action === "open") {
            const panel = await this.client.reactionRolesService.Get(value);

            if (!panel || panel.guildId !== state.guildId) {
                state.notice = "❌ Dieses Panel gibt es nicht mehr.";
                state.view = "home";
            } else {
                state.panel = panel;
                state.entryId = null;
                state.view = "panel";
                state.dirty = false;
            }

            return this.Apply(interaction, state);
        }

        if (!state.panel) return this.Apply(interaction, state);

        if (action === "image") {
            if (state.target) {
                state.panel[state.target] = value;
                state.dirty = true;
                state.notice = "🖼️ Bild übernommen.";
            }

            state.view = "media";

            return this.Apply(interaction, state);
        }

        if (action === "entry") {
            state.entryId = value;
            state.view = "entry";

            return this.Apply(interaction, state);
        }

        if (action === "addrole") return this.AddRole(interaction, state, value);

        if (action === "role") {
            if (entry) {
                const issue = this.Blocked(interaction.guild, value);

                if (issue) state.notice = `❌ ${issue}`;
                else if (state.panel.entries.some((item) => item.roleId === value && item.id !== entry.id)) {
                    state.notice = "⚠️ Diese Rolle steht schon in einem anderen Eintrag.";
                } else {
                    // Eine selbst gesetzte Beschriftung bleibt stehen, eine automatische zieht mit um.
                    const previous = interaction.guild?.roles.cache.get(entry.roleId)?.name;
                    const next = interaction.guild?.roles.cache.get(value)?.name;

                    if (entry.label === previous && next) entry.label = next.slice(0, MAX_LABEL_LENGTH);

                    entry.roleId = value;
                    state.dirty = true;
                }
            }

            return this.Apply(interaction, state);
        }

        if (action === "channel") state.panel.channelId = value;
        if (action === "style") state.panel.style = NormalizeStyle(value);
        if (action === "mode") state.panel.mode = NormalizeMode(value);
        if (action === "accent") state.panel.accent = value === NO_COLOR ? null : value;
        if (action === "tone" && entry) entry.tone = NormalizeTone(value);

        // Eine bereits veröffentlichte Nachricht zeigt bis zum nächsten "Veröffentlichen" den alten Stand.
        if (action === "channel" && state.panel.messageId) {
            state.notice = "ℹ️ Kanal geändert — die alte Nachricht bleibt stehen, bis du sie entfernst.";
            state.panel.messageId = null;
        }

        state.dirty = true;

        await this.Apply(interaction, state);
    }

    private async AddRole(
        interaction: AnySelectMenuInteraction,
        state: IReactionRolesState,
        roleId: string
    ): Promise<void> {
        const panel = state.panel!;
        const issue = this.Blocked(interaction.guild, roleId);

        if (issue) {
            state.notice = `❌ ${issue}`;

            return this.Apply(interaction, state);
        }

        const role = interaction.guild?.roles.cache.get(roleId);
        const added = this.client.reactionRolesService.AddEntry(panel, roleId, role?.name ?? "Rolle");

        if (!added) {
            state.notice = panel.entries.some((entry) => entry.roleId === roleId)
                ? "⚠️ Diese Rolle steht schon im Panel."
                : `⚠️ Mehr als ${MAX_ENTRIES} Rollen gehen pro Panel nicht.`;

            return this.Apply(interaction, state);
        }

        const warning = interaction.guild
            ? this.client.reactionRolesService.Issue(interaction.guild, roleId)
            : null;

        state.entryId = added.id;
        state.view = "entry";
        state.dirty = true;
        state.notice = warning ? `⚠️ Eingetragen, aber die Rolle ${warning}.` : `➕ \`${added.label}\` eingetragen.`;

        await this.Apply(interaction, state);
    }

    private async Save(interaction: ButtonInteraction, state: IReactionRolesState): Promise<void> {
        if (!state.panel) return this.Apply(interaction, state);

        await interaction.deferUpdate();
        await this.client.reactionRolesService.Save(state.panel);

        state.dirty = false;
        state.notice = "💾 Gespeichert.";

        // Steht die Nachricht schon im Kanal, würde sie sonst den alten Stand zeigen.
        if (state.panel.messageId) {
            try {
                await this.client.reactionRolesService.Publish(state.panel);
                state.notice = "💾 Gespeichert und die Nachricht aktualisiert.";
            } catch (error) {
                state.notice = `💾 Gespeichert, aber die Nachricht blieb alt: ${this.Reason(error)}`;
            }
        }

        await this.Apply(interaction, state, true);
    }

    private async Discard(interaction: ButtonInteraction, state: IReactionRolesState): Promise<void> {
        if (!state.panel) return this.Apply(interaction, state);

        const stored = await this.client.reactionRolesService.Get(state.panel.panelId);

        state.panel = stored;
        state.entryId = null;
        state.view = stored ? "panel" : "home";
        state.dirty = false;
        state.notice = "↩️ Änderungen verworfen.";

        await this.Apply(interaction, state);
    }

    private async Remove(interaction: ButtonInteraction, state: IReactionRolesState): Promise<void> {
        if (!state.panel) return this.Apply(interaction, state);

        await interaction.deferUpdate();
        await this.client.reactionRolesService.Unpublish(state.panel).catch(() => false);
        await this.client.reactionRolesService.Delete(state.panel.panelId);

        state.notice = `🗑️ Panel \`${state.panel.title}\` gelöscht.`;
        state.panel = null;
        state.entryId = null;
        state.view = "home";
        state.dirty = false;

        await this.Apply(interaction, state, true);
    }

    private async Publish(interaction: ButtonInteraction, state: IReactionRolesState): Promise<void> {
        if (!state.panel) return this.Apply(interaction, state);

        await interaction.deferUpdate();

        try {
            await this.client.reactionRolesService.Publish(state.panel);

            state.dirty = false;
            state.notice = `🚀 Veröffentlicht in <#${state.panel.channelId}>.`;
        } catch (error) {
            state.notice = `❌ ${this.Reason(error)}`;
        }

        await this.Apply(interaction, state, true);
    }

    private async Unpublish(interaction: ButtonInteraction, state: IReactionRolesState): Promise<void> {
        if (!state.panel) return this.Apply(interaction, state);

        await interaction.deferUpdate();
        await this.client.reactionRolesService.Unpublish(state.panel);

        state.notice = "🚫 Die Nachricht wurde entfernt — das Panel bleibt als Entwurf bestehen.";

        await this.Apply(interaction, state, true);
    }

    private async Prompt(
        interaction: ButtonInteraction,
        state: IReactionRolesState,
        action: string,
        target?: string
    ): Promise<void> {
        const entry = ActiveEntry(state);

        if (action === "text" && state.panel) {
            return this.Show(interaction, action, "Titel & Text", [
                { id: "title", label: "Titel", value: state.panel.title, max: MAX_TITLE_LENGTH },
                {
                    id: "description",
                    label: "Beschreibung",
                    value: state.panel.description,
                    description: "Steht über den Rollen",
                    max: MAX_DESCRIPTION_LENGTH,
                    required: false,
                },
            ]);
        }

        if (action === "url" && state.panel && target) {
            state.target = target as MediaTarget;

            const current = state.panel[state.target];

            return this.Show(interaction, action, state.target === "thumbnail" ? "Thumbnail" : "Grosses Bild", [
                {
                    id: "url",
                    label: "Bild-Adresse",
                    value: current && !IsMediaUrl(current) ? "" : (current ?? ""),
                    description: "https://… · leer lassen entfernt das Bild",
                    max: MAX_URL_LENGTH,
                    required: false,
                },
            ]);
        }

        if (action === "rename" && entry) {
            return this.Show(interaction, action, "Beschriftung", [
                { id: "label", label: "Beschriftung", value: entry.label, max: MAX_LABEL_LENGTH },
                {
                    id: "description",
                    label: "Beschreibung",
                    value: entry.description ?? "",
                    description: "Leer lassen entfernt sie",
                    max: MAX_ENTRY_DESCRIPTION_LENGTH,
                    required: false,
                },
            ]);
        }

        if (action === "emoji" && entry) {
            return this.Show(interaction, action, "Emoji setzen", [
                {
                    id: "emoji",
                    label: "Emoji",
                    value: entry.emoji?.name ?? "",
                    description: "😀, der Name eines Server-Emojis oder <:name:id>",
                    max: 64,
                },
            ]);
        }

        await this.Apply(interaction, state);
    }

    private async Show(interaction: ButtonInteraction, kind: string, title: string, fields: IField[]): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId(`${PANEL_PREFIX}:modal:${kind}:${interaction.message.id}`)
            .setTitle(title.slice(0, 45));

        modal.addLabelComponents(
            ...fields.map((field) => {
                const input = new TextInputBuilder()
                    .setCustomId(field.id)
                    .setStyle(field.max && field.max > 100 ? TextInputStyle.Paragraph : TextInputStyle.Short)
                    .setRequired(field.required !== false)
                    .setMaxLength(field.max ?? 100);

                if (field.value.length > 0) input.setValue(field.value);

                const label = new LabelBuilder().setLabel(field.label.slice(0, 45)).setTextInputComponent(input);

                return field.description ? label.setDescription(field.description.slice(0, 100)) : label;
            })
        );

        await interaction.showModal(modal);
    }

    private async Modal(interaction: ModalSubmitInteraction): Promise<void> {
        const parts = interaction.customId.split(":");
        const kind = parts[3];
        const state = PanelStates.get(parts[4]);

        if (!state) {
            await interaction.reply({
                ...this.Notice("⌛ | Panel abgelaufen", "Öffne es mit `/setup` erneut."),
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
        }

        const read = (id: string) => interaction.fields.getTextInputValue(id).trim();
        const entry = ActiveEntry(state);

        state.notice = null;

        if (kind === "text" && state.panel) {
            state.panel.title = read("title").slice(0, MAX_TITLE_LENGTH) || state.panel.title;
            state.panel.description = read("description").slice(0, MAX_DESCRIPTION_LENGTH);
            state.dirty = true;
        }

        if (kind === "url" && state.panel && state.target) {
            const input = read("url");
            const url = NormalizeUrl(input);

            // Leer heisst "weg", eine kaputte Adresse heisst "unverändert" — sonst wäre der alte Wert still fort.
            if (input.length === 0) {
                state.panel[state.target] = null;
                state.dirty = true;
            } else if (url) {
                state.panel[state.target] = url;
                state.dirty = true;
            } else {
                state.notice = "⚠️ Das war keine vollständige `https://`-Adresse — der alte Wert bleibt.";
            }

            state.view = "media";
        }

        if (kind === "rename" && entry) {
            entry.label = read("label").slice(0, MAX_LABEL_LENGTH) || entry.label;

            const description = read("description").slice(0, MAX_ENTRY_DESCRIPTION_LENGTH);

            entry.description = description.length > 0 ? description : null;
            state.dirty = true;
        }

        if (kind === "emoji" && entry) {
            const emoji = interaction.guild ? ParseEmoji(read("emoji"), interaction.guild) : null;

            if (emoji) {
                entry.emoji = emoji;
                state.dirty = true;
            } else {
                state.notice =
                    "⚠️ Emoji nicht erkannt — nimm ein normales Emoji, den Namen eines Server-Emojis oder `<:name:id>`.";
            }
        }

        PanelStates.set(parts[4], state);

        const view = await RenderPanel(this.client, state);

        if (interaction.isFromMessage()) {
            await interaction.update({ ...view, flags: MessageFlags.IsComponentsV2, attachments: [] });

            return;
        }

        await interaction.reply({ ...view, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    /** Dauerhafte Ausschlussgründe — die lassen sich auch durch Verschieben der Bot-Rolle nicht beheben. */
    private Blocked(guild: Guild | null, roleId: string): string | null {
        if (!guild) return "Das geht nur in einem Server.";
        if (roleId === guild.id) return "@everyone lässt sich nicht vergeben.";
        if (guild.roles.cache.get(roleId)?.managed) return "Diese Rolle gehört einer Integration und ist gesperrt.";

        return null;
    }

    private Reason(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    private async Apply(
        interaction: MessageComponentInteraction,
        state: IReactionRolesState,
        edit = false
    ): Promise<void> {
        PanelStates.set(interaction.message.id, state);

        const view = await RenderPanel(this.client, state);

        // attachments: [] wirft die Vorschau der Bilder-Ansicht wieder raus, sobald man sie verlässt.
        if (edit) await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2, attachments: [] });
        else await interaction.update({ ...view, flags: MessageFlags.IsComponentsV2, attachments: [] });
    }

    private Notice(title: string, text: string) {
        return new ComponentV2Builder({ accentColor: "Red" }).title(title).separator().text(text).toMessage();
    }

    private async Fail(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        text: string
    ): Promise<void> {
        const message = this.Notice("🗄️ | Datenbank nicht erreichbar", text);

        const send =
            interaction.deferred || interaction.replied
                ? interaction.editReply(message)
                : interaction.reply({ ...message, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        await send.catch(() => {});
    }
}

import {
    ChannelType,
    Events,
    Interaction,
    LabelBuilder,
    MessageComponentInteraction,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    TextChannel,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { BuildTicketPanel } from "../../builder/TicketMessage";
import { ActiveCategory, RenderSetup, SETUP_PREFIX, SetupStates } from "../../builder/TicketSetupPanel";
import { ISetupState, SetupView } from "../../interfaces/services/ticket/ITicketPanel";
import { ITicketCategory } from "../../interfaces/services/ticket/ITicketConfig";
import ITicketBlacklist from "../../interfaces/services/ticket/ITicketBlacklist";
import TicketMode from "../../enums/TicketMode";
import LogType from "../../enums/LogType";
import {
    Clamp,
    DefaultCategory,
    IsPriority,
    MAX_CATEGORIES,
    MAX_OPEN_TICKETS,
    MAX_PANEL_MESSAGE,
    MAX_PANEL_TITLE,
    MissingPieces,
    HEX,
} from "../../constants/Ticket";
import logger from "../../utils/logger";

interface IField {
    id: string;
    label: string;
    value: string;
    description?: string;
    max?: number;
    required?: boolean;
    paragraph?: boolean;
}

const VIEWS: SetupView[] = ["home", "channels", "roles", "categories", "panel", "limits", "blacklist"];

export default class TicketSetupHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bedient das Ticket-Setup",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        const component = interaction.isMessageComponent();
        if (!component && !interaction.isModalSubmit()) return;
        if (!interaction.customId.startsWith(SETUP_PREFIX)) return;

        try {
            if (interaction.isModalSubmit()) await this.Modal(interaction);
            else await this.Component(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Ticket-Setup: ${interaction.customId}`);
        }
    }

    private async Component(interaction: MessageComponentInteraction): Promise<void> {
        const state = SetupStates.get(interaction.message.id);

        if (!state) {
            await interaction.update(this.Notice("⌛ | Panel abgelaufen", "Öffne das Setup mit `/setup` erneut."));

            return;
        }

        const action = interaction.customId.slice(SETUP_PREFIX.length + 1);
        state.notice = null;

        if (interaction.isAnySelectMenu()) return this.Selected(interaction, state, action);
        if (!interaction.isButton()) return;

        // Modals müssen vor jedem Update geöffnet werden.
        if (action === "editpanel" || action === "editimage" || action === "editlimits" || action === "editcategory") {
            return this.Editor(interaction, state, action);
        }

        if (action.startsWith("pick:")) {
            state.picking = action.slice(5);
            state.kind = null;
            state.view = "channels";

            return this.Apply(interaction, state);
        }

        if (action.startsWith("gallery:")) {
            state.image = action.slice(8) === "thumbnail" ? "thumbnail" : "panel";
            state.view = "gallery";

            return this.Apply(interaction, state);
        }

        if (VIEWS.includes(action as SetupView)) {
            state.view = action as SetupView;
            state.picking = null;
            state.kind = null;
            state.image = null;

            if (action === "categories") state.draft = null;

            return this.Apply(interaction, state);
        }

        switch (action) {
            case "save":
                return this.Save(interaction, state);

            case "reload":
                return this.Reload(interaction, state);

            case "publish":
                return this.Publish(interaction, state);

            case "preview":
                return this.Preview(interaction, state);

            case "toggle":
                this.Change(state, () => {
                    state.config.enabled = !state.config.enabled;
                });
                break;

            case "clearpick":
                this.ClearPick(state);
                break;

            case "newcategory":
                return this.NewCategory(interaction, state);

            case "delcategory":
                this.DeleteCategory(state);
                break;

            case "emojiprev":
                state.emojiPage = Math.max(0, state.emojiPage - 1);
                break;

            case "emojinext":
                state.emojiPage += 1;
                break;

            case "clearimage":
                this.Change(state, () => {
                    if (state.image === "thumbnail") state.config.panelThumbnail = null;
                    else state.config.panelImage = null;
                });
                state.notice = "🗑️ Bild entfernt.";
                break;

            default:
                break;
        }

        await this.Apply(interaction, state);
    }

    private async Selected(
        interaction: MessageComponentInteraction,
        state: ISetupState,
        action: string
    ): Promise<void> {
        if (!interaction.isAnySelectMenu()) return;

        const value = interaction.values[0];

        switch (action) {
            case "mode":
                this.Change(state, () => {
                    state.config.mode = value === TicketMode.CATEGORY ? TicketMode.CATEGORY : TicketMode.FORUM;
                });
                break;

            case "kind":
                state.kind = value === "thread" ? "thread" : "text";
                break;

            case "channel":
                this.SetChannel(state, value);
                break;

            case "addrole":
                this.Change(state, () => {
                    if (!state.config.supportRoleIds.includes(value)) state.config.supportRoleIds.push(value);
                });
                break;

            case "delrole":
                this.Change(state, () => {
                    state.config.supportRoleIds = state.config.supportRoleIds.filter((roleId) => roleId !== value);
                });
                break;

            case "category":
                state.categoryIndex = Number(value);
                state.draft = null;
                state.view = "category";
                break;

            case "priority":
                this.Change(state, () => {
                    const category = ActiveCategory(state);
                    if (category && IsPriority(value)) category.priority = value;
                });
                break;

            case "categoryrole":
                this.Change(state, () => {
                    const category = ActiveCategory(state);
                    if (category) category.roleId = value;
                });
                break;

            case "emoji":
                this.Change(state, () => {
                    const category = ActiveCategory(state);
                    const emoji = this.client.guilds.cache.get(state.guildId)?.emojis.cache.get(value);

                    if (category && emoji) category.emoji = emoji.toString();
                });
                break;

            case "image":
                return this.SetImage(interaction, state, value);

            case "unblock":
                return this.Unblock(interaction, state, value);

            default:
                break;
        }

        await this.Apply(interaction, state);
    }

    // ── Modals ─────────────────────────────────────────────────────────────

    private async Modal(interaction: ModalSubmitInteraction): Promise<void> {
        const parts = interaction.customId.split(":");
        const kind = parts[3];
        const state = SetupStates.get(parts[4]);

        if (!state) {
            await interaction.reply({
                ...this.Notice("⌛ | Panel abgelaufen", "Öffne das Setup mit `/setup` erneut."),
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
        }

        const read = (id: string) => interaction.fields.getTextInputValue(id).trim();

        this.Change(state, () => {
            if (kind === "panel") {
                state.config.panelTitle = read("title").slice(0, MAX_PANEL_TITLE) || state.config.panelTitle;
                state.config.panelMessage = read("message").slice(0, MAX_PANEL_MESSAGE) || state.config.panelMessage;
            }

            if (kind === "image") {
                const color = read("accent").toUpperCase();

                state.config.panelImage = read("image") || null;
                state.config.panelThumbnail = read("thumbnail") || null;
                if (HEX.test(color)) state.config.accent = color;
                else if (read("accent")) state.notice = "⚠️ Die Farbe muss wie `#5865F2` aussehen — ignoriert.";
            }

            if (kind === "limits") {
                state.config.maxOpenTickets = Clamp(Number(read("max")), 0, MAX_OPEN_TICKETS);
                state.config.supportHours = read("hours").slice(0, 100) || null;
            }

            if (kind === "category") {
                const category = ActiveCategory(state);
                if (!category) return;

                const name = read("name").slice(0, 60);

                // Der Name ist der Schlüssel zur Kategorie: Tickets speichern ihn als Text.
                // Ein Duplikat würde die Zuordnung mehrdeutig machen.
                const clash = state.config.categories.some(
                    (entry) => entry !== category && entry.name.toLowerCase() === name.toLowerCase()
                );

                if (!name) state.notice = "⚠️ Ohne Namen geht es nicht.";
                else if (clash) state.notice = `⚠️ Es gibt bereits eine Kategorie **${name}**.`;
                else category.name = name;

                category.description = read("description").slice(0, 100) || category.description;
                category.emoji = read("emoji").slice(0, 64) || category.emoji;
            }
        });

        await this.Apply(interaction, state);
    }

    private async Editor(
        interaction: MessageComponentInteraction,
        state: ISetupState,
        action: string
    ): Promise<void> {
        if (!interaction.isButton()) return;

        const { config } = state;

        if (action === "editpanel") {
            return this.Show(interaction, "panel", "Panel-Text", [
                { id: "title", label: "Titel", value: config.panelTitle, max: MAX_PANEL_TITLE },
                {
                    id: "message",
                    label: "Nachricht",
                    value: config.panelMessage,
                    max: MAX_PANEL_MESSAGE,
                    paragraph: true,
                },
            ]);
        }

        if (action === "editimage") {
            return this.Show(interaction, "image", "Bilder & Farbe", [
                {
                    id: "image",
                    label: "Bild-URL",
                    value: config.panelImage ?? "",
                    description: "Steht unter dem Text — leer lassen entfernt es",
                    max: 255,
                    required: false,
                },
                {
                    id: "thumbnail",
                    label: "Thumbnail-URL",
                    value: config.panelThumbnail ?? "",
                    description: "Kleines Bild neben dem Text",
                    max: 255,
                    required: false,
                },
                { id: "accent", label: "Akzentfarbe (#RRGGBB)", value: config.accent, max: 7, required: false },
            ]);
        }

        if (action === "editlimits") {
            return this.Show(interaction, "limits", "Limits", [
                {
                    id: "max",
                    label: "Offene Tickets pro Person",
                    value: String(config.maxOpenTickets),
                    description: "0 bedeutet unbegrenzt",
                    max: 2,
                },
                {
                    id: "hours",
                    label: "Support-Zeiten",
                    value: config.supportHours ?? "",
                    description: "Reiner Text, z.B. Mo–Fr 18–22 Uhr",
                    max: 100,
                    required: false,
                },
            ]);
        }

        const category = ActiveCategory(state);
        if (!category) return;

        await this.Show(interaction, "category", "Kategorie bearbeiten", [
            { id: "name", label: "Name", value: category.name, max: 60 },
            { id: "description", label: "Beschreibung", value: category.description, max: 100 },
            { id: "emoji", label: "Emoji", value: category.emoji, max: 64, required: false },
        ]);
    }

    private async Show(
        interaction: MessageComponentInteraction,
        kind: string,
        title: string,
        fields: IField[]
    ): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId(`${SETUP_PREFIX}:modal:${kind}:${interaction.message.id}`)
            .setTitle(title.slice(0, 45));

        modal.addLabelComponents(
            ...fields.map((field) => {
                const input = new TextInputBuilder()
                    .setCustomId(field.id)
                    .setStyle(field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
                    .setRequired(field.required !== false)
                    .setMaxLength(field.max ?? 100);

                if (field.value) input.setValue(field.value);

                const label = new LabelBuilder().setLabel(field.label.slice(0, 45)).setTextInputComponent(input);

                return field.description ? label.setDescription(field.description.slice(0, 100)) : label;
            })
        );

        await interaction.showModal(modal);
    }

    // ── Aktionen ───────────────────────────────────────────────────────────

    private SetChannel(state: ISetupState, channelId: string): void {
        const target = state.picking;
        if (!target) return;

        this.Change(state, () => {
            if (target === "container") {
                if (state.config.mode === TicketMode.FORUM) state.config.forumChannelId = channelId;
                else state.config.categoryChannelId = channelId;
            }

            if (target === "panel") state.config.panelChannelId = channelId;
            if (target === "waitroom") state.config.waitroomChannelId = channelId;
        });

        state.picking = null;
        state.kind = null;
        state.notice = `📦 Kanal auf <#${channelId}> gesetzt.`;
    }

    private ClearPick(state: ISetupState): void {
        const target = state.picking;
        if (!target) return;

        this.Change(state, () => {
            if (target === "container") {
                if (state.config.mode === TicketMode.FORUM) state.config.forumChannelId = null;
                else state.config.categoryChannelId = null;
            }

            if (target === "panel") state.config.panelChannelId = null;
            if (target === "waitroom") state.config.waitroomChannelId = null;
        });

        state.picking = null;
        state.kind = null;
        state.notice = "🗑️ Kanal entfernt.";
    }

    private async SetImage(
        interaction: MessageComponentInteraction,
        state: ISetupState,
        imageId: string
    ): Promise<void> {
        const image = await this.client.galleryService.GetImage(imageId);

        if (!image) {
            state.notice = "⚠️ Dieses Bild gibt es nicht mehr.";

            return this.Apply(interaction, state);
        }

        this.Change(state, () => {
            if (state.image === "thumbnail") state.config.panelThumbnail = image.url;
            else state.config.panelImage = image.url;
        });

        state.view = "panel";
        state.image = null;
        state.notice = `🖼️ \`${image.file}\` übernommen.`;

        await this.Apply(interaction, state);
    }

    private async NewCategory(interaction: MessageComponentInteraction, state: ISetupState): Promise<void> {
        if (state.config.categories.length >= MAX_CATEGORIES) {
            state.notice = `⚠️ Mehr als ${MAX_CATEGORIES} Kategorien gehen nicht.`;

            return this.Apply(interaction, state);
        }

        const names = new Set(state.config.categories.map((entry) => entry.name.toLowerCase()));

        let index = state.config.categories.length + 1;
        while (names.has(`kategorie ${index}`)) index++;

        const category: ITicketCategory = DefaultCategory(`Kategorie ${index}`);

        this.Change(state, () => {
            state.config.categories.push(category);
        });

        state.categoryIndex = state.config.categories.length - 1;
        state.draft = null;
        state.view = "category";
        state.notice = "➕ Kategorie angelegt — jetzt Namen und Text anpassen.";

        await this.Apply(interaction, state);
    }

    private DeleteCategory(state: ISetupState): void {
        const category = ActiveCategory(state);
        if (!category) return;

        this.Change(state, () => {
            state.config.categories = state.config.categories.filter((entry) => entry !== category);
        });

        state.categoryIndex = -1;
        state.draft = null;
        state.view = "categories";
        state.notice = `🗑️ **${category.name}** entfernt.`;
    }

    private async Save(interaction: MessageComponentInteraction, state: ISetupState): Promise<void> {
        await this.client.ticketService.SaveConfig(state.config);

        state.dirty = false;
        state.notice = "💾 Gespeichert.";

        // Ein bereits gesendetes Panel wird mitgezogen, sonst zeigt es alte Kategorien.
        await this.Republish(state);

        await this.Apply(interaction, state);
    }

    private async Reload(interaction: MessageComponentInteraction, state: ISetupState): Promise<void> {
        const log = await this.client.loggingService.Target(state.guildId, LogType.TICKET);

        state.config = await this.client.ticketService.Config(state.guildId);
        state.logChannelId = log?.channelId ?? null;
        state.dirty = false;
        state.draft = null;
        state.picking = null;
        state.kind = null;
        state.image = null;
        state.view = "home";

        await this.Apply(interaction, state);
    }

    private async Preview(interaction: MessageComponentInteraction, state: ISetupState): Promise<void> {
        const panel = BuildTicketPanel(state.config);

        await interaction.reply({
            components: panel.components ?? [],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    private async Publish(interaction: MessageComponentInteraction, state: ISetupState): Promise<void> {
        await interaction.deferUpdate();

        const missing = MissingPieces(state.config);

        if (missing.length > 0) {
            state.notice = `⚠️ Es fehlt noch: ${missing.join(", ")}.`;

            return this.Refresh(interaction, state);
        }

        if (state.dirty) await this.client.ticketService.SaveConfig(state.config);

        const sent = await this.Send(state);

        state.dirty = false;
        state.notice = sent
            ? `🚀 Panel steht in <#${state.config.panelChannelId}>.`
            : "⚠️ Das Panel ging nicht raus. Darf der Bot in dem Kanal schreiben?";

        await this.Refresh(interaction, state);
    }

    // Sendet das Panel neu und merkt sich die Nachricht, damit ein späteres Speichern
    // dieselbe Nachricht bearbeiten kann statt eine zweite zu hinterlassen.
    private async Send(state: ISetupState): Promise<boolean> {
        const { config } = state;
        if (!config.panelChannelId) return false;

        const channel = await this.client.channels.fetch(config.panelChannelId).catch(() => null);
        if (!channel?.isTextBased() || channel.isDMBased()) return false;

        if (config.panelMessageId) {
            const old = await (channel as TextChannel).messages.fetch(config.panelMessageId).catch(() => null);

            await old?.delete().catch(() => null);
        }

        const message = await (channel as TextChannel).send(BuildTicketPanel(config)).catch((error) => {
            logger.warn(`[Ticket] Panel konnte nicht gesendet werden: ${error}`);

            return null;
        });

        if (!message) return false;

        config.panelMessageId = message.id;
        await this.client.ticketService.SaveConfig(config);

        return true;
    }

    private async Republish(state: ISetupState): Promise<void> {
        const { config } = state;
        if (!config.panelMessageId || !config.panelChannelId) return;

        const channel = await this.client.channels.fetch(config.panelChannelId).catch(() => null);
        if (!channel?.isTextBased() || channel.isDMBased()) return;

        const message = await (channel as TextChannel).messages.fetch(config.panelMessageId).catch(() => null);
        if (!message?.editable) return;

        const panel = BuildTicketPanel(config);

        await message
            .edit({ components: panel.components ?? [], flags: MessageFlags.IsComponentsV2 })
            .catch(() => null);
    }

    private async Unblock(
        interaction: MessageComponentInteraction,
        state: ISetupState,
        userId: string
    ): Promise<void> {
        const removed = await this.client.database
            .GetRepository<ITicketBlacklist>("TicketBlacklist")
            .Delete({ guildId: state.guildId, userId })
            .catch(() => 0);

        state.notice = removed > 0 ? `🔓 <@${userId}> darf wieder Tickets öffnen.` : "ℹ️ Dieser Nutzer war nicht gesperrt.";

        await this.Apply(interaction, state);
    }

    // ── Hilfen ─────────────────────────────────────────────────────────────

    private Change(state: ISetupState, mutate: () => void): void {
        mutate();
        state.dirty = true;
    }

    private async Apply(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        state: ISetupState
    ): Promise<void> {
        const view = await RenderSetup(this.client, state);

        if (interaction.isModalSubmit() || interaction.deferred || interaction.replied) {
            await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });

            return;
        }

        await interaction.update({ ...view, flags: MessageFlags.IsComponentsV2 });
    }

    private async Refresh(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        state: ISetupState
    ): Promise<void> {
        const view = await RenderSetup(this.client, state);

        await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });
    }

    private Notice(title: string, message: string) {
        const builder = new ComponentV2Builder({ accentColor: "#ED4245" }).title(title).separator().text(message);

        return { components: [builder.build()], flags: MessageFlags.IsComponentsV2 as const };
    }
}

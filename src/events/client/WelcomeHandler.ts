import {
    AnySelectMenuInteraction,
    ButtonInteraction,
    Events,
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
import { ActiveLayer, PANEL_PREFIX, PanelStates, RenderPanel } from "../../builder/WelcomePanel";
import BuildWelcome from "../../builder/WelcomeMessage";
import { IWelcomeState } from "../../interfaces/services/welcome/IWelcomePanel";
import { ITextLayer, WelcomeLayer } from "../../interfaces/services/welcome/IWelcomeLayer";
import {
    CONFIG_KEY,
    ClampNumber,
    DefaultConfig,
    IsHex,
    MAX_CARD_SIZE,
    MAX_FONT_SIZE,
    MAX_MESSAGE_LENGTH,
    MAX_TEXT_LENGTH,
    MIN_CARD_SIZE,
    MIN_FONT_SIZE,
    NormalizeMode,
} from "../../constants/Welcome";
import { SanitizeName } from "../../constants/Gallery";
import logger from "../../utils/logger";

const UPLOAD_TIMEOUT = 90_000;
const LINKS = /https:\/\/\S+/g;

interface IField {
    id: string;
    label: string;
    value: string | number;
    description?: string;
    max?: number;
}

export default class WelcomeHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bedient das Welcome-Setup (Buttons, Selects, Modals)",
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

            await this.client.guardian.ReportError(normalized, interaction, `Welcome Error: ${interaction.customId}`);
        }
    }

    private async Component(interaction: MessageComponentInteraction): Promise<void> {
        const state = PanelStates.get(interaction.message.id);

        if (!state) {
            await interaction.update(this.Notice("⌛ | Panel abgelaufen", "Öffne das Setup mit `/welcome` erneut."));

            return;
        }

        const action = interaction.customId.slice(PANEL_PREFIX.length + 1);
        state.notice = null;

        if (interaction.isAnySelectMenu()) return this.Selected(interaction, state, action);
        if (!interaction.isButton()) return;

        const layer = ActiveLayer(state);

        switch (action) {
            case "home":
            case "card":
            case "layers":
            case "message":
                state.view = action;
                break;

            case "back":
                state.view = state.target === "background" ? "card" : "layer";
                state.target = null;
                state.category = null;
                break;

            case "refresh":
                break;

            case "toggle":
                state.config.enabled = !state.config.enabled;
                state.dirty = true;
                break;

            case "save":
                return this.Save(interaction, state);

            case "discard":
                return this.Discard(interaction, state);

            case "reset":
                return this.Reset(interaction, state);

            case "test":
                return this.Test(interaction, state);

            case "nogradient":
                state.config.card.gradient = null;
                state.dirty = true;
                break;

            case "bgclear":
                state.config.card.background = null;
                state.dirty = true;
                break;

            case "bgupload":
                state.target = "background";
                state.view = "category";
                break;

            case "bgpick":
                state.target = "background";
                state.view = "image";
                break;

            case "imgupload":
                state.target = "layer";
                state.view = "category";
                break;

            case "imgpick":
                state.target = "layer";
                state.view = "image";
                break;

            case "newcategory":
                return this.AskCategory(interaction);

            case "removelayer":
                if (layer && this.client.welcomeService.RemoveLayer(state.config.card, layer.id)) {
                    state.notice = `🗑️ Ebene \`${layer.name}\` gelöscht.`;
                    state.layerId = null;
                    state.view = "layers";
                    state.dirty = true;
                }
                break;

            case "up":
            case "down":
                if (layer && this.client.welcomeService.MoveLayer(state.config.card, layer.id, action === "up" ? 1 : -1)) {
                    state.dirty = true;
                }
                break;

            case "hide":
                if (layer) {
                    layer.hidden = !layer.hidden;
                    state.dirty = true;
                }
                break;

            case "bold":
            case "italic":
                if (layer?.type === "text") {
                    layer[action] = !layer[action];
                    state.dirty = true;
                }
                break;

            case "placeholders":
                return this.Placeholders(interaction, state);

            default:
                return this.Prompt(interaction, state, action, layer);
        }

        await this.Apply(interaction, state);
    }

    private async Selected(
        interaction: AnySelectMenuInteraction,
        state: IWelcomeState,
        action: string
    ): Promise<void> {
        const value = interaction.values[0];
        const layer = ActiveLayer(state);
        const { card } = state.config;

        if (action === "channel") {
            state.config.channelId = value;
            state.dirty = true;

            return this.Apply(interaction, state);
        }

        if (action === "layer") {
            state.layerId = value;
            state.view = "layer";

            return this.Apply(interaction, state);
        }

        if (action === "addlayer") {
            const added = this.client.welcomeService.AddLayer(card, value as WelcomeLayer["type"]);

            state.layerId = added.id;
            state.view = "layer";
            state.notice = `➕ Ebene \`${added.name}\` angelegt.`;
            state.dirty = true;

            return this.Apply(interaction, state);
        }

        if (action === "category") {
            state.category = value;

            return this.Upload(interaction as unknown as ButtonInteraction, state);
        }

        if (action === "image") {
            return this.UseImage(interaction, state, value);
        }

        if (action === "preset") {
            const [width, height] = value.split("x").map(Number);

            card.width = ClampNumber(width, MIN_CARD_SIZE, MAX_CARD_SIZE);
            card.height = ClampNumber(height, MIN_CARD_SIZE, MAX_CARD_SIZE);
        }

        if (action === "mode") state.config.mode = NormalizeMode(value);
        if (action === "accent") state.config.accent = value;
        if (action === "fit") card.fit = value as typeof card.fit;
        if (action === "cardcolor") card.color = value;
        if (action === "cardgradient") card.gradient = value;
        if (action === "anchor" && layer) layer.anchor = value as WelcomeLayer["anchor"];

        if (layer?.type === "text") {
            if (action === "font") layer.font = this.client.welcomeService.HasFont(value) ? value : layer.font;
            if (action === "textcolor") layer.color = value;
            if (action === "effect") layer.effect = value as ITextLayer["effect"];
            if (action === "align") layer.align = value as ITextLayer["align"];
        }

        if (layer?.type === "avatar") {
            if (action === "avatarshape") layer.shape = value as typeof layer.shape;
            if (action === "bordercolor") layer.borderColor = value;
        }

        if (layer?.type === "shape") {
            if (action === "shapekind") layer.shape = value as typeof layer.shape;
            if (action === "shapecolor") layer.color = value;
        }

        state.dirty = true;

        await this.Apply(interaction, state);
    }

    private async Save(interaction: ButtonInteraction, state: IWelcomeState): Promise<void> {
        if (state.config.enabled && !state.config.channelId) {
            state.notice = "⚠️ Ohne Kanal kann nichts verschickt werden — wähle oben einen aus.";

            return this.Apply(interaction, state);
        }

        await this.client.welcomeService.Save(state.config);

        state.dirty = false;
        state.notice = "💾 Gespeichert.";

        await this.Apply(interaction, state);
    }

    private async Discard(interaction: ButtonInteraction, state: IWelcomeState): Promise<void> {
        state.config = await this.client.welcomeService.Get(state.guildId);
        state.dirty = false;
        state.layerId = null;
        state.notice = "↩️ Änderungen verworfen.";

        await this.Apply(interaction, state);
    }

    private async Reset(interaction: ButtonInteraction, state: IWelcomeState): Promise<void> {
        await this.client.welcomeService.Reset(state.guildId);

        state.config = DefaultConfig(state.guildId);
        state.layerId = null;
        state.view = "home";
        state.dirty = false;
        state.notice = "🗑️ Auf die Standardkarte zurückgesetzt.";

        await this.Apply(interaction, state);
    }

    private async Test(interaction: ButtonInteraction, state: IWelcomeState): Promise<void> {
        const member = interaction.guild?.members.cache.get(interaction.user.id);

        if (!member) {
            state.notice = "❌ Für den Testlauf fehlt dein Mitglieds-Eintrag.";

            return this.Apply(interaction, state);
        }

        const context = this.client.welcomeService.Context(member);
        const { components, files, componentsV2 } = await BuildWelcome(this.client, state.config, context);

        if (!componentsV2) {
            await interaction.reply({ files, flags: MessageFlags.Ephemeral });

            return;
        }

        await interaction.reply({
            components,
            files,
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    private async UseImage(
        interaction: AnySelectMenuInteraction,
        state: IWelcomeState,
        id: string
    ): Promise<void> {
        const layer = ActiveLayer(state);

        if (state.target === "background") {
            state.config.card.background = id;
            state.view = "card";
        } else if (layer?.type === "image") {
            layer.image = id;
            state.view = "layer";
        }

        state.target = null;
        state.dirty = true;
        state.notice = "🖼️ Bild übernommen.";

        await this.Apply(interaction, state);
    }

    private async Upload(interaction: ButtonInteraction, state: IWelcomeState): Promise<void> {
        const channel = interaction.channel;

        if (!channel?.isTextBased() || channel.isDMBased() || !state.category) {
            state.notice = "❌ Uploads gehen nur in einem Server-Textkanal.";

            return this.Apply(interaction, state);
        }

        const deadline = Math.floor((Date.now() + UPLOAD_TIMEOUT) / 1000);

        state.notice = `⏳ Poste jetzt ein Bild oder einen Link in diesen Kanal. Läuft ab <t:${deadline}:R>`;

        await this.Apply(interaction, state);

        const collected = await channel
            .awaitMessages({
                filter: (message) =>
                    message.author.id === interaction.user.id &&
                    (message.attachments.size > 0 || (message.content.match(LINKS)?.length ?? 0) > 0),
                max: 1,
                time: UPLOAD_TIMEOUT,
                errors: ["time"],
            })
            .catch(() => null);

        const message = collected?.first();

        if (!message) {
            state.notice = "⌛ Zeitfenster abgelaufen — es wurde nichts hochgeladen.";

            return this.Apply(interaction, state, true);
        }

        const source = message.attachments.first()?.url ?? message.content.match(LINKS)?.[0];
        const name = message.attachments.first()?.name;

        await message.delete().catch(() => {});

        try {
            const image = await this.client.galleryService.AddImage(
                { guildId: state.guildId, category: state.category, subcategory: null },
                source!,
                name ?? undefined
            );

            const layer = ActiveLayer(state);

            if (state.target === "background") {
                state.config.card.background = image.id;
                state.view = "card";
            } else if (layer?.type === "image") {
                layer.image = image.id;
                state.view = "layer";
            }

            state.dirty = true;
            state.notice = `✅ \`${image.file}\` gespeichert und übernommen.`;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);

            state.notice = `❌ ${reason}`;
            state.view = state.target === "background" ? "card" : "layer";

            logger.debug(`[WelcomeHandler] Upload fehlgeschlagen: ${reason}`);
        }

        state.target = null;
        state.category = null;

        await this.Apply(interaction, state, true);
    }

    private async Placeholders(interaction: ButtonInteraction, state: IWelcomeState): Promise<void> {
        const options = this.client.configService.Options(CONFIG_KEY, "placeholders");

        await interaction.reply(
            new ComponentV2Builder({ accentColor: state.config.accent as never })
                .title("🔣 | Platzhalter")
                .separator()
                .list(options.map((option) => `\`${option.value}\` — ${option.description}`))
                .toMessage({ ephemeral: true })
        );
    }

    private async AskCategory(interaction: ButtonInteraction): Promise<void> {
        await this.Show(interaction, "newcategory", "Neue Kategorie", [
            { id: "name", label: "Name der Kategorie", value: "", description: "Buchstaben, Zahlen, - und _", max: 32 },
        ]);
    }

    // Alles Zahlen- und Textartige läuft über dieselbe Modal-Mechanik.
    private async Prompt(
        interaction: ButtonInteraction,
        state: IWelcomeState,
        action: string,
        layer: WelcomeLayer | null
    ): Promise<void> {
        const { card } = state.config;

        if (action === "cardnumbers") {
            return this.Show(interaction, action, "Kartenwerte", [
                { id: "width", label: "Breite in px", value: card.width },
                { id: "height", label: "Höhe in px", value: card.height },
                { id: "radius", label: "Ecken-Radius in px", value: card.radius },
                { id: "overlay", label: "Abdunklung in Prozent", value: card.overlay },
            ]);
        }

        if (action === "edittitle") {
            return this.Show(interaction, action, "Titel ändern", [
                { id: "title", label: "Titel", value: state.config.title, max: 100 },
            ]);
        }

        if (action === "editmessage") {
            return this.Show(interaction, action, "Nachricht ändern", [
                {
                    id: "message",
                    label: "Text",
                    value: state.config.message,
                    description: "Platzhalter wie {user} sind erlaubt",
                    max: MAX_MESSAGE_LENGTH,
                },
            ]);
        }

        if (!layer) return this.Apply(interaction, state);

        if (action === "position") {
            return this.Show(interaction, action, "Position", [
                { id: "offsetX", label: "Versatz X in px", value: layer.offsetX },
                { id: "offsetY", label: "Versatz Y in px", value: layer.offsetY },
                { id: "opacity", label: "Deckkraft in Prozent", value: layer.opacity },
            ]);
        }

        if (action === "rename") {
            return this.Show(interaction, action, "Ebene umbenennen", [
                { id: "name", label: "Name", value: layer.name, max: 40 },
            ]);
        }

        if (action === "edittext" && layer.type === "text") {
            return this.Show(interaction, action, "Text ändern", [
                {
                    id: "text",
                    label: "Text",
                    value: layer.text,
                    description: "Platzhalter wie {displayname} sind erlaubt",
                    max: MAX_TEXT_LENGTH,
                },
                { id: "effectColor", label: "Effektfarbe als Hex", value: layer.effectColor, max: 7 },
            ]);
        }

        if (action === "textnumbers" && layer.type === "text") {
            return this.Show(interaction, action, "Schriftwerte", [
                { id: "size", label: "Schriftgrösse in px", value: layer.size },
                { id: "maxWidth", label: "Umbruchbreite in px (0 = nie)", value: layer.maxWidth },
            ]);
        }

        if (action === "avatarnumbers" && layer.type === "avatar") {
            return this.Show(interaction, action, "Avatarwerte", [
                { id: "size", label: "Grösse in px", value: layer.size },
                { id: "border", label: "Rahmenstärke in px", value: layer.border },
            ]);
        }

        if (action === "imgnumbers" && layer.type === "image") {
            return this.Show(interaction, action, "Bildwerte", [
                { id: "width", label: "Breite in px", value: layer.width },
                { id: "height", label: "Höhe in px", value: layer.height },
                { id: "radius", label: "Ecken-Radius in px", value: layer.radius },
            ]);
        }

        if (action === "shapenumbers" && layer.type === "shape") {
            return this.Show(interaction, action, "Formwerte", [
                { id: "width", label: "Breite in px", value: layer.width },
                { id: "height", label: "Höhe in px", value: layer.height },
                { id: "radius", label: "Ecken-Radius in px", value: layer.radius },
            ]);
        }

        await this.Apply(interaction, state);
    }

    private async Show(
        interaction: ButtonInteraction,
        kind: string,
        title: string,
        fields: IField[]
    ): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId(`${PANEL_PREFIX}:modal:${kind}:${interaction.message.id}`)
            .setTitle(title.slice(0, 45));

        modal.addLabelComponents(
            ...fields.map((field) => {
                const input = new TextInputBuilder()
                    .setCustomId(field.id)
                    .setStyle(field.max && field.max > 100 ? TextInputStyle.Paragraph : TextInputStyle.Short)
                    .setRequired(true)
                    .setValue(String(field.value))
                    .setMaxLength(field.max ?? 8);

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
                ...this.Notice("⌛ | Panel abgelaufen", "Öffne das Setup mit `/welcome` erneut."),
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
        }

        const read = (id: string) => interaction.fields.getTextInputValue(id).trim();
        const number = (id: string) => Number(read(id).replace(",", "."));

        const layer = ActiveLayer(state);
        const { card } = state.config;

        state.notice = null;

        if (kind === "newcategory") {
            const name = SanitizeName(read("name"));

            if (!name) {
                state.notice = "⚠️ Ungültiger Name — erlaubt sind Buchstaben, Zahlen, `-` und `_`.";
            } else {
                await this.client.galleryService.CreateCategory({ guildId: state.guildId, category: name });

                state.category = name;
                state.notice = `📁 Kategorie \`${name}\` wird verwendet.`;
            }
        }

        if (kind === "cardnumbers") {
            card.width = ClampNumber(number("width"), MIN_CARD_SIZE, MAX_CARD_SIZE);
            card.height = ClampNumber(number("height"), MIN_CARD_SIZE, MAX_CARD_SIZE);
            card.radius = ClampNumber(number("radius"), 0, 200);
            card.overlay = ClampNumber(number("overlay"), 0, 100);
            state.dirty = true;
        }

        if (kind === "edittitle") {
            state.config.title = read("title").slice(0, 100) || state.config.title;
            state.dirty = true;
        }

        if (kind === "editmessage") {
            state.config.message = read("message").slice(0, MAX_MESSAGE_LENGTH) || state.config.message;
            state.dirty = true;
        }

        if (layer) {
            if (kind === "position") {
                layer.offsetX = ClampNumber(number("offsetX"), -MAX_CARD_SIZE, MAX_CARD_SIZE);
                layer.offsetY = ClampNumber(number("offsetY"), -MAX_CARD_SIZE, MAX_CARD_SIZE);
                layer.opacity = ClampNumber(number("opacity"), 0, 100);
                state.dirty = true;
            }

            if (kind === "rename") {
                layer.name = read("name").slice(0, 40) || layer.name;
                state.dirty = true;
            }

            if (kind === "edittext" && layer.type === "text") {
                layer.text = read("text").slice(0, MAX_TEXT_LENGTH) || layer.text;

                const color = read("effectColor").toUpperCase();

                if (IsHex(color)) layer.effectColor = color;
                else state.notice = "⚠️ Die Effektfarbe braucht das Format `#RRGGBB` — alte Farbe behalten.";

                state.dirty = true;
            }

            if (kind === "textnumbers" && layer.type === "text") {
                layer.size = ClampNumber(number("size"), MIN_FONT_SIZE, MAX_FONT_SIZE);
                layer.maxWidth = ClampNumber(number("maxWidth"), 0, MAX_CARD_SIZE);
                state.dirty = true;
            }

            if (kind === "avatarnumbers" && layer.type === "avatar") {
                layer.size = ClampNumber(number("size"), 16, MAX_CARD_SIZE);
                layer.border = ClampNumber(number("border"), 0, 40);
                state.dirty = true;
            }

            if ((kind === "imgnumbers" && layer.type === "image") || (kind === "shapenumbers" && layer.type === "shape")) {
                layer.width = ClampNumber(number("width"), 1, MAX_CARD_SIZE);
                layer.height = ClampNumber(number("height"), 1, MAX_CARD_SIZE);
                layer.radius = ClampNumber(number("radius"), 0, MAX_CARD_SIZE);
                state.dirty = true;
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

    private async Apply(
        interaction: MessageComponentInteraction,
        state: IWelcomeState,
        edit = false
    ): Promise<void> {
        PanelStates.set(interaction.message.id, state);

        const view = await RenderPanel(this.client, state);

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

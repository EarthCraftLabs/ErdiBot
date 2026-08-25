import { ChannelType, ColorResolvable } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "./ComponentV2Builder";
import { ISelectEntryOptions } from "../interfaces/builder/IComponentV2Builder";
import { IWelcomePanelView, IWelcomeState } from "../interfaces/services/welcome/IWelcomePanel";
import IWelcomeConfig from "../interfaces/services/welcome/IWelcomeConfig";
import {
    IAvatarLayer,
    IImageLayer,
    IShapeLayer,
    ITextLayer,
    WelcomeLayer,
} from "../interfaces/services/welcome/IWelcomeLayer";
import { CONFIG_KEY, DefaultConfig, MAX_LAYERS } from "../constants/Welcome";
import { BACK_TO_SETUP } from "../constants/Setup";

export const PANEL_PREFIX = "welcome:panel";

export const PanelStates = new LRUCache<string, IWelcomeState>({ max: 50, ttl: 30 * 60_000 });

const PREVIEW = "attachment://welcome.png";

export function NewPanelState(guildId: string, config: IWelcomeConfig = DefaultConfig(guildId)): IWelcomeState {
    return {
        guildId,
        view: "home",
        config,
        layerId: null,
        target: null,
        category: null,
        dirty: false,
        notice: null,
    };
}

export function ActiveLayer(state: IWelcomeState): WelcomeLayer | null {
    return state.config.card.layers.find((layer) => layer.id === state.layerId) ?? null;
}

// Bewusst ohne `default`: eine vorausgewählte Option lässt sich nicht noch einmal auswählen,
// und genau das braucht man beim Bauen einer Karte ständig. Der aktuelle Wert steht im Text darüber.
function Choices(client: BotClient, field: string): ISelectEntryOptions[] {
    return client.configService.Options(CONFIG_KEY, field).map((option) => ({
        label: option.name.slice(0, 100),
        value: option.value,
        description: option.description ? option.description.slice(0, 100) : undefined,
        emoji: option.emoji || undefined,
    }));
}

function Select(
    builder: ComponentV2Builder,
    client: BotClient,
    field: string,
    action: string,
    placeholder: string
): void {
    const options = Choices(client, field);
    if (options.length === 0) return;

    builder.select({ customId: `${PANEL_PREFIX}:${action}`, placeholder, options });
}

function Head(state: IWelcomeState, title: string, subtitle?: string): ComponentV2Builder {
    const builder = new ComponentV2Builder({ accentColor: state.config.accent as ColorResolvable }).title(title, subtitle);

    if (state.notice) builder.subtext(state.notice);
    if (state.dirty) builder.subtext("✏️ Ungespeicherte Änderungen — unten auf **Speichern** drücken.");

    return builder.separator();
}

function LayerLabel(layer: WelcomeLayer): string {
    const icon = layer.type === "text" ? "🔠" : layer.type === "avatar" ? "👤" : layer.type === "image" ? "🖼️" : "⬛";

    return `${layer.hidden ? "🚫" : icon} ${layer.name}`;
}

function Home(builder: ComponentV2Builder, client: BotClient, state: IWelcomeState): void {
    const { config } = state;
    const mode = client.configService.Option(CONFIG_KEY, "modes", config.mode);

    builder.text(
        `${config.enabled ? "🟢 **Aktiv**" : "🔴 **Inaktiv**"}\n` +
            `📢 **Kanal:** ${config.channelId ? `<#${config.channelId}>` : "_noch keiner_"}\n` +
            `🧩 **Ausgabe:** ${mode?.name ?? config.mode}\n` +
            `🗂️ **Ebenen:** ${config.card.layers.length}/${MAX_LAYERS} · **Karte:** ${config.card.width}×${config.card.height}`
    );

    if (config.mode !== "container") builder.gallery(PREVIEW);

    builder.channelSelect({
        customId: `${PANEL_PREFIX}:channel`,
        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        placeholder: "📢 | Willkommens-Kanal wählen...",
    });

    Select(builder, client, "modes", "mode", "🧩 | Ausgabe wählen...");

    builder.buttons(
        { customId: `${PANEL_PREFIX}:card`, label: "Karte", emoji: "🎨", tone: "primary" },
        { customId: `${PANEL_PREFIX}:layers`, label: "Ebenen", emoji: "🗂️", tone: "primary" },
        { customId: `${PANEL_PREFIX}:message`, label: "Nachricht", emoji: "💬", tone: "primary" },
        { customId: `${PANEL_PREFIX}:toggle`, label: config.enabled ? "Deaktivieren" : "Aktivieren", emoji: "🔌" },
        { customId: `${PANEL_PREFIX}:test`, label: "Testlauf", emoji: "🚀" }
    );

    builder.buttons(
        { customId: `${PANEL_PREFIX}:save`, label: "Speichern", emoji: "💾", tone: "success", disabled: !state.dirty },
        { customId: `${PANEL_PREFIX}:discard`, label: "Verwerfen", emoji: "↩️", disabled: !state.dirty },
        { customId: `${PANEL_PREFIX}:refresh`, label: "Vorschau", emoji: "🔄" },
        { customId: `${PANEL_PREFIX}:reset`, label: "Zurücksetzen", emoji: "🗑️", tone: "danger" },
        { customId: BACK_TO_SETUP, label: "Setup", emoji: "⬅️", tone: "danger" }
    );
}

function Card(builder: ComponentV2Builder, client: BotClient, state: IWelcomeState): void {
    const { card } = state.config;

    builder.text(
        `📐 **Grösse:** ${card.width}×${card.height} · **Ecken:** ${card.radius}px\n` +
            `🎨 **Farbe:** \`${card.color}\`${card.gradient ? ` → \`${card.gradient}\`` : " _(kein Verlauf)_"}\n` +
            `🖼️ **Hintergrund:** ${card.background ? "gesetzt" : "_keiner_"} · **Abdunklung:** ${card.overlay}%`
    );

    builder.gallery(PREVIEW);

    Select(builder, client, "presets", "preset", "📐 | Kartengrösse wählen...");
    Select(builder, client, "fits", "fit", "🖼️ | Bild-Anpassung wählen...");
    Select(builder, client, "colors", "cardcolor", "🎨 | Grundfarbe wählen...");
    Select(builder, client, "colors", "cardgradient", "🌈 | Verlaufsfarbe wählen...");

    builder.buttons(
        { customId: `${PANEL_PREFIX}:bgupload`, label: "Bild hochladen", emoji: "⬆️", tone: "success" },
        { customId: `${PANEL_PREFIX}:bgpick`, label: "Aus Galerie", emoji: "🗃️" },
        { customId: `${PANEL_PREFIX}:bgclear`, label: "Bild entfernen", emoji: "🚫", disabled: !card.background },
        { customId: `${PANEL_PREFIX}:nogradient`, label: "Verlauf aus", emoji: "🚫", disabled: !card.gradient },
        { customId: `${PANEL_PREFIX}:cardnumbers`, label: "Werte…", emoji: "🔢", tone: "primary" }
    );

    builder.buttons({ customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" });
}

function Layers(builder: ComponentV2Builder, client: BotClient, state: IWelcomeState): void {
    const { layers } = state.config.card;

    builder.text(
        layers.length > 0
            ? `Von unten nach oben gezeichnet — die letzte Ebene liegt vorn.\n\n${layers
                  .map((layer, index) => `\`${index + 1}.\` ${LayerLabel(layer)}`)
                  .join("\n")}`
            : "Noch keine Ebenen. Leg unten eine an."
    );

    builder.gallery(PREVIEW);

    if (layers.length > 0) {
        builder.select({
            customId: `${PANEL_PREFIX}:layer`,
            placeholder: "🗂️ | Ebene bearbeiten...",
            options: layers.map((layer) => ({
                label: LayerLabel(layer).slice(0, 100),
                value: layer.id,
                description: `${layer.anchor} · ${layer.offsetX}/${layer.offsetY}`,
            })),
        });
    }

    if (layers.length < MAX_LAYERS) {
        Select(builder, client, "layers", "addlayer", "➕ | Ebene hinzufügen...");
    } else {
        builder.subtext(`Mehr als ${MAX_LAYERS} Ebenen gehen nicht.`);
    }

    builder.buttons({ customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" });
}

function Layer(builder: ComponentV2Builder, client: BotClient, state: IWelcomeState, layer: WelcomeLayer): void {
    const index = state.config.card.layers.findIndex((entry) => entry.id === layer.id);
    const anchor = client.configService.Option(CONFIG_KEY, "anchors", layer.anchor);

    builder.text(
        `**${LayerLabel(layer)}** · Ebene ${index + 1}/${state.config.card.layers.length}\n` +
            `📍 **Anker:** ${anchor?.name ?? layer.anchor} · **Versatz:** ${layer.offsetX}/${layer.offsetY}\n` +
            `👁️ **Deckkraft:** ${layer.opacity}%${layer.hidden ? " · _ausgeblendet_" : ""}`
    );

    builder.gallery(PREVIEW);

    if (layer.type === "text") Text(builder, client, layer);
    if (layer.type === "avatar") Avatar(builder, client, layer);
    if (layer.type === "image") ImageLayer(builder, client, layer);
    if (layer.type === "shape") Shape(builder, client, layer);

    Select(builder, client, "anchors", "anchor", "📍 | Ankerpunkt wählen...");

    builder.buttons(
        { customId: `${PANEL_PREFIX}:position`, label: "Position…", emoji: "📐", tone: "primary" },
        { customId: `${PANEL_PREFIX}:rename`, label: "Umbenennen", emoji: "🏷️" },
        { customId: `${PANEL_PREFIX}:hide`, label: layer.hidden ? "Einblenden" : "Ausblenden", emoji: "👁️" },
        { customId: `${PANEL_PREFIX}:up`, label: "Nach vorn", emoji: "🔼", disabled: index >= state.config.card.layers.length - 1 },
        { customId: `${PANEL_PREFIX}:down`, label: "Nach hinten", emoji: "🔽", disabled: index <= 0 }
    );

    builder.buttons(
        { customId: `${PANEL_PREFIX}:layers`, label: "Zur Liste", emoji: "⬅️", tone: "danger" },
        { customId: `${PANEL_PREFIX}:removelayer`, label: "Ebene löschen", emoji: "🗑️", tone: "danger" }
    );
}

function Text(builder: ComponentV2Builder, client: BotClient, layer: ITextLayer): void {
    builder.text(
        `📝 **Text:** \`${layer.text}\`\n` +
            `🔤 **Schrift:** ${layer.font} · ${layer.size}px${layer.bold ? " · fett" : ""}${layer.italic ? " · kursiv" : ""}\n` +
            `🎨 **Farbe:** \`${layer.color}\` · **Effekt:** ${layer.effect} \`${layer.effectColor}\``
    );

    Select(builder, client, "fonts", "font", "🔤 | Schriftart wählen...");
    Select(builder, client, "colors", "textcolor", "🎨 | Textfarbe wählen...");
    Select(builder, client, "effects", "effect", "✨ | Effekt wählen...");
    Select(builder, client, "aligns", "align", "↔️ | Ausrichtung wählen...");

    builder.buttons(
        { customId: `${PANEL_PREFIX}:edittext`, label: "Text ändern", emoji: "📝", tone: "primary" },
        { customId: `${PANEL_PREFIX}:textnumbers`, label: "Grösse & Breite", emoji: "🔢" },
        { customId: `${PANEL_PREFIX}:bold`, label: layer.bold ? "Fett aus" : "Fett an", emoji: "🅱️" },
        { customId: `${PANEL_PREFIX}:italic`, label: layer.italic ? "Kursiv aus" : "Kursiv an", emoji: "🇮" },
        { customId: `${PANEL_PREFIX}:placeholders`, label: "Platzhalter", emoji: "🔣" }
    );
}

function Avatar(builder: ComponentV2Builder, client: BotClient, layer: IAvatarLayer): void {
    builder.text(`🖼️ **Grösse:** ${layer.size}px · **Rahmen:** ${layer.border}px \`${layer.borderColor}\``);

    Select(builder, client, "avatars", "avatarshape", "⭕ | Form wählen...");
    Select(builder, client, "colors", "bordercolor", "🎨 | Rahmenfarbe wählen...");

    builder.buttons({ customId: `${PANEL_PREFIX}:avatarnumbers`, label: "Grösse & Rahmen", emoji: "🔢", tone: "primary" });
}

function ImageLayer(builder: ComponentV2Builder, client: BotClient, layer: IImageLayer): void {
    builder.text(
        `🖼️ **Bild:** ${layer.image ? "gesetzt" : "_keins_"} · **Grösse:** ${layer.width}×${layer.height} · **Ecken:** ${layer.radius}px`
    );

    builder.buttons(
        { customId: `${PANEL_PREFIX}:imgupload`, label: "Hochladen", emoji: "⬆️", tone: "success" },
        { customId: `${PANEL_PREFIX}:imgpick`, label: "Aus Galerie", emoji: "🗃️" },
        { customId: `${PANEL_PREFIX}:imgnumbers`, label: "Grösse & Ecken", emoji: "🔢", tone: "primary" }
    );
}

function Shape(builder: ComponentV2Builder, client: BotClient, layer: IShapeLayer): void {
    builder.text(`⬛ **Grösse:** ${layer.width}×${layer.height} · **Farbe:** \`${layer.color}\` · **Ecken:** ${layer.radius}px`);

    Select(builder, client, "shapes", "shapekind", "⬛ | Form wählen...");
    Select(builder, client, "colors", "shapecolor", "🎨 | Farbe wählen...");

    builder.buttons({ customId: `${PANEL_PREFIX}:shapenumbers`, label: "Grösse & Ecken", emoji: "🔢", tone: "primary" });
}

function Message(builder: ComponentV2Builder, client: BotClient, state: IWelcomeState): void {
    const { config } = state;

    builder.text(
        `**Vorschau der Nachricht**\n\n**${config.title}**\n${config.message}\n\n` +
            `🎨 **Akzentfarbe:** \`${config.accent}\``
    );

    Select(builder, client, "colors", "accent", "🎨 | Akzentfarbe wählen...");

    builder.buttons(
        { customId: `${PANEL_PREFIX}:edittitle`, label: "Titel ändern", emoji: "🏷️", tone: "primary" },
        { customId: `${PANEL_PREFIX}:editmessage`, label: "Text ändern", emoji: "📝", tone: "primary" },
        { customId: `${PANEL_PREFIX}:placeholders`, label: "Platzhalter", emoji: "🔣" },
        { customId: `${PANEL_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" }
    );
}

async function Category(builder: ComponentV2Builder, client: BotClient, state: IWelcomeState): Promise<void> {
    const categories = await client.galleryService.GetCategories(state.guildId, { requireImages: false });
    const own = categories.filter((entry) => entry.guildId === state.guildId);

    builder.text(
        state.target === "background"
            ? "In welche Galerie-Kategorie soll das Hintergrundbild gespeichert werden?"
            : "In welche Galerie-Kategorie soll das Bild gespeichert werden?"
    );

    if (own.length > 0) {
        builder.select({
            customId: `${PANEL_PREFIX}:category`,
            placeholder: "📁 | Kategorie wählen...",
            options: own.slice(0, 25).map((entry) => ({
                label: entry.name.slice(0, 100),
                value: entry.name,
                description: `${entry.images} Bild(er)`,
            })),
        });
    } else {
        builder.subtext("Für diesen Server gibt es noch keine eigene Kategorie.");
    }

    builder.buttons(
        { customId: `${PANEL_PREFIX}:newcategory`, label: "Neue Kategorie", emoji: "➕", tone: "primary" },
        { customId: `${PANEL_PREFIX}:back`, label: "Abbrechen", emoji: "✖️", tone: "danger" }
    );
}

async function Picker(builder: ComponentV2Builder, client: BotClient, state: IWelcomeState): Promise<void> {
    const images = await client.galleryService.SearchImages(state.guildId, "", { includeDefault: true, limit: 25 });
    const layer = ActiveLayer(state);

    // Einzige Stelle mit Vorauswahl: hier will man sehen, welches Bild gerade drin ist.
    const current = state.target === "background" ? state.config.card.background : layer?.type === "image" ? layer.image : null;

    builder.text(images.length > 0 ? "Welches Bild soll es sein?" : "Es gibt noch keine Bilder in der Galerie.");

    if (images.length > 0) {
        builder.select({
            customId: `${PANEL_PREFIX}:image`,
            placeholder: "🖼️ | Bild wählen...",
            options: images.map((image) => ({
                label: image.file.slice(0, 100),
                value: image.id,
                description: image.shortPath.slice(0, 100),
                default: image.id === current,
            })),
        });
    }

    if (current && !images.some((image) => image.id === current)) {
        builder.subtext("Das eingestellte Bild steht nicht in dieser Liste — es wurde vermutlich gelöscht.");
    }

    builder.buttons({ customId: `${PANEL_PREFIX}:back`, label: "Zurück", emoji: "⬅️", tone: "danger" });
}

export async function RenderPanel(client: BotClient, state: IWelcomeState): Promise<IWelcomePanelView> {
    const guild = client.guilds.cache.get(state.guildId);
    const layer = ActiveLayer(state);

    if (state.view === "layer" && !layer) state.view = "layers";

    const titles: Record<string, [string, string]> = {
        home: ["👋 | Welcome-Setup", guild?.name ?? state.guildId],
        card: ["🎨 | Karte", "Hintergrund, Farben und Format"],
        layers: ["🗂️ | Ebenen", "Was auf der Karte liegt"],
        layer: ["✏️ | Ebene bearbeiten", layer?.name ?? ""],
        message: ["💬 | Nachricht", "Der ComponentV2-Container"],
        category: ["📁 | Kategorie", "Wohin das Bild gespeichert wird"],
        image: ["🗃️ | Galerie", "Ein vorhandenes Bild wählen"],
    };

    const [title, subtitle] = titles[state.view] ?? titles.home;
    const builder = Head(state, title, subtitle);

    const needsPreview =
        state.config.mode !== "container" && ["home", "card", "layers", "layer"].includes(state.view);

    const files = needsPreview
        ? [await client.welcomeService.Preview(state.config, guild?.name ?? "Dein Server")]
        : [];

    if (state.view === "card") Card(builder, client, state);
    else if (state.view === "layers") Layers(builder, client, state);
    else if (state.view === "layer" && layer) Layer(builder, client, state, layer);
    else if (state.view === "message") Message(builder, client, state);
    else if (state.view === "category") await Category(builder, client, state);
    else if (state.view === "image") await Picker(builder, client, state);
    else Home(builder, client, state);

    return { components: [builder.build()], files };
}

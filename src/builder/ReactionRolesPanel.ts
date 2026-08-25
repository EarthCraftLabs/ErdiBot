import { ChannelType, ColorResolvable, Guild } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "./ComponentV2Builder";
import { ISelectEntryOptions } from "../interfaces/builder/IComponentV2Builder";
import IReactionRolePanel, {
    IReactionRoleEntry,
} from "../interfaces/services/reactionroles/IReactionRolePanel";
import {
    IReactionRolesPanelView,
    IReactionRolesState,
    MediaTarget,
} from "../interfaces/services/reactionroles/IReactionRolesPanel";
import { IPanelMedia } from "../interfaces/services/reactionroles/IReactionRolePanel";
import { BACK_TO_SETUP } from "../constants/Setup";
import {
    CONFIG_KEY,
    EmojiComponent,
    EmojiText,
    IsMediaUrl,
    MAX_ENTRIES,
    MAX_PANELS,
    PANEL_PREFIX,
} from "../constants/ReactionRoles";
import { UsableEmoji } from "./ReactionRolesMessage";

export { PANEL_PREFIX };

export const PanelStates = new LRUCache<string, IReactionRolesState>({ max: 50, ttl: 30 * 60_000 });

export function NewPanelState(guildId: string): IReactionRolesState {
    return { guildId, view: "home", panel: null, entryId: null, target: null, dirty: false, notice: null };
}

export function ActiveEntry(state: IReactionRolesState): IReactionRoleEntry | null {
    return state.panel?.entries.find((entry) => entry.id === state.entryId) ?? null;
}

// Wie im Welcome-Panel bewusst ohne `default`: eine vorausgewählte Option lässt sich nicht
// erneut auswählen. Der aktuelle Wert steht im Text darüber.
function Choices(client: BotClient, field: string): ISelectEntryOptions[] {
    return client.configService.Options(CONFIG_KEY, field).map((option) => ({
        label: option.name.slice(0, 100),
        value: option.value,
        description: option.description ? option.description.slice(0, 100) : undefined,
        emoji: option.emoji || undefined,
    }));
}

function Select(builder: ComponentV2Builder, client: BotClient, field: string, action: string, placeholder: string): void {
    const options = Choices(client, field);
    if (options.length === 0) return;

    builder.select({ customId: `${PANEL_PREFIX}:${action}`, placeholder, options });
}

function Label(client: BotClient, field: string, value: string): string {
    return client.configService.Option(CONFIG_KEY, field, value)?.name ?? value;
}

function Head(state: IReactionRolesState, title: string, subtitle?: string): ComponentV2Builder {
    const accent = (state.panel?.accent ?? "#5865F2") as ColorResolvable;
    const builder = new ComponentV2Builder({ accentColor: accent }).title(title, subtitle);

    if (state.notice) builder.subtext(state.notice);
    if (state.dirty) builder.subtext("✏️ Ungespeicherte Änderungen — unten auf **Speichern** drücken.");

    return builder.separator();
}

/** Ein gelöschtes Server-Emoji darf weder als Rohtext auftauchen noch in einem Select landen. */
function Emoji(entry: IReactionRoleEntry, guild: Guild | undefined): IReactionRoleEntry["emoji"] {
    return guild ? UsableEmoji(entry, guild) : entry.emoji;
}

function EntryLine(client: BotClient, guild: Guild | undefined, entry: IReactionRoleEntry, index: number): string {
    const issue = guild ? client.reactionRolesService.Issue(guild, entry.roleId) : null;
    const suffix = issue ? ` — ⚠️ _${issue}_` : entry.description ? ` — ${entry.description}` : "";

    return `\`${index + 1}.\` ${EmojiText(Emoji(entry, guild))} **${entry.label}** · <@&${entry.roleId}>${suffix}`;
}

async function Home(builder: ComponentV2Builder, client: BotClient, state: IReactionRolesState): Promise<void> {
    const panels = await client.reactionRolesService.List(state.guildId);

    builder.text(
        panels.length > 0
            ? panels
                  .map((panel, index) => {
                      const status = panel.messageId ? "🟢" : "⚪";
                      const channel = panel.channelId ? `<#${panel.channelId}>` : "_kein Kanal_";

                      return `\`${index + 1}.\` ${status} **${panel.title}** · ${panel.entries.length} Rolle(n) · ${channel}`;
                  })
                  .join("\n")
            : "Noch kein Panel angelegt. Leg unten eins an."
    );

    if (panels.length > 0) {
        builder.select({
            customId: `${PANEL_PREFIX}:open`,
            placeholder: "🎭 | Panel bearbeiten...",
            options: panels.slice(0, MAX_PANELS).map((panel) => ({
                label: panel.title.slice(0, 100),
                value: panel.panelId,
                description: `${panel.entries.length} Rolle(n) · ${panel.messageId ? "veröffentlicht" : "Entwurf"}`,
                emoji: panel.messageId ? "🟢" : "⚪",
            })),
        });
    }

    builder.subtext("🟢 veröffentlicht · ⚪ Entwurf");

    builder.buttons(
        {
            customId: `${PANEL_PREFIX}:new`,
            label: "Neues Panel",
            emoji: "➕",
            tone: "primary",
            disabled: panels.length >= MAX_PANELS,
        },
        { customId: `${PANEL_PREFIX}:refresh`, label: "Aktualisieren", emoji: "🔄" },
        { customId: BACK_TO_SETUP, label: "Zurück zum Setup", emoji: "⬅️", tone: "danger" }
    );
}

function Panel(
    builder: ComponentV2Builder,
    client: BotClient,
    state: IReactionRolesState,
    panel: IReactionRolePanel,
    guild: Guild | undefined
): void {
    builder.text(
        `📢 **Kanal:** ${panel.channelId ? `<#${panel.channelId}>` : "_noch keiner_"} · ` +
            `**Status:** ${panel.messageId ? "🟢 veröffentlicht" : "⚪ Entwurf"}\n` +
            `🧩 **Anzeige:** ${Label(client, "styles", panel.style)} · ` +
            `**Vergabe:** ${Label(client, "modes", panel.mode)}\n` +
            `🎨 **Akzent:** ${panel.accent ? `\`${panel.accent}\`` : "_keine Farbe_"} · ` +
            `**Rollen:** ${panel.entries.length}/${MAX_ENTRIES}\n` +
            `🖼️ **Thumbnail:** ${panel.thumbnail ? "gesetzt" : "_keins_"} · ` +
            `**Bild:** ${panel.image ? "gesetzt" : "_keins_"}\n` +
            `📝 **Text:** ${panel.description ? panel.description.slice(0, 200) : "_keiner_"}`
    );

    builder.separator();

    builder.text(
        panel.entries.length > 0
            ? panel.entries.map((entry, index) => EntryLine(client, guild, entry, index)).join("\n")
            : "Noch keine Rollen eingetragen — unten eine Rolle auswählen."
    );

    if (panel.entries.length < MAX_ENTRIES) {
        builder.roleSelect({ customId: `${PANEL_PREFIX}:addrole`, placeholder: "➕ | Rolle hinzufügen..." });
    } else {
        builder.subtext(`Mehr als ${MAX_ENTRIES} Rollen gehen pro Panel nicht.`);
    }

    if (panel.entries.length > 0) {
        builder.select({
            customId: `${PANEL_PREFIX}:entry`,
            placeholder: "✏️ | Eintrag bearbeiten...",
            options: panel.entries.map((entry, index) => ({
                label: `${index + 1}. ${entry.label}`.slice(0, 100),
                value: entry.id,
                description: entry.description?.slice(0, 100),
                emoji: EmojiComponent(Emoji(entry, guild)),
            })),
        });
    }

    builder.channelSelect({
        customId: `${PANEL_PREFIX}:channel`,
        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        placeholder: "📢 | Kanal für die Nachricht wählen...",
    });

    Select(builder, client, "styles", "style", "🧩 | Anzeige wählen...");
    Select(builder, client, "modes", "mode", "🎚️ | Vergabe wählen...");
    Select(builder, client, "colors", "accent", "🎨 | Akzentfarbe wählen...");

    builder.buttons(
        { customId: `${PANEL_PREFIX}:text`, label: "Titel & Text", emoji: "📝", tone: "primary" },
        { customId: `${PANEL_PREFIX}:media`, label: "Bilder", emoji: "🖼️", tone: "primary" },
        {
            customId: `${PANEL_PREFIX}:publish`,
            label: panel.messageId ? "Nachricht aktualisieren" : "Veröffentlichen",
            emoji: "🚀",
            tone: "success",
            disabled: panel.entries.length === 0 || !panel.channelId,
        },
        {
            customId: `${PANEL_PREFIX}:unpublish`,
            label: "Nachricht entfernen",
            emoji: "🚫",
            disabled: !panel.messageId,
        }
    );

    builder.buttons(
        { customId: `${PANEL_PREFIX}:save`, label: "Speichern", emoji: "💾", tone: "success", disabled: !state.dirty },
        { customId: `${PANEL_PREFIX}:discard`, label: "Verwerfen", emoji: "↩️", disabled: !state.dirty },
        { customId: `${PANEL_PREFIX}:delete`, label: "Panel löschen", emoji: "🗑️", tone: "danger" },
        { customId: `${PANEL_PREFIX}:home`, label: "Zur Übersicht", emoji: "⬅️", tone: "danger" }
    );
}

function Entry(
    builder: ComponentV2Builder,
    client: BotClient,
    state: IReactionRolesState,
    panel: IReactionRolePanel,
    entry: IReactionRoleEntry,
    guild: Guild | undefined
): void {
    const index = panel.entries.findIndex((item) => item.id === entry.id);
    const issue = guild ? client.reactionRolesService.Issue(guild, entry.roleId) : null;

    builder.text(
        `🎭 **Rolle:** <@&${entry.roleId}>${issue ? ` — ⚠️ _${issue}_` : ""}\n` +
            `${EmojiText(Emoji(entry, guild))} **Emoji:** ${Emoji(entry, guild) ? `\`${entry.emoji!.name}\`` : "_keins_"}` +
            `${entry.emoji && !Emoji(entry, guild) ? " — ⚠️ _gibt es auf dem Server nicht mehr_" : ""}\n` +
            `📝 **Beschreibung:** ${entry.description ?? "_keine_"}\n` +
            `🎨 **Button-Farbe:** ${Label(client, "tones", entry.tone)}` +
            `${panel.style === "select" ? " _(nur bei Buttons sichtbar)_" : ""}`
    );

    builder.roleSelect({ customId: `${PANEL_PREFIX}:role`, placeholder: "🎭 | Andere Rolle wählen..." });

    Select(builder, client, "tones", "tone", "🎨 | Button-Farbe wählen...");

    builder.buttons(
        { customId: `${PANEL_PREFIX}:rename`, label: "Beschriftung", emoji: "🏷️", tone: "primary" },
        { customId: `${PANEL_PREFIX}:emoji`, label: "Emoji setzen", emoji: "😀", tone: "primary" },
        { customId: `${PANEL_PREFIX}:noemoji`, label: "Emoji entfernen", emoji: "🚫", disabled: !entry.emoji },
        { customId: `${PANEL_PREFIX}:up`, label: "Nach oben", emoji: "🔼", disabled: index <= 0 },
        {
            customId: `${PANEL_PREFIX}:down`,
            label: "Nach unten",
            emoji: "🔽",
            disabled: index >= panel.entries.length - 1,
        }
    );

    builder.buttons(
        { customId: `${PANEL_PREFIX}:panel`, label: "Zur Liste", emoji: "⬅️", tone: "danger" },
        { customId: `${PANEL_PREFIX}:removeentry`, label: "Eintrag löschen", emoji: "🗑️", tone: "danger" }
    );
}

/** Zeigt, was in einem Bildfeld steht — eigene Adresse, Galerie-Datei oder nichts mehr. */
async function MediaLabel(client: BotClient, value: string | null): Promise<string> {
    if (!value) return "_keins_";
    if (IsMediaUrl(value)) return `<${value}>`;

    const image = await client.galleryService.GetImage(value);

    return image ? `\`${image.shortPath}\` _(Galerie)_` : "⚠️ _dieses Galerie-Bild gibt es nicht mehr_";
}

function MediaButtons(target: MediaTarget, label: string, emoji: string, value: string | null) {
    return [
        { customId: `${PANEL_PREFIX}:pick:${target}`, label: `${label} — Galerie`, emoji: "🗃️", tone: "primary" as const },
        { customId: `${PANEL_PREFIX}:url:${target}`, label: `${label} — URL`, emoji, tone: "primary" as const },
        { customId: `${PANEL_PREFIX}:clear:${target}`, label: `${label} entfernen`, emoji: "🚫", disabled: !value },
    ];
}

async function Media(
    builder: ComponentV2Builder,
    client: BotClient,
    panel: IReactionRolePanel,
    media: IPanelMedia
): Promise<void> {
    builder.text(
        `🖼️ **Thumbnail:** ${await MediaLabel(client, panel.thumbnail)}\n` +
            `-# Klein rechts neben Titel und Text\n\n` +
            `🏞️ **Grosses Bild:** ${await MediaLabel(client, panel.image)}\n` +
            `-# Volle Breite unter den Rollen`
    );

    const preview = [media.thumbnail, media.image].filter((url): url is string => url !== null);

    if (preview.length > 0) builder.gallery(...preview);

    builder.buttons(...MediaButtons("thumbnail", "Thumbnail", "🔗", panel.thumbnail));
    builder.buttons(...MediaButtons("image", "Bild", "🔗", panel.image));

    builder.buttons({ customId: `${PANEL_PREFIX}:panel`, label: "Zurück", emoji: "⬅️", tone: "danger" });
}

async function Picker(
    builder: ComponentV2Builder,
    client: BotClient,
    state: IReactionRolesState,
    panel: IReactionRolePanel
): Promise<void> {
    const images = await client.galleryService.SearchImages(state.guildId, "", { includeDefault: true, limit: 25 });
    const current = state.target ? panel[state.target] : null;

    builder.text(
        images.length > 0
            ? `Welches Bild soll es sein?${state.target === "thumbnail" ? " _(Thumbnail)_" : " _(grosses Bild)_"}`
            : "Es gibt noch keine Bilder in der Galerie — leg mit `/gallery` welche an."
    );

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

    builder.buttons({ customId: `${PANEL_PREFIX}:media`, label: "Zurück", emoji: "⬅️", tone: "danger" });
}

export async function RenderPanel(client: BotClient, state: IReactionRolesState): Promise<IReactionRolesPanelView> {
    const guild = client.guilds.cache.get(state.guildId);
    const entry = ActiveEntry(state);

    if (state.view !== "home" && !state.panel) state.view = "home";
    if (state.view === "entry" && !entry) state.view = "panel";
    if (state.view === "picker" && !state.target) state.view = "media";

    // Nur die Bilder-Ansicht zeigt eine Vorschau — die kostet einen Galerie-Zugriff.
    const media =
        state.view === "media" && state.panel ? await client.reactionRolesService.Media(state.panel) : null;

    const titles: Record<string, [string, string]> = {
        home: ["🎭 | Reaktionsrollen", guild?.name ?? state.guildId],
        panel: ["🎭 | Panel", state.panel?.title ?? ""],
        entry: ["✏️ | Eintrag", entry?.label ?? ""],
        media: ["🖼️ | Bilder", state.panel?.title ?? ""],
        picker: ["🗃️ | Galerie", state.target === "thumbnail" ? "Thumbnail wählen" : "Grosses Bild wählen"],
    };

    const [title, subtitle] = titles[state.view] ?? titles.home;
    const builder = Head(state, title, subtitle);

    if (state.view === "panel" && state.panel) Panel(builder, client, state, state.panel, guild);
    else if (state.view === "entry" && state.panel && entry) Entry(builder, client, state, state.panel, entry, guild);
    else if (state.view === "media" && state.panel && media) await Media(builder, client, state.panel, media);
    else if (state.view === "picker" && state.panel) await Picker(builder, client, state, state.panel);
    else await Home(builder, client, state);

    return { components: [builder.build()], files: media?.files ?? [] };
}

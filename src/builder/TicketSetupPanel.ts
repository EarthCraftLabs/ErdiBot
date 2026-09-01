import { ChannelType, ColorResolvable } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "./ComponentV2Builder";
import TicketMode from "../enums/TicketMode";
import { ISetupPanelView, ISetupState } from "../interfaces/services/ticket/ITicketPanel";
import { ITicketConfig } from "../interfaces/services/ticket/ITicketConfig";
import { ALL_ROLES, MAX_CATEGORIES, MissingPieces, PRIORITIES, Priority } from "../constants/Ticket";
import { CHANNEL_TYPES } from "../constants/Logging";
import { HOME_BUTTON } from "./SetupPanel";

export const SETUP_PREFIX = "ticket:setup";

export const SetupStates = new LRUCache<string, ISetupState>({ max: 50, ttl: 30 * 60_000 });

export function NewSetupState(
    guildId: string,
    config: ITicketConfig,
    logChannelId: string | null = null
): ISetupState {
    return {
        guildId,
        view: "home",
        config,
        draft: null,
        categoryIndex: -1,
        picking: null,
        kind: null,
        image: null,
        emojiPage: 0,
        logChannelId,
        dirty: false,
        notice: null,
    };
}

// Rollen und Emojis stehen in der Datenbank nur als ID. Für die Anzeige holt sie der
// Guild-Cache - fehlt der Server dort, bleibt die ID stehen statt einer leeren Zeile.
function Guild(client: BotClient, guildId: string) {
    return client.guilds.cache.get(guildId) ?? null;
}

export function RoleName(client: BotClient, guildId: string, roleId: string): string {
    return Guild(client, guildId)?.roles.cache.get(roleId)?.name ?? `Rolle ${roleId}`;
}

export function ActiveCategory(state: ISetupState) {
    return state.draft ?? state.config.categories[state.categoryIndex] ?? null;
}

function Head(state: ISetupState, title: string, subtitle?: string): ComponentV2Builder {
    const builder = new ComponentV2Builder({ accentColor: state.config.accent as ColorResolvable }).title(
        title,
        subtitle
    );

    if (state.notice) builder.subtext(state.notice);
    if (state.dirty) builder.subtext("✏️ Ungespeicherte Änderungen — unten auf **Speichern** drücken.");

    return builder.separator();
}

function Home(builder: ComponentV2Builder, state: ISetupState): void {
    const { config } = state;
    const missing = MissingPieces(config);
    const container = config.mode === TicketMode.FORUM ? config.forumChannelId : config.categoryChannelId;

    builder.text(
        `${config.enabled ? "🟢 **Aktiv**" : "🔴 **Inaktiv**"}\n` +
            `🗂️ **Modus:** ${config.mode === TicketMode.FORUM ? "Forum-Beiträge" : "Kanäle in einer Kategorie"}\n` +
            `📦 **Ablage:** ${container ? `<#${container}>` : "_noch keine_"}\n` +
            `📌 **Panel:** ${config.panelChannelId ? `<#${config.panelChannelId}>` : "_noch keiner_"}\n` +
            `📜 **Transcripts:** ${state.logChannelId ? `<#${state.logChannelId}>` : "_kein Ticket-Log_"}\n` +
            `🛠️ **Support-Rollen:** ${config.supportRoleIds.length}\n` +
            `📁 **Kategorien:** ${config.categories.length}/${MAX_CATEGORIES}`
    );

    if (missing.length > 0) builder.subtext(`⚠️ Es fehlt noch: ${missing.join(", ")}.`);

    builder.buttons(
        { customId: `${SETUP_PREFIX}:channels`, label: "Kanäle", emoji: "📦", tone: "primary" },
        { customId: `${SETUP_PREFIX}:roles`, label: "Rollen", emoji: "🛠️", tone: "primary" },
        { customId: `${SETUP_PREFIX}:categories`, label: "Kategorien", emoji: "📁", tone: "primary" },
        { customId: `${SETUP_PREFIX}:panel`, label: "Panel", emoji: "📌", tone: "primary" },
        { customId: `${SETUP_PREFIX}:limits`, label: "Limits", emoji: "🔢", tone: "primary" }
    );

    builder.buttons(
        { customId: `${SETUP_PREFIX}:save`, label: "Speichern", emoji: "💾", tone: "success", disabled: !state.dirty },
        {
            customId: `${SETUP_PREFIX}:toggle`,
            label: config.enabled ? "Deaktivieren" : "Aktivieren",
            emoji: "🔌",
            disabled: missing.length > 0 && !config.enabled,
        },
        { customId: `${SETUP_PREFIX}:publish`, label: "Panel senden", emoji: "🚀", disabled: missing.length > 0 },
        { customId: `${SETUP_PREFIX}:blacklist`, label: "Gesperrte", emoji: "🚫" },
        { customId: `${SETUP_PREFIX}:reload`, label: "Neu laden", emoji: "🔄" }
    );

    builder.buttons(HOME_BUTTON);
}

function Channels(builder: ComponentV2Builder, state: ISetupState): void {
    const { config } = state;
    const forum = config.mode === TicketMode.FORUM;

    builder.text(
        `**Modus:** ${forum ? "Forum-Beiträge" : "Kanäle in einer Kategorie"}\n\n` +
            (forum
                ? "Jedes Ticket wird ein Beitrag im Forum. Die Priorität setzt einen Forum-Tag."
                : "Jedes Ticket wird ein eigener Textkanal.") +
            " Beim Schliessen verschwindet er — das Transcript bleibt erhalten."
    );

    builder.text(
        `📦 **${forum ? "Forum" : "Kategorie"}:** ${
            forum
                ? config.forumChannelId
                    ? `<#${config.forumChannelId}>`
                    : "_noch keiner_"
                : config.categoryChannelId
                  ? `<#${config.categoryChannelId}>`
                  : "_noch keine_"
        }\n` +
            `📌 **Panel-Kanal:** ${config.panelChannelId ? `<#${config.panelChannelId}>` : "_noch keiner_"}\n` +
            `⏳ **Warteraum:** ${config.waitroomChannelId ? `<#${config.waitroomChannelId}>` : "_keiner_"}\n` +
            `📜 **Transcripts:** ${state.logChannelId ? `<#${state.logChannelId}>` : "_kein Ticket-Log gesetzt_"}`
    );

    // Der Transcript-Kanal wird nicht hier eingestellt: er ist der Ticket-Log aus dem
    // Logging-Setup. Zwei Stellen für denselben Kanal wären zwei Stellen zum Vergessen.
    builder.subtext(
        state.logChannelId
            ? "Transcripts gehen in den Ticket-Log — änderbar unter **/setup → 🗒️ Logging**."
            : "⚠️ Ohne Ticket-Log unter **/setup → 🗒️ Logging** landen Transcripts nur beim Ersteller."
    );

    builder.select({
        customId: `${SETUP_PREFIX}:mode`,
        placeholder: "🗂️ | Modus wählen …",
        options: [
            {
                label: "Forum-Beiträge",
                value: TicketMode.FORUM,
                description: "Tags, Archiv statt Löschen, native Suche",
                emoji: "🗃️",
            },
            {
                label: "Kanäle in einer Kategorie",
                value: TicketMode.CATEGORY,
                description: "Klassisch, funktioniert ohne Forum-Kanal",
                emoji: "📂",
            },
        ],
    });

    builder.buttons(
        {
            customId: `${SETUP_PREFIX}:pick:container`,
            label: forum ? "Forum wählen" : "Kategorie wählen",
            emoji: "📦",
            tone: "primary",
        },
        { customId: `${SETUP_PREFIX}:pick:panel`, label: "Panel-Kanal", emoji: "📌", tone: "primary" },
        { customId: `${SETUP_PREFIX}:pick:waitroom`, label: "Warteraum", emoji: "⏳" },
        { customId: `${SETUP_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" }
    );
}

// Die Vorstufe: Text-Kanal oder Thread. Gemischt wäre die Liste lang und
// man sähe nicht, was was ist.
function Picker(builder: ComponentV2Builder, state: ISetupState): void {
    const labels: Record<string, string> = {
        container: state.config.mode === TicketMode.FORUM ? "das Ticket-Forum" : "die Ticket-Kategorie",
        panel: "den Panel-Kanal",
        waitroom: "den Support-Warteraum",
    };

    const target = state.picking ?? "panel";
    const fixed = target === "container" || target === "waitroom";

    builder.text(`Wohin soll **${labels[target] ?? target}** zeigen?`);

    if (fixed) {
        // Forum, Kategorie und Sprachkanal haben keine Text/Thread-Wahl.
        const types =
            target === "waitroom"
                ? [ChannelType.GuildVoice]
                : state.config.mode === TicketMode.FORUM
                  ? [ChannelType.GuildForum]
                  : [ChannelType.GuildCategory];

        builder.channelSelect({
            customId: `${SETUP_PREFIX}:channel`,
            channelTypes: types,
            placeholder: "📦 | Auswählen …",
        });
    } else if (!state.kind) {
        builder.select({
            customId: `${SETUP_PREFIX}:kind`,
            placeholder: "📁 | Kanal-Art wählen …",
            options: [
                { label: "Text-Kanal", value: "text", description: "Ein normaler Server-Kanal", emoji: "💬" },
                { label: "Thread", value: "thread", description: "Ein bestehender Thread", emoji: "🧵" },
            ],
        });
    } else {
        builder.channelSelect({
            customId: `${SETUP_PREFIX}:channel`,
            channelTypes: CHANNEL_TYPES[state.kind],
            placeholder: state.kind === "thread" ? "🧵 | Thread wählen …" : "💬 | Text-Kanal wählen …",
        });
    }

    builder.buttons(
        { customId: `${SETUP_PREFIX}:clearpick`, label: "Entfernen", emoji: "🗑️", tone: "danger" },
        { customId: `${SETUP_PREFIX}:channels`, label: "Zurück", emoji: "⬅️" }
    );
}

function Roles(builder: ComponentV2Builder, client: BotClient, state: ISetupState): void {
    const { config } = state;

    builder.text(
        `🛠️ **Support-Rollen**\n` +
            (config.supportRoleIds.length > 0
                ? config.supportRoleIds.map((roleId) => `• <@&${roleId}>`).join("\n")
                : "_Noch keine eingetragen._") +
            "\n\nDiese Rollen sehen alle Tickets und dürfen die Team-Aktionen benutzen. " +
            "Einzelne Kategorien können davon abweichen."
    );

    builder.roleSelect({ customId: `${SETUP_PREFIX}:addrole`, placeholder: "➕ | Support-Rolle hinzufügen …" });

    if (config.supportRoleIds.length > 0) {
        builder.select({
            customId: `${SETUP_PREFIX}:delrole`,
            placeholder: "➖ | Support-Rolle entfernen …",
            options: config.supportRoleIds.map((roleId) => ({
                label: RoleName(client, state.guildId, roleId).slice(0, 100),
                value: roleId,
                emoji: "🛠️",
            })),
        });
    }

    builder.buttons({ customId: `${SETUP_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" });
}

function Categories(builder: ComponentV2Builder, state: ISetupState): void {
    const { categories } = state.config;

    builder.text(
        categories.length > 0
            ? categories
                  .map((category, index) => {
                      const priority = Priority(category.priority);
                      const role = category.roleId === ALL_ROLES ? "alle Support-Rollen" : `<@&${category.roleId}>`;

                      return `${index === state.categoryIndex ? "▸" : " "} ${category.emoji} **${category.name}** · ${priority.emoji} ${priority.label} · ${role}`;
                  })
                  .join("\n")
            : "Noch keine Kategorie. Ohne mindestens eine kann niemand ein Ticket öffnen."
    );

    if (categories.length > 0) {
        builder.select({
            customId: `${SETUP_PREFIX}:category`,
            placeholder: "📁 | Kategorie bearbeiten …",
            options: categories.map((category, index) => ({
                label: category.name.slice(0, 100),
                value: String(index),
                description: category.description.slice(0, 100),
                emoji: category.emoji || undefined,
            })),
        });
    }

    builder.buttons(
        {
            customId: `${SETUP_PREFIX}:newcategory`,
            label: "Kategorie anlegen",
            emoji: "➕",
            tone: "success",
            disabled: categories.length >= MAX_CATEGORIES,
        },
        { customId: `${SETUP_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" }
    );
}

function CategoryView(builder: ComponentV2Builder, client: BotClient, state: ISetupState): void {
    const category = ActiveCategory(state);
    if (!category) return;

    const priority = Priority(category.priority);
    const { supportRoleIds } = state.config;
    const orphan = category.roleId !== ALL_ROLES && !supportRoleIds.includes(category.roleId);

    builder.text(
        `${category.emoji} **${category.name}**\n` +
            `📝 ${category.description}\n\n` +
            `⚡ **Priorität:** ${priority.emoji} ${priority.label}\n` +
            `🛠️ **Zuständig:** ${category.roleId === ALL_ROLES ? "alle Support-Rollen" : `<@&${category.roleId}>`}`
    );

    if (priority.alerts) {
        builder.subtext("📣 Bei dieser Priorität bekommt das zuständige Team zusätzlich eine Direktnachricht.");
    }

    if (orphan) {
        builder.subtext("⚠️ Diese Rolle steht nicht mehr im Support-Team — sie bleibt trotzdem zuständig.");
    }

    builder.select({
        customId: `${SETUP_PREFIX}:priority`,
        placeholder: "⚡ | Priorität wählen …",
        options: PRIORITIES.map((entry) => ({
            label: entry.label,
            value: entry.id,
            description: entry.description,
            emoji: entry.emoji,
        })),
    });

    // Nur Rollen, die vorher als Support-Rolle eingetragen wurden: eine fremde Rolle
    // zuständig zu machen, die im Ticket nichts sehen darf, ergibt keinen Ticket-Flow.
    builder.select({
        customId: `${SETUP_PREFIX}:categoryrole`,
        placeholder: "🛠️ | Zuständigkeit wählen …",
        options: [
            {
                label: "Alle Support-Rollen",
                value: ALL_ROLES,
                description: `${supportRoleIds.length} Rolle(n) aus dem Support-Team`,
                emoji: "👥",
                default: category.roleId === ALL_ROLES,
            },
            ...supportRoleIds.slice(0, 24).map((roleId) => ({
                label: RoleName(client, state.guildId, roleId).slice(0, 100),
                value: roleId,
                description: "Nur diese Rolle ist zuständig",
                emoji: "🛠️",
                default: category.roleId === roleId,
            })),
        ],
    });

    Emojis(builder, client, state, category.emoji);

    builder.buttons(
        { customId: `${SETUP_PREFIX}:editcategory`, label: "Text ändern", emoji: "✏️", tone: "primary" },
        { customId: `${SETUP_PREFIX}:delcategory`, label: "Löschen", emoji: "🗑️", tone: "danger" },
        { customId: `${SETUP_PREFIX}:categories`, label: "Zurück", emoji: "⬅️" }
    );
}

const EMOJI_PAGE_SIZE = 25;

// Discord hat keinen Emoji-Picker für Komponenten - also ein Menü über die Server-Emojis.
// Mehr als 25 passen nicht in ein Select, deshalb blättern statt abschneiden.
function Emojis(
    builder: ComponentV2Builder,
    client: BotClient,
    state: ISetupState,
    current: string
): void {
    const emojis = [...(Guild(client, state.guildId)?.emojis.cache.values() ?? [])];

    if (emojis.length === 0) {
        builder.subtext("Dieser Server hat keine eigenen Emojis — Standard-Emojis gehen über **Text ändern**.");

        return;
    }

    const pages = Math.ceil(emojis.length / EMOJI_PAGE_SIZE);
    const page = Math.min(Math.max(state.emojiPage, 0), pages - 1);
    const slice = emojis.slice(page * EMOJI_PAGE_SIZE, page * EMOJI_PAGE_SIZE + EMOJI_PAGE_SIZE);

    builder.select({
        customId: `${SETUP_PREFIX}:emoji`,
        placeholder: `😀 | Server-Emoji wählen … (${page + 1}/${pages})`,
        options: slice.map((emoji) => ({
            label: (emoji.name ?? emoji.id).slice(0, 100),
            value: emoji.id,
            emoji: { id: emoji.id, name: emoji.name ?? undefined, animated: emoji.animated ?? false },
            default: current.includes(emoji.id),
        })),
    });

    if (pages > 1) {
        builder.buttons(
            { customId: `${SETUP_PREFIX}:emojiprev`, label: "Emojis zurück", emoji: "◀️", disabled: page === 0 },
            { customId: `${SETUP_PREFIX}:emojinext`, label: "Emojis weiter", emoji: "▶️", disabled: page >= pages - 1 }
        );
    }
}

function Panel(builder: ComponentV2Builder, state: ISetupState): void {
    const { config } = state;

    builder.text(
        `📛 **Titel:** ${config.panelTitle}\n\n` +
            `📝 **Text:**\n>>> ${config.panelMessage.slice(0, 500)}`
    );

    builder.subtext(
        `🎨 Farbe \`${config.accent}\` · 🖼️ Bild ${config.panelImage ? "gesetzt" : "keins"} · ` +
            `🏞️ Thumbnail ${config.panelThumbnail ? "gesetzt" : "keins"} · ` +
            `📌 Kanal ${config.panelChannelId ? `<#${config.panelChannelId}>` : "_keiner_"}`
    );

    builder.buttons(
        { customId: `${SETUP_PREFIX}:editpanel`, label: "Titel & Text", emoji: "✏️", tone: "primary" },
        { customId: `${SETUP_PREFIX}:editimage`, label: "Bilder & Farbe", emoji: "🎨", tone: "primary" },
        { customId: `${SETUP_PREFIX}:preview`, label: "Vorschau", emoji: "👁️" },
        { customId: `${SETUP_PREFIX}:publish`, label: "Senden", emoji: "🚀", tone: "success" },
        { customId: `${SETUP_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" }
    );

    builder.buttons(
        { customId: `${SETUP_PREFIX}:gallery:panel`, label: "Bild aus Galerie", emoji: "🗃️" },
        { customId: `${SETUP_PREFIX}:gallery:thumbnail`, label: "Thumbnail aus Galerie", emoji: "🗃️" }
    );

    builder.subtext("Eigene Adressen gehen über **Bilder & Farbe**, ein leeres Feld entfernt das Bild.");
}

// Bilder kommen entweder als URL aus dem Modal oder von hier: derselbe Bestand, den
// auch /gallery und das Welcome-Panel benutzen.
async function GalleryView(builder: ComponentV2Builder, client: BotClient, state: ISetupState): Promise<void> {
    const target = state.image ?? "panel";
    const current = target === "panel" ? state.config.panelImage : state.config.panelThumbnail;
    const images = await client.galleryService.SearchImages(state.guildId, "", { includeDefault: true, limit: 25 });

    builder.text(
        target === "panel"
            ? "Welches Bild soll unter dem Panel-Text stehen?"
            : "Welches Bild soll als Thumbnail neben dem Panel-Text stehen?"
    );

    if (images.length > 0) {
        builder.select({
            customId: `${SETUP_PREFIX}:image`,
            placeholder: "🖼️ | Bild wählen …",
            options: images.map((image) => ({
                label: image.file.slice(0, 100),
                value: image.id,
                description: image.shortPath.slice(0, 100),
                default: image.url === current,
            })),
        });
    } else {
        builder.subtext("Die Galerie ist leer — lade Bilder über **/gallery** hoch oder trage eine URL ein.");
    }

    builder.buttons(
        {
            customId: `${SETUP_PREFIX}:clearimage`,
            label: "Entfernen",
            emoji: "🗑️",
            tone: "danger",
            disabled: !current,
        },
        { customId: `${SETUP_PREFIX}:panel`, label: "Zurück", emoji: "⬅️" }
    );
}

function Limits(builder: ComponentV2Builder, state: ISetupState): void {
    const { config } = state;

    builder.text(
        `🔢 **Offene Tickets pro Person:** ${config.maxOpenTickets === 0 ? "unbegrenzt" : config.maxOpenTickets}\n` +
            `🕓 **Support-Zeiten:** ${config.supportHours ?? "_nicht angegeben_"}\n\n` +
            "Die Support-Zeiten sind reiner Text und stehen im Panel und im Ticket — sie sperren nichts."
    );

    builder.buttons(
        { customId: `${SETUP_PREFIX}:editlimits`, label: "Werte ändern", emoji: "✏️", tone: "primary" },
        { customId: `${SETUP_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" }
    );
}

function Blacklist(builder: ComponentV2Builder, state: ISetupState): void {
    builder.text(
        "Gesperrte Nutzer können kein Ticket mehr öffnen.\n\n" +
            "Gesperrt wird direkt im Ticket über die Team-Aktion **Benutzer sperren** — " +
            "dort lässt sich auch eine Dauer angeben, nach der die Sperre von selbst abläuft."
    );

    builder.userSelect({ customId: `${SETUP_PREFIX}:unblock`, placeholder: "🔓 | Sperre aufheben …" });

    builder.buttons({ customId: `${SETUP_PREFIX}:home`, label: "Zurück", emoji: "⬅️", tone: "danger" });
}

export async function RenderSetup(client: BotClient, state: ISetupState): Promise<ISetupPanelView> {
    if (state.view === "category" && !ActiveCategory(state)) state.view = "categories";

    const titles: Record<string, [string, string]> = {
        home: ["🎫 | Ticket-System", "Support-Tickets einrichten"],
        channels: ["📦 | Kanäle", "Wo Tickets entstehen und landen"],
        roles: ["🛠️ | Support-Rollen", "Wer Tickets bearbeiten darf"],
        categories: ["📁 | Kategorien", "Wofür Tickets geöffnet werden können"],
        category: ["📁 | Kategorie", ActiveCategory(state)?.name ?? ""],
        panel: ["📌 | Panel", "Die öffentliche Nachricht"],
        limits: ["🔢 | Limits", "Grenzen und Zeiten"],
        blacklist: ["🚫 | Gesperrte Nutzer", "Wer keine Tickets öffnen darf"],
        gallery: ["🗃️ | Galerie", state.image === "thumbnail" ? "Thumbnail wählen" : "Panel-Bild wählen"],
    };

    const [title, subtitle] = titles[state.view] ?? titles.home;
    const builder = Head(state, title, subtitle);

    if (state.picking) Picker(builder, state);
    else if (state.view === "home") Home(builder, state);
    else if (state.view === "channels") Channels(builder, state);
    else if (state.view === "roles") Roles(builder, client, state);
    else if (state.view === "categories") Categories(builder, state);
    else if (state.view === "category") CategoryView(builder, client, state);
    else if (state.view === "panel") Panel(builder, state);
    else if (state.view === "gallery") await GalleryView(builder, client, state);
    else if (state.view === "limits") Limits(builder, state);
    else if (state.view === "blacklist") Blacklist(builder, state);

    return { components: [builder.build()] };
}

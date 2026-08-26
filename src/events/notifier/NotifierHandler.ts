import {
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
import BuildNotification from "../../builder/NotifierMessage";
import { Active, PANEL_PREFIX, PanelStates, RenderPanel } from "../../builder/NotifierPanel";
import { INotifierState } from "../../interfaces/services/notifier/INotifierPanel";
import INotifierSubscription, { Platform } from "../../interfaces/services/notifier/INotifierSubscription";
import { INotifierEvent } from "../../interfaces/services/notifier/INotifierEvent";
import {
    ClampNumber,
    CONFIG_KEY,
    DefaultSubscription,
    IsHex,
    IsTime,
    MAX_COOLDOWN,
    MAX_ENTRIES,
    MAX_NAME_LENGTH,
    MAX_TEMPLATE_LENGTH,
    MIN_COOLDOWN,
    PLACEHOLDERS,
    PLATFORM_LABEL,
    PLATFORMS,
    STYLES,
    SUPPORTS_LIVE,
} from "../../constants/Notifier";
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

const PREVIEW: INotifierEvent = {
    kind: "live",
    id: "vorschau",
    title: "Testlauf — so sieht die Meldung aus",
    url: "https://example.com",
    thumbnail: null,
    game: "Just Chatting",
    viewers: 1337,
    publishedAt: new Date(),
};

export default class NotifierHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bedient das Notifier-Setup (Buttons, Selects, Modals)",
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

            await this.client.guardian.ReportError(normalized, interaction, `Notifier Error: ${interaction.customId}`);
        }
    }

    // ── Komponenten ────────────────────────────────────────────────────────

    private async Component(interaction: MessageComponentInteraction): Promise<void> {
        const state = PanelStates.get(interaction.message.id);

        if (!state) {
            await interaction.update(this.Notice("⌛ | Panel abgelaufen", "Öffne das Setup mit `/notifier` erneut."));

            return;
        }

        const action = interaction.customId.slice(PANEL_PREFIX.length + 1);
        state.notice = null;

        if (interaction.isAnySelectMenu()) return this.Selected(interaction, state, action);
        if (!interaction.isButton()) return;

        const entry = Active(state);

        // Modals müssen vor jedem defer/update geöffnet werden.
        if (action.startsWith("edit:")) return this.Editor(interaction, state, action.slice(5));
        if (action === "rename" && entry) {
            return this.Show(interaction, "rename", "Kanal umbenennen", [
                { id: "name", label: "Anzeigename", value: entry.name, max: MAX_NAME_LENGTH },
                { id: "url", label: "Link zum Kanal", value: entry.sourceUrl, max: 255 },
            ]);
        }

        switch (action) {
            case "home":
            case "add":
            case "status":
                state.view = action;
                if (action === "add") state.platform = null;
                break;

            case "entry":
            case "message":
            case "roles":
            case "options":
                if (!entry) state.view = "home";
                else state.view = action;
                break;

            case "refresh":
                return this.Reload(interaction, state);

            case "save":
                return this.Save(interaction, state);

            case "delete":
                return this.Delete(interaction, state);

            case "test":
                return this.Test(interaction, state);

            case "check":
            case "pollnow":
                return this.CheckNow(interaction, state, action === "check");

            case "placeholders":
                return this.Placeholders(interaction);

            case "toggle":
                if (entry) this.Change(state, { enabled: !entry.enabled });
                break;

            case "publish":
                if (entry) this.Change(state, { autoPublish: !entry.autoPublish });
                break;

            case "thread":
                if (entry) this.Change(state, { createThread: !entry.createThread });
                break;

            case "editend":
                if (entry) this.Change(state, { editOnEnd: !entry.editOnEnd });
                break;

            case "clearping":
                this.Change(state, { mentionRoleId: null });
                break;

            case "clearlive":
                this.Change(state, { liveRoleId: null });
                break;

            case "clearuser":
                this.Change(state, { discordUserId: null });
                break;

            default:
                break;
        }

        await this.Apply(interaction, state);
    }

    private async Selected(
        interaction: MessageComponentInteraction,
        state: INotifierState,
        action: string
    ): Promise<void> {
        if (!interaction.isAnySelectMenu()) return;

        const value = interaction.values[0];

        if (action === "pick") {
            state.index = Number(value);
            state.draft = null;
            state.dirty = false;
            state.view = "entry";

            return this.Apply(interaction, state);
        }

        if (action === "platform") {
            const platform = PLATFORMS.find((entry) => entry === value);
            if (!platform) return this.Apply(interaction, state);

            state.platform = platform;

            return this.AskSource(interaction, platform);
        }

        switch (action) {
            case "channel":
                this.Change(state, { channelId: value });
                break;

            case "pingrole":
                this.Change(state, { mentionRoleId: value });
                break;

            case "liverole":
                this.Change(state, { liveRoleId: value });
                break;

            case "discord":
                this.Change(state, { discordUserId: value });
                break;

            case "style": {
                const style = STYLES.find((entry) => entry === value);
                if (style) this.Change(state, { style });
                break;
            }

            case "accent":
                if (IsHex(value)) this.Change(state, { accent: value.toUpperCase() });
                break;

            default:
                break;
        }

        await this.Apply(interaction, state);
    }

    // ── Modals ─────────────────────────────────────────────────────────────

    private async Modal(interaction: ModalSubmitInteraction): Promise<void> {
        const parts = interaction.customId.split(":");
        const kind = parts[3];
        const state = PanelStates.get(parts[4]);

        if (!state) {
            await interaction.reply({
                ...this.Notice("⌛ | Panel abgelaufen", "Öffne das Setup mit `/notifier` erneut."),
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
        }

        const read = (id: string) => interaction.fields.getTextInputValue(id).trim();

        if (kind === "source") return this.Resolve(interaction, state, read("source"));

        const entry = Active(state);
        if (!entry) return this.Apply(interaction, state);

        switch (kind) {
            case "rename":
                this.Change(state, { name: read("name").slice(0, MAX_NAME_LENGTH), sourceUrl: read("url") });
                break;

            case "live":
                this.Change(state, { liveTemplate: read("template").slice(0, MAX_TEMPLATE_LENGTH) });
                break;

            case "video":
                this.Change(state, { videoTemplate: read("template").slice(0, MAX_TEMPLATE_LENGTH) });
                break;

            case "offline":
                this.Change(state, { offlineTemplate: read("template").slice(0, MAX_TEMPLATE_LENGTH) });
                break;

            case "timing":
                this.Timing(state, read("cooldown"), read("from"), read("to"));
                break;

            default:
                break;
        }

        await this.Apply(interaction, state);
    }

    private Timing(state: INotifierState, cooldown: string, from: string, to: string): void {
        const minutes = ClampNumber(Number(cooldown.replace(",", ".")), MIN_COOLDOWN, MAX_COOLDOWN);

        // Eine Ruhezeit braucht beide Enden - eine halbe ist keine.
        const valid = IsTime(from) && IsTime(to) && from !== to;

        this.Change(state, {
            cooldown: minutes,
            quietFrom: valid ? from : null,
            quietTo: valid ? to : null,
        });

        if ((from || to) && !valid) {
            state.notice = "⚠️ Ruhezeit ignoriert — beide Zeiten müssen als `HH:MM` angegeben und verschieden sein.";
        }
    }

    private async Editor(interaction: MessageComponentInteraction, state: INotifierState, kind: string): Promise<void> {
        if (!interaction.isButton()) return;

        const entry = Active(state);
        if (!entry) return;

        if (kind === "timing") {
            return this.Show(interaction, "timing", "Cooldown & Ruhezeit", [
                { id: "cooldown", label: "Cooldown in Minuten", value: String(entry.cooldown), max: 4 },
                { id: "from", label: "Ruhezeit ab (HH:MM)", value: entry.quietFrom ?? "", max: 5, required: false },
                { id: "to", label: "Ruhezeit bis (HH:MM)", value: entry.quietTo ?? "", max: 5, required: false },
            ]);
        }

        const templates: Record<string, [string, string]> = {
            live: ["Live-Nachricht", entry.liveTemplate],
            video: ["Video-Nachricht", entry.videoTemplate],
            offline: ["Nachricht nach dem Stream", entry.offlineTemplate],
        };

        const template = templates[kind];
        if (!template) return;

        await this.Show(interaction, kind, template[0], [
            {
                id: "template",
                label: "Text",
                value: template[1],
                description: "Platzhalter wie {name} oder {title} sind erlaubt",
                max: MAX_TEMPLATE_LENGTH,
                paragraph: true,
            },
        ]);
    }

    private async AskSource(interaction: MessageComponentInteraction, platform: Platform): Promise<void> {
        const hints: Record<Platform, string> = {
            youtube: "@handle, Kanal-Link oder Kanal-ID (UC…)",
            twitch: "Kanalname oder twitch.tv-Link",
        };

        await this.Show(interaction, "source", `${PLATFORM_LABEL[platform]} hinzufügen`, [
            { id: "source", label: "Kanal", value: "", description: hints[platform], max: 200 },
        ]);
    }

    private async Show(
        interaction: MessageComponentInteraction,
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

    private async Resolve(interaction: ModalSubmitInteraction, state: INotifierState, input: string): Promise<void> {
        const platform = state.platform;
        if (!platform) return this.Apply(interaction, state);

        await interaction.deferUpdate();

        const adapter = this.client.notifierService.Adapter(platform);

        if (!adapter.Ready) {
            state.notice = `⚠️ ${adapter.label} ist nicht eingerichtet: ${adapter.Hint}`;
            state.view = "add";

            return this.Refresh(interaction, state);
        }

        const resolved = await adapter.Resolve(input).catch((error) => {
            logger.warn(`[Notifier] Auflösen von "${input}" fehlgeschlagen: ${error}`);

            return null;
        });

        if (!resolved) {
            state.notice = `❌ "${input.slice(0, 80)}" konnte nicht gefunden werden. Stimmt der Link?`;
            state.view = "add";

            return this.Refresh(interaction, state);
        }

        const duplicate = state.entries.some(
            (entry) => entry.platform === platform && entry.identifier === resolved.identifier
        );

        if (duplicate) {
            state.notice = `⚠️ **${resolved.name}** wird bereits beobachtet.`;
            state.view = "home";

            return this.Refresh(interaction, state);
        }

        state.draft = {
            ...DefaultSubscription(state.guildId, platform),
            name: resolved.name.slice(0, MAX_NAME_LENGTH),
            identifier: resolved.identifier,
            sourceUrl: resolved.url,
            avatarUrl: resolved.avatarUrl,
        };

        state.view = "entry";
        state.dirty = true;
        state.notice = `✅ **${resolved.name}** gefunden — jetzt noch einen Kanal wählen und speichern.`;

        await this.Refresh(interaction, state);
    }

    private async Save(interaction: MessageComponentInteraction, state: INotifierState): Promise<void> {
        const entry = Active(state);
        if (!entry) return this.Apply(interaction, state);

        if (!entry.channelId) {
            state.notice = "⚠️ Ohne Benachrichtigungs-Kanal kann nichts gespeichert werden.";

            return this.Apply(interaction, state);
        }

        if (state.entries.length >= MAX_ENTRIES && state.draft) {
            state.notice = `⚠️ Mehr als ${MAX_ENTRIES} Kanäle gehen nicht.`;

            return this.Apply(interaction, state);
        }

        await this.client.notifierService.Save(entry);

        state.entries = await this.client.notifierService.List(state.guildId);
        state.index = state.entries.findIndex(
            (candidate) => candidate.platform === entry.platform && candidate.identifier === entry.identifier
        );

        state.draft = null;
        state.dirty = false;
        state.notice = `💾 **${entry.name}** gespeichert.`;

        await this.Apply(interaction, state);
    }

    private async Delete(interaction: MessageComponentInteraction, state: INotifierState): Promise<void> {
        const entry = Active(state);
        if (!entry) return this.Apply(interaction, state);

        // Ein Entwurf steht noch nicht in der Datenbank - da gibt es nichts zu löschen.
        if (!state.draft) await this.client.notifierService.Remove(state.guildId, entry.platform, entry.identifier);

        state.entries = await this.client.notifierService.List(state.guildId);
        state.draft = null;
        state.index = state.entries.length > 0 ? 0 : -1;
        state.dirty = false;
        state.view = "home";
        state.notice = `🗑️ **${entry.name}** entfernt.`;

        await this.Apply(interaction, state);
    }

    private async Test(interaction: MessageComponentInteraction, state: INotifierState): Promise<void> {
        const entry = Active(state);
        if (!entry?.channelId) return this.Apply(interaction, state);

        const channel = interaction.guild?.channels.cache.get(entry.channelId);

        if (!channel?.isTextBased()) {
            state.notice = "⚠️ Der eingestellte Kanal existiert nicht mehr.";

            return this.Apply(interaction, state);
        }

        const kind = SUPPORTS_LIVE[entry.platform] ? "live" : "video";
        const event: INotifierEvent = { ...PREVIEW, kind, url: entry.sourceUrl || PREVIEW.url };
        const service = this.client.notifierService;
        const content = service.Fill(kind === "live" ? entry.liveTemplate : entry.videoTemplate, service.Context(entry, event));

        // Bewusst ohne Erwähnungen: ein Testlauf soll niemanden aus dem Bett klingeln.
        const sent = await channel
            .send(BuildNotification(entry, event, content, { roles: [], users: [] }))
            .catch((error) => {
                logger.warn(`[Notifier] Testlauf fehlgeschlagen: ${error}`);

                return null;
            });

        state.notice = sent
            ? `🚀 Testlauf in <#${entry.channelId}> geschickt — Pings sind dabei abgeschaltet.`
            : "⚠️ Der Testlauf ging nicht raus. Darf der Bot in dem Kanal schreiben?";

        await this.Apply(interaction, state);
    }

    private async CheckNow(
        interaction: MessageComponentInteraction,
        state: INotifierState,
        single: boolean
    ): Promise<void> {
        await interaction.deferUpdate();

        const entry = Active(state);

        // Der lastCheck-Stempel bremst die Abfrage sonst aus - beim Knopfdruck soll sofort geprüft werden.
        if (single && entry && !state.draft) {
            await this.client.notifierService.Save({ ...entry, lastCheck: null });
        }

        const summary = await this.client.notifierService.Poll();

        state.entries = await this.client.notifierService.List(state.guildId);
        state.notice =
            `🔍 ${summary.checked} geprüft · ${summary.notified} gemeldet · ` +
            `${summary.skipped} übersprungen${summary.failed > 0 ? ` · ${summary.failed} fehlgeschlagen` : ""}`;

        await this.Refresh(interaction, state);
    }

    private async Reload(interaction: MessageComponentInteraction, state: INotifierState): Promise<void> {
        state.entries = await this.client.notifierService.List(state.guildId);
        state.draft = null;
        state.dirty = false;

        if (state.index >= state.entries.length) state.index = state.entries.length > 0 ? 0 : -1;

        await this.Apply(interaction, state);
    }

    private async Placeholders(interaction: MessageComponentInteraction): Promise<void> {
        const builder = new ComponentV2Builder({ accentColor: "#5865F2" })
            .title("🔤 | Platzhalter", "Werden beim Verschicken ersetzt")
            .separator()
            .list(PLACEHOLDERS.map((entry) => `\`${entry.token}\` — ${entry.description}`));

        builder.subtext("`{game}` und `{viewers}` gibt es nur bei Twitch und bleiben sonst leer.");

        await interaction.reply({ components: [builder.build()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    // ── Hilfen ─────────────────────────────────────────────────────────────

    // Änderungen laufen immer auf einer Kopie: solange nicht gespeichert wurde, bleibt die
    // Liste unangetastet und "Verwerfen" ist einfach ein Neuladen.
    private Change(state: INotifierState, values: Partial<INotifierSubscription>): void {
        const entry = Active(state);
        if (!entry) return;

        if (!state.draft) state.draft = { ...entry };

        Object.assign(state.draft, values);
        state.dirty = true;
    }

    private async Apply(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        state: INotifierState
    ): Promise<void> {
        const view = RenderPanel(this.client, state);

        if (interaction.isModalSubmit() || interaction.deferred || interaction.replied) {
            await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });

            return;
        }

        await interaction.update({ ...view, flags: MessageFlags.IsComponentsV2 });
    }

    private async Refresh(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        state: INotifierState
    ): Promise<void> {
        const view = RenderPanel(this.client, state);

        await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });
    }

    private Notice(title: string, message: string) {
        const builder = new ComponentV2Builder({ accentColor: "#ED4245" }).title(title).separator().text(message);

        return { components: [builder.build()], flags: MessageFlags.IsComponentsV2 as const };
    }

    private async Fail(interaction: Interaction, message: string): Promise<void> {
        if (!interaction.isRepliable()) return;

        const payload = { ...this.Notice("⚠️ | Geht gerade nicht", message), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };

        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
    }
}

import {
    ButtonInteraction,
    Events,
    ForumChannel,
    Interaction,
    LabelBuilder,
    MessageComponentInteraction,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    TextChannel,
    TextInputBuilder,
    TextInputStyle,
    ThreadChannel,
} from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import BuildTicketMessage, { TICKET_PREFIX } from "../../builder/TicketMessage";
import { BuildTranscriptDM, BuildTranscriptLog } from "../../builder/TranscriptMessage";
import LogType from "../../enums/LogType";
import TicketMode from "../../enums/TicketMode";
import TicketStatus from "../../enums/TicketStatus";
import { ITicket, IStaffNote } from "../../interfaces/services/ticket/ITicket";
import { ITicketConfig } from "../../interfaces/services/ticket/ITicketConfig";
import { IActionOption } from "../../interfaces/services/ticket/ITicketPanel";
import {
    CLOSE_ACTION,
    CLOSE_DELAY,
    Clamp,
    CONFIG_KEY,
    MayUseAction,
    IsPriority,
    MAX_ADDED_USERS,
    MAX_NOTES,
    MAX_NOTE_LENGTH,
    MAX_REASON_LENGTH,
    MAX_SLOWMODE,
    MIN_SLOWMODE,
    Number4,
    PRIORITIES,
    Priority,
} from "../../constants/Ticket";
import { Line, Mention } from "../../constants/Logging";
import { ParseDuration } from "../../utils/duration";
import logger from "../../utils/logger";

type TicketChannel = TextChannel | ThreadChannel;

const DATE_TIME = /^(\d{2})\.(\d{2})\.(\d{4})\s+([01]\d|2[0-3]):([0-5]\d)$/;

export default class TicketHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bedient das Ticket-Panel und die Team-Aktionen im Ticket",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        const component = interaction.isMessageComponent();
        if (!component && !interaction.isModalSubmit()) return;
        if (!interaction.customId.startsWith(`${TICKET_PREFIX}:`)) return;
        if (interaction.customId.startsWith("ticket:setup")) return;
        if (!interaction.guild) return;

        try {
            if (interaction.isModalSubmit()) return this.Modal(interaction);
            if (!component) return;

            const action = interaction.customId.split(":")[1];

            if (action === "open" && interaction.isAnySelectMenu()) return this.Open(interaction);
            if (action === "menu" && interaction.isAnySelectMenu()) return this.Menu(interaction);
            if (action === "pick" && interaction.isAnySelectMenu()) return this.Pick(interaction);
            if (action === "user" && interaction.isAnySelectMenu()) return this.UserPick(interaction);
            if (action === "note" && interaction.isButton()) return this.NoteButton(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Ticket: ${interaction.customId}`);
        }
    }

    private Actions(): IActionOption[] {
        return this.client.configService.Options(CONFIG_KEY, "actions").map((option) => ({
            name: option.name,
            description: option.description,
            value: option.value,
            emoji: option.emoji,
        }));
    }

    // ── Ticket öffnen ──────────────────────────────────────────────────────

    private async Open(interaction: MessageComponentInteraction): Promise<void> {
        if (!interaction.isAnySelectMenu() || !interaction.guild || !interaction.member) return;

        const service = this.client.ticketService;
        const guildId = interaction.guild.id;
        const config = await service.Config(guildId);

        // Das Menü bleibt sonst auf der Auswahl stehen und lässt sich nicht erneut benutzen.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await this.ResetPanel(interaction);

        if (!config.enabled) return this.Tell(interaction, "🔴 Das Ticket-System ist gerade abgeschaltet.");

        const blocked = await service.Blacklisted(guildId, interaction.user.id);

        if (blocked) {
            const until = blocked.expiresAt
                ? ` Die Sperre endet <t:${Math.floor(new Date(blocked.expiresAt).getTime() / 1000)}:R>.`
                : " Die Sperre gilt dauerhaft.";

            return this.Tell(interaction, `🚫 Du bist für das Ticket-System gesperrt.\n📋 **Grund:** ${blocked.reason}${until}`);
        }

        const category = service.CategoryOf(config, interaction.values[0]);

        if (!category) return this.Tell(interaction, "❌ Diese Kategorie gibt es nicht mehr.");

        if (config.maxOpenTickets > 0) {
            const open = await service.OpenCount(guildId, interaction.user.id);

            if (open >= config.maxOpenTickets) {
                return this.Tell(
                    interaction,
                    `❌ Du hast bereits **${open}** offene Tickets. Warte, bis eines davon geschlossen wurde.`
                );
            }
        }

        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) return this.Tell(interaction, "❌ Dein Mitgliedseintrag konnte nicht geladen werden.");

        const actions = this.Actions();
        const roles = service.RolesFor(config, category.name);

        const result = await service.Open(interaction.guild, member, config, category, (ticket) =>
            BuildTicketMessage(ticket, config, category, roles, actions)
        );

        if (!result) {
            return this.Tell(
                interaction,
                "❌ Das Ticket konnte nicht angelegt werden. Stimmen Forum beziehungsweise Kategorie und die Rechte des Bots?"
            );
        }

        await this.Tell(interaction, `✅ Dein Ticket steht bereit: ${result.channel}`);
    }

    // Baut das Auswahlmenü im Panel neu auf, damit es wieder benutzbar ist.
    private async ResetPanel(interaction: MessageComponentInteraction): Promise<void> {
        await interaction.message.edit({ components: interaction.message.components }).catch(() => null);
    }

    // ── Team-Aktionen ──────────────────────────────────────────────────────

    private async Menu(interaction: MessageComponentInteraction): Promise<void> {
        if (!interaction.isAnySelectMenu() || !interaction.guild) return;

        const action = interaction.values[0];
        const context = await this.Context(interaction, action);
        if (!context) return;

        const { ticket, config, channel } = context;

        // Modals müssen vor jedem Update geöffnet werden.
        const modals: Record<string, () => Promise<void>> = {
            slowmode: () =>
                this.Show(interaction, "slowmode", "Slowmode", [
                    { id: "seconds", label: "Sekunden (0 schaltet ab)", value: String(ticket.slowmode), max: 5 },
                ]),
            blacklist: () =>
                this.Show(interaction, "blacklist", "Benutzer sperren", [
                    { id: "reason", label: "Grund", value: "", max: MAX_REASON_LENGTH, paragraph: true },
                    {
                        id: "duration",
                        label: "Dauer",
                        value: "",
                        description: "z.B. 7d, 12h — leer bedeutet dauerhaft",
                        max: 10,
                        required: false,
                    },
                ]),
            close: () =>
                this.Show(interaction, "close", "Ticket schließen", [
                    {
                        id: "reason",
                        label: "Grund",
                        value: "",
                        description: "Bitte kurz begründen — steht später auf der Abschlusskarte",
                        max: MAX_REASON_LENGTH,
                        paragraph: true,
                    },
                ]),
            meeting: () =>
                this.Show(interaction, "meeting", "Termin vereinbaren", [
                    { id: "when", label: "Wann (TT.MM.JJJJ HH:MM)", value: "", max: 16 },
                    { id: "topic", label: "Thema", value: "", max: 500, paragraph: true },
                ]),
        };

        if (modals[action]) return modals[action]();

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await this.ResetPanel(interaction);

        switch (action) {
            case "claim":
                return this.Claim(interaction, context, true);
            case "unclaim":
                return this.Claim(interaction, context, false);
            case "transfer":
                return this.OfferTransfer(interaction, config, ticket);
            case "priority":
                return this.OfferPriority(interaction, ticket);
            case "anonymous":
                return this.Anonymous(interaction, context);
            case "media":
                return this.Media(interaction, channel);
            case "summary":
                return this.Summary(interaction, context);
            case "notes":
                return this.Notes(interaction, ticket);
            case "adduser":
            case "removeuser":
                return this.OfferUser(interaction, action === "adduser");
            case "freeze":
                return this.Freeze(interaction, context);
            default:
                return this.Tell(interaction, "❔ Diese Aktion kenne ich nicht.");
        }
    }

    private async Claim(
        interaction: MessageComponentInteraction,
        context: IContext,
        claim: boolean
    ): Promise<void> {
        const { ticket, config, channel } = context;
        const service = this.client.ticketService;

        if (claim && ticket.claimedById === interaction.user.id) {
            return this.Tell(interaction, "ℹ️ Du bearbeitest dieses Ticket bereits.");
        }

        if (claim && ticket.claimedById) {
            return this.Tell(interaction, `❌ <@${ticket.claimedById}> bearbeitet dieses Ticket bereits.`);
        }

        if (!claim && !ticket.claimedById) {
            return this.Tell(interaction, "ℹ️ Dieses Ticket ist gar nicht beansprucht.");
        }

        if (!claim && ticket.claimedById !== interaction.user.id && !interaction.memberPermissions?.has("Administrator")) {
            return this.Tell(interaction, "❌ Nur der Bearbeiter selbst kann das Ticket zurückgeben.");
        }

        const previous = ticket.claimedById;

        await service.Patch(ticket, {
            claimedById: claim ? interaction.user.id : null,
            // Die erste Übernahme zählt für die Reaktionszeit - eine spätere überschreibt sie nicht.
            claimedAt: claim ? (ticket.claimedAt ?? new Date()) : ticket.claimedAt,
        });

        const locked = await service.ApplyClaim(channel, config, ticket, ticket.claimedById, previous);

        await this.RefreshMain(context);

        await channel
            .send({
                content: claim
                    ? `✅ ${interaction.user} bearbeitet dieses Ticket ab jetzt.` +
                      (locked ? "\n-# Das übrige Team liest weiter mit, schreiben kann bis zur Rückgabe nur noch der Bearbeiter." : "")
                    : `↩️ ${interaction.user} hat das Ticket zurückgegeben — es ist wieder frei.`,
                allowedMentions: { parse: [] },
            })
            .catch(() => null);

        await this.Tell(interaction, claim ? "✅ Ticket übernommen." : "↩️ Ticket zurückgegeben.");
    }

    private async OfferTransfer(
        interaction: MessageComponentInteraction,
        config: ITicketConfig,
        ticket: ITicket
    ): Promise<void> {
        const others = config.categories.filter((entry) => entry.name !== ticket.categoryName);

        if (others.length === 0) return this.Tell(interaction, "❌ Es gibt keine andere Kategorie.");

        const builder = new ComponentV2Builder({ accentColor: config.accent as `#${string}` })
            .title("🔁 Ticket verschieben")
            .separator()
            .text("Wohin soll das Ticket?")
            .select({
                customId: `${TICKET_PREFIX}:pick:transfer`,
                placeholder: "📁 | Neue Kategorie …",
                options: others.map((entry) => ({
                    label: entry.name.slice(0, 100),
                    value: entry.name,
                    description: entry.description.slice(0, 100),
                    emoji: entry.emoji || undefined,
                })),
            });

        await interaction.editReply({ components: [builder.build()], flags: MessageFlags.IsComponentsV2 });
    }

    private async OfferPriority(interaction: MessageComponentInteraction, ticket: ITicket): Promise<void> {
        const current = Priority(ticket.priority);

        const builder = new ComponentV2Builder({ accentColor: current.accent as `#${string}` })
            .title("⚡ Priorität ändern")
            .separator()
            .text(`Aktuell: ${current.emoji} **${current.label}**`)
            .select({
                customId: `${TICKET_PREFIX}:pick:priority`,
                placeholder: "⚡ | Neue Priorität …",
                options: PRIORITIES.map((info) => ({
                    label: info.label,
                    value: info.id as string,
                    description: info.description,
                    emoji: info.emoji,
                })),
            });

        await interaction.editReply({ components: [builder.build()], flags: MessageFlags.IsComponentsV2 });
    }

    private async OfferUser(interaction: MessageComponentInteraction, add: boolean): Promise<void> {
        const builder = new ComponentV2Builder({ accentColor: "#5865F2" })
            .title(add ? "➕ Benutzer hinzufügen" : "➖ Benutzer entfernen")
            .separator()
            .text(add ? "Wen soll ich ins Ticket holen?" : "Wen soll ich aus dem Ticket entfernen?")
            .userSelect({
                customId: `${TICKET_PREFIX}:user:${add ? "add" : "remove"}`,
                placeholder: "👤 | Person wählen …",
            });

        await interaction.editReply({ components: [builder.build()], flags: MessageFlags.IsComponentsV2 });
    }

    private async Anonymous(interaction: MessageComponentInteraction, context: IContext): Promise<void> {
        const next = !context.ticket.anonymous;

        await this.client.ticketService.Patch(context.ticket, { anonymous: next });
        await this.RefreshMain(context);

        await this.Tell(
            interaction,
            next
                ? "🛡️ Anonymer Modus **an** — deine Nachrichten erscheinen ab jetzt unter einem Team-Alias."
                : "🔓 Anonymer Modus **aus** — du schreibst wieder unter deinem Namen."
        );
    }

    private async Media(interaction: MessageComponentInteraction, channel: TicketChannel): Promise<void> {
        const messages = await this.client.ticketService.History(channel);

        const images = messages.flatMap((message) =>
            [...message.attachments.values()]
                .filter((file) => (file.contentType ?? "").startsWith("image/"))
                .map((file) => ({ url: file.url, author: message.author.tag, name: file.name }))
        );

        if (images.length === 0) return this.Tell(interaction, "🖼️ In diesem Ticket wurden noch keine Bilder hochgeladen.");

        const builder = new ComponentV2Builder({ accentColor: "#5865F2" })
            .title("🖼️ Medien-Tresor", `${images.length} Bild(er) in diesem Ticket`)
            .separator()
            .list(images.slice(0, 15).map((image, index) => `\`${index + 1}.\` [${image.name}](${image.url}) — von \`${image.author}\``));

        // Die Galerie fasst höchstens zehn Bilder, der Rest steht als Liste darüber.
        builder.gallery(...images.slice(0, 10).map((image) => image.url));

        await interaction.editReply({ components: [builder.build()], flags: MessageFlags.IsComponentsV2 });
    }

    private async Summary(interaction: MessageComponentInteraction, context: IContext): Promise<void> {
        const { ticket } = context;
        const messages = await this.client.ticketService.History(context.channel);
        const priority = Priority(ticket.priority);

        const people = [...new Set(messages.filter((message) => !message.author.bot).map((message) => message.author.id))];
        const last = messages.filter((message) => !message.author.bot).at(-1);

        const builder = new ComponentV2Builder({ accentColor: priority.accent as `#${string}` })
            .title(`📖 Ticket #${Number4(ticket.ticketNumber)}`, ticket.categoryName)
            .separator()
            .text(
                `👤 **Ersteller:** <@${ticket.creatorId}>\n` +
                    `🙋 **Bearbeiter:** ${ticket.claimedById ? `<@${ticket.claimedById}>` : "_niemand_"}\n` +
                    `⚡ **Priorität:** ${priority.emoji} ${priority.label}\n` +
                    `💬 **Nachrichten:** ${messages.length}\n` +
                    `👥 **Beteiligt:** ${people.length}\n` +
                    `🕐 **Geöffnet:** <t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R>` +
                    (last ? `\n✍️ **Letzte Nachricht:** <t:${Math.floor(last.createdTimestamp / 1000)}:R> von ${last.author}` : "")
            );

        if (ticket.staffNotes.length > 0) {
            builder.separator();
            builder.text(
                `📝 **Team-Notizen**\n${ticket.staffNotes
                    .slice(-3)
                    .map((note) => `> **${note.staffName}:** ${note.note.slice(0, 150)}`)
                    .join("\n")}`
            );
        }

        await interaction.editReply({ components: [builder.build()], flags: MessageFlags.IsComponentsV2 });
    }

    private async Notes(interaction: MessageComponentInteraction, ticket: ITicket): Promise<void> {
        const builder = new ComponentV2Builder({ accentColor: "#5865F2" })
            .title("📝 Team-Notizen", `Ticket #${Number4(ticket.ticketNumber)}`)
            .separator()
            .text(
                ticket.staffNotes.length > 0
                    ? ticket.staffNotes
                          .map(
                              (note, index) =>
                                  `\`${index + 1}.\` **${note.staffName}** · <t:${Math.floor(new Date(note.createdAt).getTime() / 1000)}:R>\n> ${note.note}`
                          )
                          .join("\n\n")
                    : "_Noch keine Notizen._"
            );

        builder.subtext("Notizen sind intern und stehen nur im Ticket-Log, nie in der Nachricht an den Ersteller.");

        builder.buttons(
            {
                customId: `${TICKET_PREFIX}:note:add`,
                label: "Notiz hinzufügen",
                emoji: "➕",
                tone: "success",
                disabled: ticket.staffNotes.length >= MAX_NOTES,
            },
            {
                customId: `${TICKET_PREFIX}:note:clear`,
                label: "Alle löschen",
                emoji: "🗑️",
                tone: "danger",
                disabled: ticket.staffNotes.length === 0,
            }
        );

        await interaction.editReply({ components: [builder.build()], flags: MessageFlags.IsComponentsV2 });
    }

    private async Freeze(interaction: MessageComponentInteraction, context: IContext): Promise<void> {
        const next = !context.ticket.frozen;

        await this.client.ticketService.Freeze(context.channel, context.ticket, next);
        await this.client.ticketService.Patch(context.ticket, { frozen: next });
        await this.RefreshMain(context);

        await context.channel
            .send({
                content: next
                    ? "🥶 Das Ticket wurde eingefroren — der Ersteller kann vorerst nicht schreiben."
                    : "🔥 Das Ticket ist wieder aufgetaut.",
                allowedMentions: { parse: [] },
            })
            .catch(() => null);

        await this.Tell(interaction, next ? "🥶 Eingefroren." : "🔥 Aufgetaut.");
    }

    // ── Schliessen ─────────────────────────────────────────────────────────

    private async Close(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        context: IContext,
        reason: string
    ): Promise<void> {
        const { ticket, config, channel } = context;
        const service = this.client.ticketService;

        await this.Tell(interaction, "⏳ Transcript wird erstellt …");

        const transcript = await service.CreateTranscript(channel, ticket, interaction.user);

        if (!transcript) {
            return this.Tell(interaction, "❌ Das Transcript konnte nicht erstellt werden — das Ticket bleibt offen.");
        }

        await service.Patch(ticket, { status: TicketStatus.CLOSED, closedAt: new Date() });

        // Die Karte zeigt Namen, keine Erwähnungen - ein Bild löst <@id> nicht auf.
        const creator = await this.client.users.fetch(ticket.creatorId).catch(() => null);
        const handler = ticket.claimedById
            ? await this.client.users.fetch(ticket.claimedById).catch(() => null)
            : null;

        const payload = {
            guild: interaction.guild!,
            ticket,
            closedBy: interaction.user,
            creator,
            handler,
            transcript,
            channelName: channel.name,
            reason,
        };

        // Der Ersteller sieht vom Abschluss sonst nichts - Kanal wie Beitrag sind
        // kurz darauf gelöscht.
        await creator?.send(await BuildTranscriptDM(payload)).catch(() => null);

        // Die Abschlussnachricht ist der Log-Eintrag: sie steht im Ticket-Log aus dem
        // Logging-Setup. Eine zweite, kurze Meldung daneben sagt nichts Neues.
        const log = await this.client.loggingService.Target(ticket.guildId, LogType.TICKET);
        const target = log ? await this.client.loggingService.Writable(log.channelId) : null;

        if (target) {
            await target.send(await BuildTranscriptLog(payload)).catch((error) =>
                logger.warn(`[Ticket] Transcript-Nachricht fehlgeschlagen: ${error}`)
            );
        }

        await channel
            .send({
                content:
                    `🔒 Dieses Ticket wurde von ${interaction.user} geschlossen.\n` +
                    `📋 **Grund:** ${reason}\n` +
                    `-# ${ticket.mode === TicketMode.CATEGORY ? "Der Kanal" : "Der Beitrag"} verschwindet in ` +
                    `${CLOSE_DELAY / 1000} Sekunden. Das Transcript liegt bereits im Archiv.`,
                allowedMentions: { parse: [] },
            })
            .catch(() => null);

        setTimeout(() => {
            service.Close(channel, ticket).catch((error) => logger.warn(`[Ticket] Schliessen: ${error}`));
        }, CLOSE_DELAY).unref();
    }

    // ── Folgeauswahl ───────────────────────────────────────────────────────

    private async Pick(interaction: MessageComponentInteraction): Promise<void> {
        if (!interaction.isAnySelectMenu()) return;

        const kind = interaction.customId.split(":")[2];
        const context = await this.Context(interaction);
        if (!context) return;

        await interaction.deferUpdate();

        const value = interaction.values[0];
        const { ticket, config, channel } = context;

        if (kind === "transfer") {
            const category = this.client.ticketService.CategoryOf(config, value);
            if (!category) return;

            await this.client.ticketService.Patch(ticket, {
                categoryName: category.name,
                priority: category.priority,
            });

            await this.ApplyForumTags(channel, ticket);
            await this.RefreshMain(context);

            await channel
                .send({ content: `🔁 Verschoben nach **${category.name}** von ${interaction.user}.`, allowedMentions: { parse: [] } })
                .catch(() => null);
        }

        if (kind === "priority" && IsPriority(value)) {
            await this.client.ticketService.Patch(ticket, { priority: value });

            await this.ApplyForumTags(channel, ticket);
            await this.RefreshMain(context);

            const info = Priority(value);

            await channel
                .send({ content: `⚡ Priorität auf ${info.emoji} **${info.label}** gesetzt.`, allowedMentions: { parse: [] } })
                .catch(() => null);
        }

        await interaction.editReply({ ...this.Done("✅ Erledigt."), flags: MessageFlags.IsComponentsV2 });
    }

    private async UserPick(interaction: MessageComponentInteraction): Promise<void> {
        if (!interaction.isAnySelectMenu()) return;

        const add = interaction.customId.split(":")[2] === "add";
        const context = await this.Context(interaction);
        if (!context) return;

        await interaction.deferUpdate();

        const userId = interaction.values[0];
        const { ticket, channel } = context;

        if (add && ticket.addedUsers.length >= MAX_ADDED_USERS) {
            return this.Edit(interaction, `⚠️ Mehr als ${MAX_ADDED_USERS} zusätzliche Nutzer gehen nicht.`);
        }

        if (!add && userId === ticket.creatorId) {
            return this.Edit(interaction, "❌ Der Ersteller kann nicht aus seinem eigenen Ticket entfernt werden.");
        }

        const ok = add
            ? await this.client.ticketService.AddUser(channel, userId)
            : await this.client.ticketService.RemoveUser(channel, userId);

        if (!ok) return this.Edit(interaction, "❌ Das hat nicht geklappt — fehlen dem Bot die Rechte?");

        await this.client.ticketService.Patch(ticket, {
            addedUsers: add
                ? [...new Set([...ticket.addedUsers, userId])]
                : ticket.addedUsers.filter((entry) => entry !== userId),
        });

        await this.RefreshMain(context);

        await channel
            .send({
                content: add ? `➕ <@${userId}> wurde zum Ticket hinzugefügt.` : `➖ <@${userId}> wurde entfernt.`,
                allowedMentions: { users: add ? [userId] : [] },
            })
            .catch(() => null);

        await this.Edit(interaction, add ? "➕ Hinzugefügt." : "➖ Entfernt.");
    }

    private async NoteButton(interaction: ButtonInteraction): Promise<void> {
        const kind = interaction.customId.split(":")[2];
        const context = await this.Context(interaction);
        if (!context) return;

        if (kind === "add") {
            return this.Show(interaction, "note", "Team-Notiz", [
                { id: "note", label: "Notiz", value: "", max: MAX_NOTE_LENGTH, paragraph: true },
            ]);
        }

        await interaction.deferUpdate();
        await this.client.ticketService.Patch(context.ticket, { staffNotes: [] });
        await this.RefreshMain(context);
        await this.Edit(interaction, "🗑️ Alle Notizen gelöscht.");
    }

    // ── Modals ─────────────────────────────────────────────────────────────

    private async Modal(interaction: ModalSubmitInteraction): Promise<void> {
        const kind = interaction.customId.split(":")[2];
        const context = await this.Context(interaction, kind);
        if (!context) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const read = (id: string) => interaction.fields.getTextInputValue(id).trim();
        const { ticket, channel } = context;

        if (kind === CLOSE_ACTION) {
            const reason = read("reason").trim().slice(0, MAX_REASON_LENGTH);

            if (!reason) {
                return this.Tell(interaction, "❌ Ohne Grund wird nicht geschlossen — bitte kurz begründen.");
            }

            return this.Close(interaction, context, reason);
        }

        if (kind === "slowmode") {
            const seconds = Clamp(Number(read("seconds")), MIN_SLOWMODE, MAX_SLOWMODE);

            await channel.setRateLimitPerUser(seconds, `Slowmode durch ${interaction.user.tag}`).catch(() => null);
            await this.client.ticketService.Patch(ticket, { slowmode: seconds });
            await this.RefreshMain(context);

            return this.Tell(
                interaction,
                seconds > 0 ? `⏱️ Slowmode auf ${seconds} Sekunden gesetzt.` : "⏱️ Slowmode abgeschaltet."
            );
        }

        if (kind === "note") {
            const note: IStaffNote = {
                id: `${Date.now().toString(36)}`,
                staffId: interaction.user.id,
                staffName: interaction.user.username,
                note: read("note").slice(0, MAX_NOTE_LENGTH),
                createdAt: new Date().toISOString(),
            };

            await this.client.ticketService.Patch(ticket, {
                staffNotes: [...ticket.staffNotes, note].slice(-MAX_NOTES),
            });

            await this.RefreshMain(context);

            return this.Tell(interaction, "📝 Notiz gespeichert.");
        }

        if (kind === "blacklist") {
            const duration = read("duration");
            const parsed = duration ? ParseDuration(duration) : null;

            if (duration && !parsed) {
                return this.Tell(interaction, '⚠️ Die Dauer muss wie `7d`, `12h` oder `30m` aussehen.');
            }

            await this.client.ticketService.Blacklist({
                guildId: ticket.guildId,
                userId: ticket.creatorId,
                reason: read("reason").slice(0, MAX_REASON_LENGTH) || "Kein Grund angegeben",
                moderatorId: interaction.user.id,
                expiresAt: parsed ? new Date(Date.now() + parsed) : null,
                createdAt: new Date(),
            });

            await this.client.loggingService.Send(ticket.guildId, {
                type: LogType.TICKET,
                title: "Nutzer für Tickets gesperrt",
                description: [
                    Line("👤", "Nutzer", Mention(ticket.creatorId)),
                    Line("👮", "Von", Mention(interaction.user.id, interaction.user.tag)),
                    Line("📋", "Grund", read("reason") || "kein Grund angegeben"),
                    Line("⏳", "Bis", parsed ? `<t:${Math.floor((Date.now() + parsed) / 1000)}:f>` : "dauerhaft"),
                ].join("\n"),
            });

            return this.Tell(
                interaction,
                `🚫 <@${ticket.creatorId}> ist gesperrt${parsed ? ` — bis <t:${Math.floor((Date.now() + parsed) / 1000)}:R>` : " (dauerhaft)"}.`
            );
        }

        if (kind === "meeting") {
            const match = DATE_TIME.exec(read("when"));

            if (!match) return this.Tell(interaction, "⚠️ Bitte im Format `TT.MM.JJJJ HH:MM` angeben.");

            const [, day, month, year, hour, minute] = match;
            const when = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));

            if (Number.isNaN(when.getTime())) return this.Tell(interaction, "⚠️ Das ist kein gültiges Datum.");
            if (when.getTime() <= Date.now()) return this.Tell(interaction, "⚠️ Der Termin liegt in der Vergangenheit.");

            await this.client.ticketService.Patch(ticket, {
                meeting: {
                    scheduledAt: when.toISOString(),
                    description: read("topic").slice(0, 500),
                    reminderSent: false,
                    confirmed: true,
                },
            });

            await this.RefreshMain(context);

            await channel
                .send({
                    content:
                        `📅 **Termin vereinbart:** <t:${Math.floor(when.getTime() / 1000)}:F> (<t:${Math.floor(when.getTime() / 1000)}:R>)\n` +
                        `📝 ${read("topic")}\n-# Alle Beteiligten bekommen zum Termin eine Erinnerung.`,
                    allowedMentions: { parse: [] },
                })
                .catch(() => null);

            return this.Tell(interaction, "📅 Termin eingetragen.");
        }
    }

    private async Show(
        interaction: MessageComponentInteraction,
        kind: string,
        title: string,
        fields: Array<{ id: string; label: string; value: string; description?: string; max?: number; required?: boolean; paragraph?: boolean }>
    ): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId(`${TICKET_PREFIX}:modal:${kind}`)
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

    // ── Hilfen ─────────────────────────────────────────────────────────────

    private async Context(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        action?: string
    ): Promise<IContext | null> {
        const channel = interaction.channel;

        if (!interaction.guild || !channel?.isTextBased() || channel.isDMBased()) return null;

        const ticket = await this.client.ticketService.Get(channel.id);

        if (!ticket) {
            await this.Reply(interaction, "❌ Zu diesem Kanal gibt es kein Ticket.");

            return null;
        }

        const config = await this.client.ticketService.Config(ticket.guildId);
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

        const isSupporter = Boolean(member && this.client.ticketService.IsSupporter(member, config));
        const isCreator = interaction.user.id === ticket.creatorId;

        // Das Menü hängt an der Hauptnachricht und ist damit auch für den Ersteller sichtbar.
        // Er darf genau eine Aktion: sein eigenes Ticket schliessen. Alles andere bleibt beim Team.
        if (!member || !MayUseAction(action, isSupporter, isCreator)) {
            await this.Reply(
                interaction,
                isCreator
                    ? "❌ Diese Aktion ist dem Support-Team vorbehalten — schließen darfst du dein Ticket selbst."
                    : "❌ Die Team-Aktionen sind dem Support-Team vorbehalten."
            );

            return null;
        }

        return { ticket, config, channel: channel as TicketChannel, isSupporter };
    }

    private async ApplyForumTags(channel: TicketChannel, ticket: ITicket): Promise<void> {
        if (!channel.isThread()) return;

        const thread = channel as ThreadChannel;
        const parent = thread.parent;

        if (!parent || parent.type !== 15) return;

        const tags = this.client.ticketService.MatchTags(parent as ForumChannel, ticket.priority);

        if (tags.length > 0) await thread.setAppliedTags(tags).catch(() => null);
    }

    private async RefreshMain(context: IContext): Promise<void> {
        const { ticket, config, channel } = context;
        if (!ticket.mainMessageId) return;

        const message = await channel.messages.fetch(ticket.mainMessageId).catch(() => null);
        if (!message?.editable) return;

        const category = this.client.ticketService.CategoryOf(config, ticket.categoryName);
        const roles = this.client.ticketService.RolesFor(config, ticket.categoryName);
        const built = BuildTicketMessage(ticket, config, category, roles, this.Actions());

        await message
            .edit({ components: built.components ?? [], flags: MessageFlags.IsComponentsV2 })
            .catch(() => null);
    }

    private Done(message: string) {
        const builder = new ComponentV2Builder({ accentColor: "#57F287" }).text(message);

        return { components: [builder.build()] };
    }

    private async Tell(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        message: string
    ): Promise<void> {
        await interaction.editReply({ ...this.Done(message), flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    private async Edit(interaction: MessageComponentInteraction, message: string): Promise<void> {
        await interaction.editReply({ ...this.Done(message), flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    private async Reply(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        message: string
    ): Promise<void> {
        const payload = { ...this.Done(message), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };

        if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
    }
}

interface IContext {
    ticket: ITicket;
    config: ITicketConfig;
    channel: TicketChannel;
    isSupporter: boolean;
}

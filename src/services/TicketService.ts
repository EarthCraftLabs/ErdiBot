import path from "path";
import { mkdir, writeFile } from "node:fs/promises";
import {
    ChannelType,
    Collection,
    ForumChannel,
    Guild,
    GuildMember,
    Message,
    PermissionFlagsBits,
    TextChannel,
    ThreadChannel,
    User,
} from "discord.js";
import { ExportReturnType, generateFromMessages } from "discord-transcripts-v2";
import BotClient from "../client/BotClient";
import LogType from "../enums/LogType";
import TicketMode from "../enums/TicketMode";
import TicketPriority from "../enums/TicketPriority";
import TicketStatus from "../enums/TicketStatus";
import { ITicket } from "../interfaces/services/ticket/ITicket";
import ITicketRecord from "../interfaces/services/ticket/ITicketRecord";
import { ITicketCategory, ITicketConfig } from "../interfaces/services/ticket/ITicketConfig";
import ITicketBlacklist from "../interfaces/services/ticket/ITicketBlacklist";
import ITicketTranscript from "../interfaces/services/ticket/ITicketTranscript";
import {
    ALL_ROLES,
    DefaultConfig,
    GenerateTranscriptId,
    NormalizeConfig,
    NormalizeTicket,
    Number4,
    Priority,
    ResponsibleRoles,
} from "../constants/Ticket";
import { Line, Mention } from "../constants/Logging";
import logger from "../utils/logger";

export const TRANSCRIPT_ROOT = path.join(process.cwd(), "public", "transcripts");

const MESSAGE_PAGE = 100;
const MAX_TRANSCRIPT_MESSAGES = 5_000;

const TICKET_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
];

// Im Kategorie-Modus soll niemand aus dem Ticket heraus einen Thread aufmachen -
// der würde die Rechte des Kanals erben und wäre im Transcript nicht enthalten.
const THREAD_PERMISSIONS = [
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.CreatePrivateThreads,
    PermissionFlagsBits.SendMessagesInThreads,
];

export interface ITranscriptResult {
    transcriptId: string;
    url: string;
    messageCount: number;
    participants: string[];
}

export interface IOpenResult {
    ticket: ITicket;
    channel: TextChannel | ThreadChannel;
}

export default class TicketService {
    client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    async Initialize(): Promise<void> {
        await mkdir(TRANSCRIPT_ROOT, { recursive: true }).catch(() => null);

        logger.info("🎫 Ticket-System bereit");
    }

    // ── Konfiguration ──────────────────────────────────────────────────────

    async Config(guildId: string): Promise<ITicketConfig> {
        const row = await this.Configs().FindOne({ guildId }).catch(() => null);

        return row ? NormalizeConfig(row, guildId) : DefaultConfig(guildId);
    }

    async SaveConfig(config: ITicketConfig): Promise<void> {
        const values = { ...config, updatedAt: new Date() };
        const configs = this.Configs();

        const updated = await configs.Update({ guildId: config.guildId }, values);

        if (updated === 0) await configs.Insert(values);
    }

    // Ein Zähler, der von zwei gleichzeitigen Tickets gelesen und geschrieben wird, vergibt
    // dieselbe Nummer zweimal. LAST_INSERT_ID macht Erhöhen und Auslesen zu einem Schritt.
    async NextNumber(guildId: string): Promise<number> {
        const result = await this.client.database.Run(
            "UPDATE `ticket_config` SET `ticket_counter` = LAST_INSERT_ID(`ticket_counter` + 1) WHERE `guild_id` = ?",
            [guildId]
        );

        if (result.affectedRows > 0 && result.insertId > 0) return result.insertId;

        // Kein Konfigurationseintrag: dann zählt die höchste vergebene Nummer.
        const tickets = await this.Tickets().Find({ guildId }, { orderBy: { ticketNumber: "DESC" }, limit: 1 });

        return (tickets[0]?.ticketNumber ?? 0) + 1;
    }

    // ── Tickets ────────────────────────────────────────────────────────────

    async Get(channelId: string): Promise<ITicket | null> {
        const row = await this.Tickets().FindOne({ channelId }).catch(() => null);

        return row ? NormalizeTicket(row, row.guildId) : null;
    }

    async OpenCount(guildId: string, creatorId: string): Promise<number> {
        return this.Tickets().Count({ guildId, creatorId, status: TicketStatus.OPEN });
    }

    async Patch(ticket: ITicket, values: Partial<ITicketRecord>): Promise<void> {
        Object.assign(ticket, values);

        await this.Tickets()
            .Update({ channelId: ticket.channelId }, values)
            .catch((error) => logger.error(`[Ticket] Konnte Ticket nicht speichern: ${error}`));
    }

    // ── Blacklist ──────────────────────────────────────────────────────────

    // Gibt den Eintrag zurück, wenn er noch gilt. Abgelaufene Sperren werden dabei
    // gleich entfernt, damit der Nutzer nicht bis zum nächsten Wartungslauf wartet.
    async Blacklisted(guildId: string, userId: string): Promise<ITicketBlacklist | null> {
        const entry = await this.Blacklists().FindOne({ guildId, userId }).catch(() => null);

        if (!entry) return null;

        if (entry.expiresAt && new Date(entry.expiresAt) <= new Date()) {
            await this.Blacklists().Delete({ guildId, userId }).catch(() => null);

            return null;
        }

        return entry;
    }

    async Blacklist(entry: ITicketBlacklist): Promise<void> {
        const blacklists = this.Blacklists();
        const updated = await blacklists.Update({ guildId: entry.guildId, userId: entry.userId }, entry);

        if (updated === 0) await blacklists.Insert(entry);
    }

    // ── Ticket öffnen ──────────────────────────────────────────────────────

    async Open(
        guild: Guild,
        member: GuildMember,
        config: ITicketConfig,
        category: ITicketCategory,
        buildMessage: (ticket: ITicket) => Parameters<TextChannel["send"]>[0]
    ): Promise<IOpenResult | null> {
        const number = await this.NextNumber(guild.id);
        const roles = ResponsibleRoles(config, category.name);
        const priority = Priority(category.priority);

        const channel =
            config.mode === TicketMode.CATEGORY
                ? await this.CreateChannel(guild, member, config, number, roles)
                : await this.CreateThread(guild, member, config, category, number);

        if (!channel) return null;

        const ticket: ITicket = {
            channelId: channel.id,
            guildId: guild.id,
            ticketNumber: number,
            creatorId: member.id,
            categoryName: category.name,
            mode: config.mode,
            priority: category.priority,
            status: TicketStatus.OPEN,
            claimedById: null,
            claimedAt: null,
            mainMessageId: null,
            anonymous: false,
            frozen: false,
            slowmode: 0,
            staffNotes: [],
            addedUsers: [],
            meeting: null,
            createdAt: new Date(),
            closedAt: null,
        };

        const main = await channel.send(buildMessage(ticket)).catch((error) => {
            logger.error(`[Ticket] Hauptnachricht fehlgeschlagen: ${error}`);

            return null;
        });

        ticket.mainMessageId = main?.id ?? null;

        await this.Tickets().Insert(ticket);

        // Erst pinnen, wenn die Nachricht steht - im Forum ist der erste Beitrag ohnehin oben.
        if (main && config.mode === TicketMode.CATEGORY) await main.pin().catch(() => null);

        await this.Announce(guild, ticket, channel, category, roles);

        if (priority.alerts) await this.AlertStaff(guild, ticket, channel, roles);

        return { ticket, channel };
    }

    private async CreateChannel(
        guild: Guild,
        member: GuildMember,
        config: ITicketConfig,
        number: number,
        roles: string[]
    ): Promise<TextChannel | null> {
        const parent = config.categoryChannelId
            ? await guild.channels.fetch(config.categoryChannelId).catch(() => null)
            : null;

        if (!parent || parent.type !== ChannelType.GuildCategory) return null;

        return guild.channels
            .create({
                name: `ticket-${Number4(number)}-${member.user.username}`.toLowerCase().slice(0, 100),
                type: ChannelType.GuildText,
                parent: parent.id,
                reason: `Ticket #${Number4(number)} von ${member.user.tag}`,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, ...THREAD_PERMISSIONS] },
                    { id: member.id, allow: TICKET_PERMISSIONS },
                    ...roles.map((roleId) => ({ id: roleId, allow: TICKET_PERMISSIONS })),
                ],
            })
            .catch((error) => {
                logger.error(`[Ticket] Kanal konnte nicht erstellt werden: ${error}`);

                return null;
            });
    }

    private async CreateThread(
        guild: Guild,
        member: GuildMember,
        config: ITicketConfig,
        category: ITicketCategory,
        number: number
    ): Promise<ThreadChannel | null> {
        const forum = config.forumChannelId ? await guild.channels.fetch(config.forumChannelId).catch(() => null) : null;

        if (!forum || forum.type !== ChannelType.GuildForum) return null;

        const priority = Priority(category.priority);
        const tags = this.MatchTags(forum as ForumChannel, category.priority);

        const thread = await (forum as ForumChannel).threads
            .create({
                name: `${priority.emoji} #${Number4(number)} · ${category.name} · ${member.user.username}`.slice(0, 100),
                autoArchiveDuration: 10080,
                appliedTags: tags,
                reason: `Ticket #${Number4(number)} von ${member.user.tag}`,
                message: { content: `<@${member.id}>` },
            })
            .catch((error) => {
                logger.error(`[Ticket] Forum-Beitrag konnte nicht erstellt werden: ${error}`);

                return null;
            });

        // Der Startbeitrag dient nur dazu, den Ersteller in den Thread zu holen.
        if (thread) await thread.messages.fetch({ limit: 1 }).then((found) => found.first()?.delete()).catch(() => null);

        return thread;
    }

    // Sucht im Forum den Tag, der zur Priorität passt - über den Namen oder die ID.
    MatchTags(forum: ForumChannel, priority: TicketPriority): string[] {
        const info = Priority(priority);

        const tag = forum.availableTags.find(
            (entry) =>
                entry.name.toLowerCase() === info.label.toLowerCase() ||
                entry.name.toLowerCase() === String(priority).toLowerCase()
        );

        return tag ? [tag.id] : [];
    }

    private async Announce(
        guild: Guild,
        ticket: ITicket,
        channel: TextChannel | ThreadChannel,
        category: ITicketCategory,
        roles: string[]
    ): Promise<void> {
        // Der Ping geht als eigene, sofort gelöschte Nachricht raus: die Hauptnachricht ist
        // ComponentsV2 und trägt kein content, würde also niemanden erreichen.
        const mentions = [`<@${ticket.creatorId}>`, ...roles.map((roleId) => `<@&${roleId}>`)].join(" ");

        const ping = await channel
            .send({ content: mentions, allowedMentions: { users: [ticket.creatorId], roles } })
            .catch(() => null);

        if (ping) setTimeout(() => ping.delete().catch(() => null), 1_500).unref();

        await this.client.loggingService.Send(guild.id, {
            type: LogType.TICKET,
            title: "Ticket geöffnet",
            description: [
                Line("🎫", "Ticket", `#${Number4(ticket.ticketNumber)} — ${channel}`),
                Line("👤", "Ersteller", Mention(ticket.creatorId)),
                Line("📁", "Kategorie", category.name),
                Line("⚡", "Priorität", `${Priority(ticket.priority).emoji} ${Priority(ticket.priority).label}`),
            ].join("\n"),
        });
    }

    // Bei hoher und kritischer Priorität wird das zuständige Team zusätzlich per
    // Direktnachricht geweckt - ein Ping im Kanal wird nachts gern übersehen.
    private async AlertStaff(
        guild: Guild,
        ticket: ITicket,
        channel: TextChannel | ThreadChannel,
        roles: string[]
    ): Promise<void> {
        const info = Priority(ticket.priority);
        const members = await guild.members.fetch().catch(() => null);

        if (!members) return;

        const targets = members.filter(
            (member) => !member.user.bot && roles.some((roleId) => member.roles.cache.has(roleId))
        );

        const text =
            `${info.emoji} **Ticket mit Priorität „${info.label}"**\n\n` +
            `🎫 **Nummer:** \`#${Number4(ticket.ticketNumber)}\`\n` +
            `👤 **Ersteller:** <@${ticket.creatorId}>\n` +
            `📁 **Kategorie:** \`${ticket.categoryName}\`\n` +
            `🏠 **Server:** ${guild.name}\n\n` +
            `➡️ ${channel.url}`;

        for (const member of targets.values()) {
            await member.send({ content: text, allowedMentions: { parse: [] } }).catch(() => null);
        }
    }

    // ── Rechte ─────────────────────────────────────────────────────────────

    // Beanspruchtes Ticket: das restliche Team liest weiter mit, schreiben darf nur noch
    // der Bearbeiter. Nur in echten Kanälen möglich - ein Forum-Beitrag hat keine eigenen
    // Overwrites, er erbt die des Forums.
    async ApplyClaim(
        channel: TextChannel | ThreadChannel,
        config: ITicketConfig,
        ticket: ITicket,
        claimedById: string | null,
        previousId: string | null = null
    ): Promise<boolean> {
        if (channel.isThread()) return false;

        const target = channel as TextChannel;

        for (const roleId of ResponsibleRoles(config, ticket.categoryName)) {
            await target.permissionOverwrites.edit(roleId, { SendMessages: claimedById === null }).catch(() => null);
        }

        if (previousId && previousId !== claimedById) {
            await target.permissionOverwrites.delete(previousId).catch(() => null);
        }

        if (claimedById) {
            await target.permissionOverwrites
                .edit(claimedById, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                })
                .catch(() => null);
        }

        return true;
    }

    async AddUser(channel: TextChannel | ThreadChannel, userId: string): Promise<boolean> {
        if (channel.isThread()) {
            return (await (channel as ThreadChannel).members.add(userId).catch(() => null)) !== null;
        }

        const done = await (channel as TextChannel).permissionOverwrites
            .edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true })
            .catch(() => null);

        return done !== null;
    }

    async RemoveUser(channel: TextChannel | ThreadChannel, userId: string): Promise<boolean> {
        if (channel.isThread()) {
            return (await (channel as ThreadChannel).members.remove(userId).catch(() => null)) !== null;
        }

        const done = await (channel as TextChannel).permissionOverwrites.delete(userId).catch(() => null);

        return done !== null;
    }

    async Freeze(channel: TextChannel | ThreadChannel, ticket: ITicket, frozen: boolean): Promise<void> {
        if (channel.isThread()) {
            await (channel as ThreadChannel).setLocked(frozen, "Ticket eingefroren").catch(() => null);

            return;
        }

        await (channel as TextChannel).permissionOverwrites
            .edit(ticket.creatorId, { SendMessages: !frozen })
            .catch(() => null);
    }

    // ── Transcript ─────────────────────────────────────────────────────────

    // Holt den kompletten Verlauf. Discord liefert höchstens 100 Nachrichten pro Anfrage,
    // also seitenweise rückwärts, bis nichts mehr kommt.
    async History(channel: TextChannel | ThreadChannel): Promise<Message[]> {
        const all: Message[] = [];
        let before: string | undefined;

        while (all.length < MAX_TRANSCRIPT_MESSAGES) {
            const page: Collection<string, Message> = await channel.messages
                .fetch({ limit: MESSAGE_PAGE, before })
                .catch(() => new Collection<string, Message>());

            if (page.size === 0) break;

            all.push(...page.values());
            before = page.last()?.id;

            if (page.size < MESSAGE_PAGE) break;
        }

        return all.reverse();
    }

    async CreateTranscript(
        channel: TextChannel | ThreadChannel,
        ticket: ITicket,
        closedBy: User
    ): Promise<ITranscriptResult | null> {
        const messages = await this.History(channel);
        const transcriptId = await this.UniqueTranscriptId();

        // Die Bibliothek erwartet einen engeren Thread-Typ als discord.js hier liefert.
        // Für Kopfzeile und Servername reicht ihr jeder Kanal - der Cast ist harmlos.
        const source = channel as unknown as Parameters<typeof generateFromMessages>[1];

        const buffer = await generateFromMessages(messages, source, {
            returnType: ExportReturnType.Buffer,
            saveImages: true,
            poweredBy: false,
            filename: `transcript-${transcriptId}.html`,
        }).catch((error) => {
            logger.error(`[Ticket] Transcript fehlgeschlagen: ${error}`);

            return null;
        });

        if (!buffer) return null;

        const file = path.join(TRANSCRIPT_ROOT, `${transcriptId}.html`);

        await mkdir(TRANSCRIPT_ROOT, { recursive: true }).catch(() => null);
        await writeFile(file, buffer);

        const participants = [
            ...new Set(messages.filter((message) => !message.author.bot).map((message) => message.author.id)),
        ];

        await this.Transcripts().Insert({
            transcriptId,
            guildId: ticket.guildId,
            channelId: ticket.channelId,
            ticketNumber: ticket.ticketNumber,
            creatorId: ticket.creatorId,
            closedById: closedBy.id,
            messageCount: messages.length,
            participantCount: participants.length,
            file,
            createdAt: new Date(),
        });

        return {
            transcriptId,
            url: `${this.client.server.BaseURL}/transcripts/${transcriptId}`,
            messageCount: messages.length,
            participants,
        };
    }

    async Transcript(transcriptId: string): Promise<ITicketTranscript | null> {
        return this.Transcripts().FindOne({ transcriptId }).catch(() => null);
    }

    private async UniqueTranscriptId(): Promise<string> {
        // 62^16 Möglichkeiten - eine Kollision ist praktisch ausgeschlossen, geprüft wird
        // trotzdem, weil eine doppelte ID ein fremdes Transcript überschreiben würde.
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = GenerateTranscriptId();
            const exists = await this.Transcripts().FindOne({ transcriptId: candidate }).catch(() => null);

            if (!exists) return candidate;
        }

        throw new Error("Es konnte keine freie Transcript-ID gefunden werden.");
    }

    // ── Schliessen ─────────────────────────────────────────────────────────

    async Close(channel: TextChannel | ThreadChannel, ticket: ITicket): Promise<void> {
        await this.Patch(ticket, { status: TicketStatus.CLOSED, closedAt: new Date() });

        // Kanal wie Forum-Beitrag verschwinden - der Verlauf steht im Transcript, das
        // reicht. Ein bleibender Beitrag wäre nur ein zweiter Ort für dieselben Daten.
        await channel.delete("Ticket geschlossen").catch((error) => logger.debug(`[Ticket] Löschen: ${error}`));
    }

    IsSupporter(member: GuildMember, config: ITicketConfig): boolean {
        if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

        return config.supportRoleIds.some((roleId) => member.roles.cache.has(roleId));
    }

    CategoryOf(config: ITicketConfig, name: string): ITicketCategory | null {
        return config.categories.find((entry) => entry.name === name) ?? null;
    }

    RolesFor(config: ITicketConfig, categoryName: string): string[] {
        return ResponsibleRoles(config, categoryName);
    }

    get AllRoles(): string {
        return ALL_ROLES;
    }

    // ── Repositories ───────────────────────────────────────────────────────

    private Configs() {
        return this.client.database.GetRepository<ITicketConfig>("TicketConfig");
    }

    private Tickets() {
        return this.client.database.GetRepository<ITicketRecord>("Ticket");
    }

    private Blacklists() {
        return this.client.database.GetRepository<ITicketBlacklist>("TicketBlacklist");
    }

    private Transcripts() {
        return this.client.database.GetRepository<ITicketTranscript>("TicketTranscript");
    }
}

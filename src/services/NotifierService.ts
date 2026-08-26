import {
    ChannelType,
    ColorResolvable,
    Guild,
    GuildMember,
    Message,
    MessageEditOptions,
    MessageFlags,
    TextChannel,
} from "discord.js";
import BotClient from "../client/BotClient";
import BuildNotification from "../builder/NotifierMessage";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import INotifierRecord from "../interfaces/services/notifier/INotifierRecord";
import INotifierSubscription, { Platform } from "../interfaces/services/notifier/INotifierSubscription";
import { INotifierEvent, IPlatformAdapter } from "../interfaces/services/notifier/INotifierEvent";
import INotifierService, { IPlaceholderContext, IPollSummary } from "../interfaces/services/notifier/INotifierService";
import TwitchAdapter from "./notifier/TwitchAdapter";
import YouTubeAdapter from "./notifier/YouTubeAdapter";
import {
    Key,
    MAX_ENTRIES,
    Normalize,
    PLATFORM_EMOJI,
    PLATFORM_LABEL,
    ShouldNotify,
    SUPPORTS_LIVE,
    TemplateFor,
} from "../constants/Notifier";
import logger from "../utils/logger";

const MODEL = "NotifierSubscription";
const THREAD_DURATION = 1440;

export default class NotifierService implements INotifierService {
    client: BotClient;

    private adapters: Map<Platform, IPlatformAdapter>;
    private twitch: TwitchAdapter;

    constructor(client: BotClient) {
        this.client = client;

        this.twitch = new TwitchAdapter(client);

        this.adapters = new Map<Platform, IPlatformAdapter>([
            ["youtube", new YouTubeAdapter(client)],
            ["twitch", this.twitch],
        ]);
    }

    get Adapters(): IPlatformAdapter[] {
        return [...this.adapters.values()];
    }

    Adapter(platform: Platform): IPlatformAdapter {
        const adapter = this.adapters.get(platform);
        if (!adapter) throw new Error(`Für "${platform}" gibt es keinen Adapter.`);

        return adapter;
    }

    async Initialize(): Promise<void> {
        const missing = this.Adapters.filter((adapter) => !adapter.Ready);

        logger.info(
            `🔔 Notifier bereit (${this.Adapters.length - missing.length}/${this.Adapters.length} Plattformen)` +
                (missing.length > 0 ? ` — offen: ${missing.map((adapter) => adapter.label).join(", ")}` : "")
        );
    }

    async List(guildId: string): Promise<INotifierSubscription[]> {
        const rows = await this.Records().Find({ guildId }, { orderBy: { platform: "ASC", name: "ASC" }, limit: MAX_ENTRIES });

        return rows.map((row) => Normalize(row, guildId));
    }

    async Save(subscription: INotifierSubscription): Promise<void> {
        const { guildId, platform, identifier } = subscription;
        const values = this.ToRecord({ ...subscription, updatedAt: new Date() });

        const records = this.Records();
        const updated = await records.Update({ guildId, platform, identifier }, values);

        if (updated === 0) await records.Insert(values);
    }

    async Remove(guildId: string, platform: Platform, identifier: string): Promise<boolean> {
        return (await this.Records().Delete({ guildId, platform, identifier })) > 0;
    }

    Context(subscription: INotifierSubscription, event: INotifierEvent): IPlaceholderContext {
        return {
            name: subscription.name,
            url: subscription.sourceUrl,
            platform: PLATFORM_LABEL[subscription.platform],
            title: event.title,
            link: event.url,
            thumbnail: event.thumbnail ?? "",
            game: event.game ?? "",
            viewers: event.viewers === null ? "" : String(event.viewers),
            mention: subscription.mentionRoleId ? `<@&${subscription.mentionRoleId}>` : "",
            role: subscription.liveRoleId ? `<@&${subscription.liveRoleId}>` : "",
            discord: subscription.discordUserId ? `<@${subscription.discordUserId}>` : "",
        };
    }

    // Gleiche Schreibweise wie im Welcome-System: {token}, Vergleich in Kleinbuchstaben,
    // Unbekanntes bleibt stehen statt zu verschwinden.
    Fill(template: string, context: IPlaceholderContext): string {
        const values: Record<string, string> = {
            "{name}": context.name,
            "{url}": context.url,
            "{platform}": context.platform,
            "{title}": context.title,
            "{link}": context.link,
            "{thumbnail}": context.thumbnail,
            "{game}": context.game,
            "{viewers}": context.viewers,
            "{mention}": context.mention,
            "{role}": context.role,
            "{discord}": context.discord,
        };

        return template
            .replace(/\{[a-z]+\}/gi, (match) => values[match.toLowerCase()] ?? match)
            .replace(/[ \t]+\n/g, "\n")
            .trim();
    }

    async Poll(): Promise<IPollSummary> {
        const summary: IPollSummary = { checked: 0, notified: 0, skipped: 0, failed: 0 };
        if (!this.client.database.IsReady) return summary;

        const rows = await this.Records().Find({ enabled: true }, { limit: 1000 });
        const now = new Date();

        const due = rows
            .map((row) => Normalize(row, row.guildId))
            .filter((entry) => entry.channelId && this.IsDue(entry, now));

        if (due.length === 0) return summary;

        // Twitch zuerst: eine Sammelabfrage für alle Kanäle statt eine pro Kanal.
        const live = await this.TwitchBatch(due);

        for (const entry of due) {
            summary.checked++;

            try {
                const event =
                    entry.platform === "twitch"
                        ? (live.get(entry.identifier.toLowerCase()) ?? null)
                        : await this.Adapter(entry.platform).Check(entry.identifier);

                const acted = await this.Handle(entry, event, now);

                if (acted) summary.notified++;
                else summary.skipped++;
            } catch (error) {
                summary.failed++;
                await this.Fail(entry, error);
            }
        }

        return summary;
    }

    async Announce(subscription: INotifierSubscription, event: INotifierEvent): Promise<void> {
        const guild = this.client.guilds.cache.get(subscription.guildId);
        const channel = guild?.channels.cache.get(subscription.channelId ?? "");

        if (!guild || !channel?.isTextBased() || channel.isThread()) {
            throw new Error(`Der Kanal ${subscription.channelId} existiert nicht mehr.`);
        }

        const context = this.Context(subscription, event);
        const content = this.Fill(TemplateFor(subscription, event.kind), context);
        const message = await (channel as TextChannel).send(
            BuildNotification(subscription, event, content, this.Client(subscription))
        );

        await this.AfterSend(subscription, event, message, guild);
    }

    // ── Intern ─────────────────────────────────────────────────────────────

    private Records() {
        return this.client.database.GetRepository<INotifierRecord>(MODEL);
    }

    private Client(subscription: INotifierSubscription): { roles: string[]; users: string[] } {
        // Nur genau die Rolle und der Nutzer, die eingestellt wurden - ein {mention} in einem
        // Template darf niemals @everyone auslösen, egal was jemand hineinschreibt.
        return {
            roles: subscription.mentionRoleId ? [subscription.mentionRoleId] : [],
            users: subscription.discordUserId ? [subscription.discordUserId] : [],
        };
    }

    private IsDue(subscription: INotifierSubscription, now: Date): boolean {
        if (!subscription.lastCheck) return true;

        const interval = this.Adapter(subscription.platform).interval * 1000;

        return now.getTime() - subscription.lastCheck.getTime() >= interval;
    }

    private async TwitchBatch(due: INotifierSubscription[]): Promise<Map<string, INotifierEvent>> {
        const logins = due.filter((entry) => entry.platform === "twitch").map((entry) => entry.identifier);

        if (logins.length === 0) return new Map();

        return this.twitch.CheckMany(logins).catch((error) => {
            logger.error(`[Notifier] Twitch-Sammelabfrage fehlgeschlagen: ${error}`);

            return new Map<string, INotifierEvent>();
        });
    }

    // Gibt zurück, ob tatsächlich etwas gemeldet wurde.
    private async Handle(
        subscription: INotifierSubscription,
        event: INotifierEvent | null,
        now: Date
    ): Promise<boolean> {
        // Stream vorbei: Rolle entziehen und die alte Nachricht richtigstellen.
        if (subscription.isLive && (!event || event.kind !== "live")) {
            await this.EndStream(subscription);
            await this.Touch(subscription, { isLive: false, lastCheck: now, lastError: null });

            return false;
        }

        if (!event) {
            await this.Touch(subscription, { lastCheck: now, lastError: null });

            return false;
        }

        const { notify, reason } = ShouldNotify(subscription, event.id, event.kind, now);

        if (!notify) {
            // Bei der Erstsichtung wird der aktuelle Stand festgehalten - ab dem nächsten
            // Durchlauf zählt dann nur noch, was danach dazukommt.
            const seed = reason === "Erstsichtung" ? { lastItemId: event.id } : {};

            await this.Touch(subscription, { ...seed, lastCheck: now, lastError: null });

            if (reason !== "bereits gemeldet" && reason !== "läuft bereits") {
                logger.debug(`[Notifier] ${Key(subscription)} übersprungen: ${reason}`);
            }

            return false;
        }

        await this.Announce(subscription, event);

        return true;
    }

    private async AfterSend(
        subscription: INotifierSubscription,
        event: INotifierEvent,
        message: Message,
        guild: Guild
    ): Promise<void> {
        if (subscription.autoPublish && message.channel.type === ChannelType.GuildAnnouncement) {
            await message.crosspost().catch((error) => logger.debug(`[Notifier] Crosspost abgelehnt: ${error}`));
        }

        if (subscription.createThread) {
            await message.startThread({
                name: `${subscription.name} · ${event.title}`.slice(0, 100),
                autoArchiveDuration: THREAD_DURATION,
            }).catch((error) => logger.debug(`[Notifier] Thread abgelehnt: ${error}`));
        }

        const isLive = event.kind === "live" && SUPPORTS_LIVE[subscription.platform];

        if (isLive) await this.LiveRole(subscription, guild, true);

        await this.Touch(subscription, {
            lastItemId: event.id,
            lastMessageId: message.id,
            lastNotified: new Date(),
            lastCheck: new Date(),
            lastError: null,
            isLive,
            notifyCount: subscription.notifyCount + 1,
        });

        logger.info(`🔔 ${PLATFORM_LABEL[subscription.platform]} · ${subscription.name}: ${event.title}`);
    }

    private async EndStream(subscription: INotifierSubscription): Promise<void> {
        const guild = this.client.guilds.cache.get(subscription.guildId);
        if (guild) await this.LiveRole(subscription, guild, false);

        if (!subscription.editOnEnd || !subscription.lastMessageId || !subscription.channelId) return;

        const channel = guild?.channels.cache.get(subscription.channelId);
        if (!channel?.isTextBased()) return;

        const message = await channel.messages.fetch(subscription.lastMessageId).catch(() => null);
        if (!message?.editable) return;

        // Eine Ankündigung, die Stunden später immer noch "ist jetzt live" behauptet, ist eine Falschmeldung.
        const context = this.Context(subscription, {
            kind: "live",
            id: subscription.lastItemId ?? "",
            title: "",
            url: subscription.sourceUrl,
            thumbnail: null,
            game: null,
            viewers: null,
            publishedAt: new Date(),
        });

        const content = this.Fill(subscription.offlineTemplate, context);

        // Beim Bearbeiten darf das Format nicht wechseln: eine Nachricht, die mit IsComponentsV2
        // rausging, muss auch als Container bearbeitet werden - und umgekehrt.
        const edit: MessageEditOptions =
            subscription.style === "text"
                ? { content, allowedMentions: { roles: [], users: [] } }
                : {
                      components: [
                          new ComponentV2Builder({ accentColor: subscription.accent as ColorResolvable })
                              .text(`${PLATFORM_EMOJI[subscription.platform]} **⚫ OFFLINE · ${PLATFORM_LABEL[subscription.platform]}**`)
                              .separator()
                              .text(content)
                              .buttons({ url: subscription.sourceUrl, label: "Kanal", emoji: "🔗" })
                              .build(),
                      ],
                      flags: MessageFlags.IsComponentsV2,
                      allowedMentions: { roles: [], users: [] },
                  };

        await message
            .edit(edit)
            .catch((error) => logger.debug(`[Notifier] Nachricht konnte nicht angepasst werden: ${error}`));
    }

    private async LiveRole(subscription: INotifierSubscription, guild: Guild, grant: boolean): Promise<void> {
        if (!subscription.liveRoleId || !subscription.discordUserId) return;

        const member: GuildMember | null = await guild.members.fetch(subscription.discordUserId).catch(() => null);
        if (!member) return;

        const action = grant ? member.roles.add(subscription.liveRoleId) : member.roles.remove(subscription.liveRoleId);

        await action.catch((error) =>
            logger.warn(`[Notifier] Live-Rolle ${grant ? "vergeben" : "entziehen"} fehlgeschlagen: ${error}`)
        );
    }

    private async Touch(subscription: INotifierSubscription, values: Partial<INotifierRecord>): Promise<void> {
        Object.assign(subscription, values);

        await this.Records()
            .Update(
                { guildId: subscription.guildId, platform: subscription.platform, identifier: subscription.identifier },
                { ...values, updatedAt: new Date() }
            )
            .catch((error) => logger.error(`[Notifier] Zustand konnte nicht gespeichert werden: ${error}`));
    }

    private async Fail(subscription: INotifierSubscription, error: unknown): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);

        logger.warn(`[Notifier] ${Key(subscription)} fehlgeschlagen: ${message}`);

        await this.Touch(subscription, { lastCheck: new Date(), lastError: message.slice(0, 500) });
    }

    private ToRecord(subscription: INotifierSubscription): INotifierRecord {
        const { ...record } = subscription;

        return record;
    }
}

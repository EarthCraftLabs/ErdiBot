import { ActivityOptions } from "discord.js";
import BotClient from "../client/BotClient";
import IStatusEntry, { IStatusRecord, IStatusSettings, StatusKind } from "../interfaces/services/status/IStatusEntry";
import {
    Clamp,
    DEFAULT_INTERVAL,
    FIXED,
    Kind,
    MAX_ENTRIES,
    MAX_INTERVAL,
    MIN_INTERVAL,
    NormalizeEntry,
    Text,
    Uptime,
} from "../constants/Status";
import TicketStatus from "../enums/TicketStatus";
import ITicketRecord from "../interfaces/services/ticket/ITicketRecord";
import logger from "../utils/logger";

const MODEL = "BotStatus";
const SETTINGS = "BotStatusSettings";
const SCOPE = "global";

export default class StatusService {
    client: BotClient;

    private timer: NodeJS.Timeout | null = null;
    private current: IStatusEntry | null = null;

    constructor(client: BotClient) {
        this.client = client;
    }

    async Initialize(): Promise<void> {
        await this.Restart();
    }

    get Current(): IStatusEntry | null {
        return this.current;
    }

    // ── Daten ──────────────────────────────────────────────────────────────

    // Die beiden festen Einträge stehen immer vorn, danach kommt, was jemand angelegt hat.
    async Entries(): Promise<IStatusEntry[]> {
        const rows = await this.Records().Find({}, { orderBy: { id: "ASC" } }).catch(() => []);

        const stored = rows
            .map((row) => NormalizeEntry(row))
            .filter((entry): entry is IStatusEntry => entry !== null);

        return [...FIXED, ...stored];
    }

    async Settings(): Promise<{ interval: number; enabled: boolean }> {
        const row = await this.Config().FindOne({ scope: SCOPE }).catch(() => null);

        return {
            interval: Clamp(row?.interval ?? DEFAULT_INTERVAL, MIN_INTERVAL, MAX_INTERVAL),
            enabled: row ? row.enabled === true || (row.enabled as unknown) === 1 : true,
        };
    }

    async SaveSettings(values: { interval?: number; enabled?: boolean }): Promise<void> {
        const current = await this.Settings();

        const next = {
            interval: Clamp(values.interval ?? current.interval, MIN_INTERVAL, MAX_INTERVAL),
            enabled: values.enabled ?? current.enabled,
            updatedAt: new Date(),
        };

        const updated = await this.Config().Update({ scope: SCOPE }, next);

        if (updated === 0) await this.Config().Insert({ scope: SCOPE, ...next });

        await this.Restart();
    }

    async Add(text: string, kind: StatusKind): Promise<boolean> {
        const clean = Text(text);
        if (!clean) return false;

        const count = await this.Records().Count().catch(() => MAX_ENTRIES);
        if (count >= MAX_ENTRIES) return false;

        const now = new Date();

        await this.Records().Insert({ text: clean, kind, enabled: true, createdAt: now, updatedAt: now });

        return true;
    }

    async Patch(id: string, values: Partial<IStatusRecord>): Promise<boolean> {
        const numeric = Number(id);
        if (!Number.isInteger(numeric)) return false;

        return (await this.Records().Update({ id: numeric }, { ...values, updatedAt: new Date() })) > 0;
    }

    async Remove(id: string): Promise<boolean> {
        const numeric = Number(id);
        if (!Number.isInteger(numeric)) return false;

        return (await this.Records().Delete({ id: numeric })) > 0;
    }

    // ── Rotation ───────────────────────────────────────────────────────────

    // Wird nach jeder Änderung neu aufgezogen: das Intervall steckt im Timer, ein
    // laufender würde sonst mit dem alten Takt weiterlaufen.
    async Restart(): Promise<void> {
        this.Stop();

        const { interval, enabled } = await this.Settings();

        if (!enabled) {
            this.current = null;
            this.client.user?.setActivity();

            return;
        }

        await this.Rotate();

        this.timer = setInterval(() => {
            this.Rotate().catch((error) => logger.debug(`[Status] Rotation: ${error}`));
        }, interval * 1_000);

        this.timer.unref();
    }

    Stop(): void {
        if (!this.timer) return;

        clearInterval(this.timer);
        this.timer = null;
    }

    async Rotate(): Promise<void> {
        const entries = (await this.Entries()).filter((entry) => entry.enabled);
        if (entries.length === 0) return;

        // Zufällig, aber nie zweimal derselbe hintereinander - sonst sieht es aus, als
        // stünde die Rotation still.
        const pool =
            entries.length > 1 ? entries.filter((entry) => entry.id !== this.current?.id) : entries;

        const entry = pool[Math.floor(Math.random() * pool.length)];

        this.current = entry;
        this.client.user?.setActivity(await this.Activity(entry));
    }

    // Ein Custom-Status trägt seinen Text in state, nicht in name: mit name allein zeigt
    // Discord bei Bots nichts an.
    async Activity(entry: IStatusEntry): Promise<ActivityOptions> {
        const info = Kind(entry.kind);
        const text = await this.Resolve(entry.text);

        return info.id === "custom"
            ? { name: "Custom Status", state: text, type: info.type }
            : { name: text, type: info.type };
    }

    // ── Platzhalter ────────────────────────────────────────────────────────

    // Aufgelöst wird nur, was auch vorkommt - die Ticket-Zahl kostet sonst bei jedem
    // Wechsel eine Abfrage, die niemand liest.
    async Resolve(text: string): Promise<string> {
        let result = text;

        if (result.includes("{servers}")) result = result.replaceAll("{servers}", String(this.client.guilds.cache.size));

        if (result.includes("{members}")) {
            const members = this.client.guilds.cache.reduce((sum, guild) => sum + guild.memberCount, 0);

            result = result.replaceAll("{members}", String(members));
        }

        if (result.includes("{channels}")) {
            result = result.replaceAll("{channels}", String(this.client.channels.cache.size));
        }

        if (result.includes("{ping}")) result = result.replaceAll("{ping}", `${Math.max(0, this.client.ws.ping)}ms`);

        if (result.includes("{uptime}")) result = result.replaceAll("{uptime}", Uptime(this.client.uptime ?? 0));

        if (result.includes("{tickets}")) {
            const open = await this.client.database
                .GetRepository<ITicketRecord>("Ticket")
                .Count({ status: TicketStatus.OPEN })
                .catch(() => 0);

            result = result.replaceAll("{tickets}", String(open));
        }

        return result.slice(0, 128);
    }

    // ── Repositories ───────────────────────────────────────────────────────

    private Records() {
        return this.client.database.GetRepository<IStatusRecord>(MODEL);
    }

    private Config() {
        return this.client.database.GetRepository<IStatusSettings>(SETTINGS);
    }
}

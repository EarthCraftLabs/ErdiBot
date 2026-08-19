import path from "path";
import { pathToFileURL } from "node:url";
import { Collection } from "discord.js";
import { glob } from "glob";
import mysql, { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import BotClient from "../client/BotClient";
import IDatabaseConnection from "../interfaces/database/IDatabaseConnection";
import IExecutor, { QueryParam } from "../interfaces/database/IExecutor";
import ITableDefinition from "../interfaces/database/ITableDefinition";
import { IDatabaseConfig } from "../interfaces/config/IConfig";
import Repository from "./Repository";
import SchemaSync from "./SchemaSync";
import logger from "../utils/logger";

export default class DatabaseConnection implements IDatabaseConnection, IExecutor {
    client: BotClient;
    repositories: Collection<string, Repository<any>>;

    private pool: Pool | null = null;

    constructor(client: BotClient) {
        this.client = client;
        this.repositories = new Collection();
    }

    get Settings(): IDatabaseConfig {
        const { developerMode, config } = this.client;

        return developerMode ? config.DEV_DATABASE : config.DATABASE;
    }

    get Pool(): Pool {
        if (!this.pool) throw new Error("Die Datenbank-Verbindung wurde noch nicht aufgebaut.");

        return this.pool;
    }

    get IsReady(): boolean {
        return this.pool !== null && this.repositories.size > 0;
    }

    async Connect(): Promise<void> {
        const { developerMode } = this.client;
        const settings = this.Settings;
        const section = developerMode ? "DEV_DATABASE" : "DATABASE";

        if (!settings?.HOST || !settings?.USER || !settings?.NAME) {
            throw new Error(`Missing ${section}.HOST, ${section}.USER or ${section}.NAME in config.json`);
        }

        this.pool = mysql.createPool({
            host: settings.HOST,
            port: settings.PORT ?? 3306,
            user: settings.USER,
            password: settings.PASSWORD ?? "",
            database: settings.NAME,
            waitForConnections: true,
            timezone: "Z",
        });

        this.pool.pool.on("error", (error: Error) => logger.error("🗄️  MariaDB pool error", error));

        const connection = await this.pool.getConnection();
        await connection.ping();
        connection.release();

        logger.info(
            `🗄️  MariaDB connected (${developerMode ? "Development" : "Production"} | ` +
                `${settings.HOST}:${settings.PORT ?? 3306}/${settings.NAME})`
        );

        await this.LoadRepositories();
        await this.SyncSchema();
    }

    async SyncSchema(): Promise<void> {
        const definitions = this.repositories.map((repository) => repository.definition);

        await new SchemaSync(this).Run([...definitions.values()]);
    }

    async LoadRepositories(): Promise<void> {
        const files = await glob("**/*.{ts,js}", {
            cwd: path.join(__dirname, "./models"),
            absolute: true,
        });

        for (const file of files) {
            const imported = await import(pathToFileURL(file).href);
            const definition: ITableDefinition = imported.default?.default ?? imported.default;

            if (!definition?.name || !definition?.table || !definition?.columns) {
                logger.error(`Table definition at ${file} is missing a name, table or columns.`);
                continue;
            }

            this.repositories.set(definition.name, new Repository(this, definition));
        }

        const cached = this.repositories.filter((repository) => repository.IsCached).size;

        logger.info(`🚀  ${this.repositories.size} Repositories loaded (${cached} cached)`);
    }

    GetRepository<T extends object>(name: string): Repository<T> {
        const repository = this.repositories.get(name);
        if (!repository) throw new Error(`Repository "${name}" is not loaded.`);

        return repository as Repository<T>;
    }

    Invalidate(name: string): void {
        this.repositories.get(name)?.Invalidate();
    }

    async Rows(sql: string, params: QueryParam[] = []): Promise<RowDataPacket[]> {
        this.Debug(sql, params);

        const [rows] = await this.Pool.execute<RowDataPacket[]>(sql, params);

        return rows;
    }

    async Run(sql: string, params: QueryParam[] = []): Promise<ResultSetHeader> {
        this.Debug(sql, params);

        const [result] = await this.Pool.execute<ResultSetHeader>(sql, params);

        return result;
    }

    async Raw(sql: string): Promise<void> {
        this.Debug(sql, []);

        await this.Pool.query(sql);
    }

    async Disconnect(): Promise<void> {
        if (!this.pool) return;

        for (const repository of this.repositories.values()) repository.Invalidate();

        await this.pool.end();
        this.pool = null;

        logger.info("👋 MariaDB connection closed");
    }

    private Debug(sql: string, params: QueryParam[]): void {
        if (!this.client.developerMode) return;

        logger.debug(`🗄️  ${sql.replace(/\s+/g, " ").trim()}`, params);
    }
}

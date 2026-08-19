import { Collection } from "discord.js";
import { Pool } from "mysql2/promise";
import Repository from "../../database/Repository";
import { IDatabaseConfig } from "../config/IConfig";

export default interface IDatabaseConnection {
    repositories: Collection<string, Repository<any>>;

    readonly Settings: IDatabaseConfig;
    readonly Pool: Pool;
    readonly IsReady: boolean;

    Connect(): Promise<void>;
    Disconnect(): Promise<void>;

    LoadRepositories(): Promise<void>;
    SyncSchema(): Promise<void>;

    GetRepository<T extends object>(name: string): Repository<T>;
    Invalidate(name: string): void;
}

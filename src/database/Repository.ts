import { LRUCache } from "lru-cache";
import { RowDataPacket } from "mysql2/promise";
import ColumnType from "../enums/ColumnType";
import IExecutor, { QueryParam } from "../interfaces/database/IExecutor";
import ITableDefinition, { IColumn } from "../interfaces/database/ITableDefinition";
import { IFindOptions, Order, Row, Where } from "../interfaces/database/IQuery";
import { ColumnName, ID_COLUMN, Spec } from "./Columns";

const CACHE_MAX = 500;
const CACHE_TTL = 5 * 60 * 1000;

const ID_DEFINITION: IColumn = { column: ID_COLUMN, type: ColumnType.INTEGER, unsigned: true };

const COMPARISONS: Record<string, string> = { lt: "<", lte: "<=", gt: ">", gte: ">=" };

function IsOperator(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !(value instanceof Date) && !Array.isArray(value);
}

export default class Repository<T extends object> {
    readonly definition: ITableDefinition<T>;

    private executor: IExecutor;
    private columns: Map<string, IColumn>;
    private cache: LRUCache<string, { value: unknown }> | null;

    constructor(executor: IExecutor, definition: ITableDefinition<T>) {
        this.executor = executor;
        this.definition = definition;

        this.columns = new Map([[ID_COLUMN, ID_DEFINITION]]);

        for (const [field, column] of Object.entries(definition.columns) as Array<[string, IColumn]>) {
            this.columns.set(field, { ...column, column: ColumnName(field, column) });
        }

        if (definition.cache === false) {
            this.cache = null;
        } else {
            const overrides = typeof definition.cache === "object" ? definition.cache : {};
            this.cache = new LRUCache({ max: overrides.max ?? CACHE_MAX, ttl: overrides.ttl ?? CACHE_TTL });
        }
    }

    get Name(): string {
        return this.definition.name;
    }

    get Table(): string {
        return this.definition.table;
    }

    get IsCached(): boolean {
        return this.cache !== null;
    }

    get Fields(): string[] {
        return [...this.columns.keys()];
    }

    async Find(where: Where<T> = {}, options: IFindOptions<T> = {}): Promise<Array<Row<T>>> {
        return this.Cached("find", { where, options }, async () => {
            const clause = this.BuildWhere(where);

            const sql =
                `SELECT * FROM ${this.Identifier}${clause.sql}` +
                this.BuildOrder(options.orderBy) +
                this.BuildLimit(options);

            const rows = await this.executor.Rows(sql, clause.params);

            return rows.map((row) => this.ToEntity(row));
        });
    }

    async FindOne(where: Where<T>): Promise<Row<T> | null> {
        const [row] = await this.Find(where, { limit: 1 });

        return row ?? null;
    }

    async FindById(id: number | string): Promise<Row<T> | null> {
        const numeric = Number(id);
        if (!Number.isInteger(numeric) || numeric <= 0) return null;

        return this.FindOne({ id: numeric } as Where<T>);
    }

    async Count(where: Where<T> = {}): Promise<number> {
        return this.Cached("count", where, async () => {
            const clause = this.BuildWhere(where);

            const rows = await this.executor.Rows(
                `SELECT COUNT(*) AS total FROM ${this.Identifier}${clause.sql}`,
                clause.params
            );

            return Number(rows[0]?.total ?? 0);
        });
    }

    async Insert(values: Partial<T>): Promise<number> {
        const fields = this.UsedFields(values);
        if (fields.length === 0) throw new Error(`Insert ohne Werte auf "${this.Table}".`);

        const params = fields.map((field) => this.ToDatabase(field, (values as Record<string, unknown>)[field]));

        const result = await this.executor.Run(
            `INSERT INTO ${this.Identifier} (${this.Columns(fields)}) VALUES (${fields.map(() => "?").join(", ")})`,
            params
        );

        this.Invalidate();

        return result.insertId;
    }

    async InsertMissing(entries: Array<Partial<T>>): Promise<number> {
        if (entries.length === 0) return 0;

        const fields = this.UsedFields(entries[0]);
        if (fields.length === 0) throw new Error(`InsertMissing ohne Werte auf "${this.Table}".`);

        const params: QueryParam[] = [];

        for (const entry of entries) {
            const values = entry as Record<string, unknown>;

            for (const field of fields) {
                if (!(field in values)) {
                    throw new Error(`InsertMissing auf "${this.Table}": Eintrag ohne Feld "${field}".`);
                }

                params.push(this.ToDatabase(field, values[field]));
            }
        }

        const placeholders = `(${fields.map(() => "?").join(", ")})`;

        const result = await this.executor.Run(
            `INSERT INTO ${this.Identifier} (${this.Columns(fields)}) ` +
                `VALUES ${entries.map(() => placeholders).join(", ")} ` +
                `ON DUPLICATE KEY UPDATE \`${ID_COLUMN}\` = \`${ID_COLUMN}\``,
            params
        );

        this.Invalidate();

        return result.affectedRows;
    }

    async Upsert(match: Partial<T>, defaults: Partial<T> = {}): Promise<Row<T> | null> {
        await this.InsertMissing([{ ...match, ...defaults }]);

        return this.FindOne(match as Where<T>);
    }

    async Update(where: Where<T>, values: Partial<T>): Promise<number> {
        const fields = this.UsedFields(values);
        if (fields.length === 0) return 0;

        const assignments = fields.map((field) => `${this.Column(field)} = ?`);
        const params = fields.map((field) => this.ToDatabase(field, (values as Record<string, unknown>)[field]));

        const clause = this.BuildWhere(where);

        const result = await this.executor.Run(`UPDATE ${this.Identifier} SET ${assignments.join(", ")}${clause.sql}`, [
            ...params,
            ...clause.params,
        ]);

        this.Invalidate();

        return result.affectedRows;
    }

    async Delete(where: Where<T>): Promise<number> {
        const clause = this.BuildWhere(where);

        if (!clause.sql) throw new Error(`Delete ohne Bedingung auf "${this.Table}" ist nicht erlaubt.`);

        const result = await this.executor.Run(`DELETE FROM ${this.Identifier}${clause.sql}`, clause.params);

        this.Invalidate();

        return result.affectedRows;
    }

    Invalidate(): void {
        this.cache?.clear();
    }

    private get Identifier(): string {
        return `\`${this.definition.table}\``;
    }

    private Definition(field: string): IColumn {
        const column = this.columns.get(field);
        if (!column) throw new Error(`Unbekannte Spalte "${field}" für Tabelle "${this.Table}".`);

        return column;
    }

    private Column(field: string): string {
        return `\`${this.Definition(field).column}\``;
    }

    private Columns(fields: string[]): string {
        return fields.map((field) => this.Column(field)).join(", ");
    }

    private UsedFields(values: Partial<T>): string[] {
        return Object.entries(values)
            .filter(([, value]) => value !== undefined)
            .map(([field]) => field);
    }

    private ToDatabase(field: string, value: unknown): QueryParam {
        const column = this.Definition(field);

        if (value === null || value === undefined) return column.blankAsNull ? "" : null;

        switch (Spec(column).conversion) {
            case "boolean":
                return value ? 1 : 0;
            case "json":
                return JSON.stringify(value);
            case "list":
                return Array.isArray(value) ? value.join(",") : String(value);
            default:
                return value as QueryParam;
        }
    }

    private FromDatabase(field: string, column: IColumn, value: unknown): unknown {
        switch (Spec(column).conversion) {
            case "boolean":
                return Boolean(value);
            case "number":
                return Number(value);
            case "list":
                return typeof value === "string" ? (value === "" ? [] : value.split(",")) : value;
            case "json":
                if (typeof value !== "string") return value;

                try {
                    return JSON.parse(value);
                } catch {
                    throw new Error(`Spalte "${this.Table}.${ColumnName(field, column)}" enthält kein gültiges JSON.`);
                }
            default:
                return value;
        }
    }

    private ToEntity(raw: RowDataPacket): Row<T> {
        const entity: Record<string, unknown> = {};

        for (const [field, column] of this.columns) {
            const value = raw[column.column as string];

            if (value === null || value === undefined) {
                entity[field] = null;
                continue;
            }

            if (column.blankAsNull && value === "") {
                entity[field] = null;
                continue;
            }

            entity[field] = this.FromDatabase(field, column, value);
        }

        entity[ID_COLUMN] = Number(raw[ID_COLUMN]);

        return entity as Row<T>;
    }

    private BuildWhere(where: Where<T>): { sql: string; params: QueryParam[] } {
        const clauses: string[] = [];
        const params: QueryParam[] = [];

        for (const [field, condition] of Object.entries(where)) {
            if (condition === undefined) continue;

            const column = this.Column(field);

            if (!IsOperator(condition)) {
                const value = this.ToDatabase(field, condition);

                if (value === null) {
                    clauses.push(`${column} IS NULL`);
                } else {
                    clauses.push(`${column} = ?`);
                    params.push(value);
                }

                continue;
            }

            const operators = Object.entries(condition);

            if (operators.length !== 1) {
                throw new Error(`Genau ein Operator pro Spalte erlaubt - "${field}" hat ${operators.length}.`);
            }

            const [operator, operand] = operators[0];

            if (operator === "in" || operator === "notIn") {
                const values = (operand as unknown[]).map((value) => this.ToDatabase(field, value));

                if (values.length === 0) {
                    clauses.push(operator === "in" ? "1 = 0" : "1 = 1");
                    continue;
                }

                clauses.push(`${column} ${operator === "in" ? "IN" : "NOT IN"} (${values.map(() => "?").join(", ")})`);
                params.push(...values);

                continue;
            }

            if (operator === "not") {
                const value = this.ToDatabase(field, operand);

                if (value === null) {
                    clauses.push(`${column} IS NOT NULL`);
                } else {
                    clauses.push(`${column} <> ?`);
                    params.push(value);
                }

                continue;
            }

            const comparison = COMPARISONS[operator];
            if (!comparison) throw new Error(`Unbekannter Operator "${operator}" für Spalte "${field}".`);

            clauses.push(`${column} ${comparison} ?`);
            params.push(this.ToDatabase(field, operand));
        }

        return { sql: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "", params };
    }

    private BuildOrder(orderBy?: Order<T>): string {
        if (!orderBy) return "";

        const parts = Object.entries(orderBy)
            .filter(([, direction]) => direction !== undefined)
            .map(([field, direction]) => `${this.Column(field)} ${direction === "DESC" ? "DESC" : "ASC"}`);

        return parts.length > 0 ? ` ORDER BY ${parts.join(", ")}` : "";
    }

    private BuildLimit(options: IFindOptions<T>): string {
        const clamp = (value: number | undefined, name: string): number | null => {
            if (value === undefined) return null;
            if (!Number.isInteger(value) || value < 0) throw new Error(`${name} muss eine ganze Zahl >= 0 sein.`);

            return value;
        };

        const limit = clamp(options.limit, "limit");
        const offset = clamp(options.offset, "offset");

        if (limit === null) return "";

        return offset === null ? ` LIMIT ${limit}` : ` LIMIT ${limit} OFFSET ${offset}`;
    }

    private async Cached<R>(operation: string, signature: unknown, load: () => Promise<R>): Promise<R> {
        if (!this.cache) return load();

        let key: string;

        try {
            key = JSON.stringify({ operation, signature });
        } catch {
            return load();
        }

        const hit = this.cache.get(key);
        if (hit) return hit.value as R;

        const value = await load();
        this.cache.set(key, { value });

        return value;
    }
}

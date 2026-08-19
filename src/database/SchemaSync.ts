import IExecutor from "../interfaces/database/IExecutor";
import ITableDefinition, { IColumn, IIndex } from "../interfaces/database/ITableDefinition";
import { ColumnClause, ColumnName, ColumnShape, ID_COLUMN, IsSqlNullable, SqlType } from "./Columns";
import logger from "../utils/logger";

const PRIMARY_KEY = "PRIMARY";
const TABLE_OPTIONS = "ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

interface IExistingColumn {
    name: string;
    dataType: string;
    columnType: string;
    length: number | null;
    precision: number | null;
    numericPrecision: number | null;
    numericScale: number | null;
    nullable: boolean;
    unsigned: boolean;
}

function Normalize(columnType: string): string {
    return columnType.toLowerCase().replace(/\s+/g, "");
}

interface IExistingIndex {
    name: string;
    columns: string[];
    unique: boolean;
}

function SameColumns(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

export default class SchemaSync {
    private executor: IExecutor;

    constructor(executor: IExecutor) {
        this.executor = executor;
    }

    async Run(definitions: Array<ITableDefinition<any>>): Promise<number> {
        let changes = 0;

        for (const definition of definitions) {
            this.Validate(definition);
            changes += await this.SyncTable(definition);
        }

        await this.ReportUnknownTables(new Set(definitions.map((definition) => definition.table)));

        if (changes === 0) logger.info(`🗄️  Schema ist aktuell (${definitions.length} Tabelle(n))`);
        else logger.info(`🗄️  Schema abgeglichen (${changes} Änderung(en))`);

        return changes;
    }

    private Validate(definition: ITableDefinition<any>): void {
        if (Object.keys(definition.columns).length === 0) {
            throw new Error(`Tabellendefinition "${definition.name}" hat keine Spalten.`);
        }

        for (const [field, column] of Object.entries(definition.columns) as Array<[string, IColumn]>) {
            if (ColumnName(field, column) === ID_COLUMN) {
                throw new Error(`"${definition.name}": "${field}" kollidiert mit der automatischen Spalte "id".`);
            }
        }

        for (const index of definition.indexes ?? []) {
            if (index.columns.length === 0) {
                throw new Error(`Index "${index.name}" auf "${definition.table}" hat keine Spalten.`);
            }

            for (const field of index.columns) {
                if (!definition.columns[field]) {
                    throw new Error(`Index "${index.name}" auf "${definition.table}" nennt unbekanntes Feld "${field}".`);
                }
            }
        }
    }

    private async SyncTable(definition: ITableDefinition<any>): Promise<number> {
        const existing = await this.DescribeColumns(definition.table);

        if (existing.length === 0) {
            await this.CreateTable(definition);
            logger.info(`🗄️  Tabelle "${definition.table}" angelegt`);

            return 1;
        }

        const columns = await this.SyncColumns(definition, existing);
        const indexes = await this.SyncIndexes(definition);

        return columns + indexes;
    }

    private async CreateTable(definition: ITableDefinition<any>): Promise<void> {
        const parts = [`\`${ID_COLUMN}\` INT UNSIGNED NOT NULL AUTO_INCREMENT`];

        for (const [field, column] of Object.entries(definition.columns) as Array<[string, IColumn]>) {
            parts.push(ColumnClause(field, column));
        }

        parts.push(`PRIMARY KEY (\`${ID_COLUMN}\`)`);

        for (const index of definition.indexes ?? []) parts.push(this.IndexClause(definition, index));

        await this.executor.Raw(`CREATE TABLE \`${definition.table}\` (${parts.join(", ")}) ${TABLE_OPTIONS}`);
    }

    private async SyncColumns(definition: ITableDefinition<any>, existing: IExistingColumn[]): Promise<number> {
        const current = new Map(existing.map((column) => [column.name, column]));
        const fields = Object.entries(definition.columns) as Array<[string, IColumn]>;
        const wanted = new Set(fields.map(([field, column]) => ColumnName(field, column)));

        let changes = 0;

        for (const [field, column] of fields) {
            const name = ColumnName(field, column);
            const found = current.get(name);

            if (!found) {
                await this.executor.Raw(
                    `ALTER TABLE \`${definition.table}\` ADD COLUMN ${ColumnClause(field, column)}`
                );

                logger.info(`🗄️  ${definition.table}: Spalte "${name}" hinzugefügt`);
                changes++;

                continue;
            }

            if (this.Matches(found, column)) continue;

            logger.warn(
                `🗄️  ${definition.table}: Spalte "${name}" weicht ab (${found.dataType} -> ${SqlType(column)}) - wird angepasst`
            );

            await this.executor.Raw(`ALTER TABLE \`${definition.table}\` MODIFY COLUMN ${ColumnClause(field, column)}`);
            changes++;
        }

        for (const column of existing) {
            if (column.name === ID_COLUMN || wanted.has(column.name)) continue;

            logger.warn(`🗄️  ${definition.table}: Spalte "${column.name}" steht in keinem Model mehr - wird gelöscht`);

            await this.executor.Raw(`ALTER TABLE \`${definition.table}\` DROP COLUMN \`${column.name}\``);
            changes++;
        }

        return changes;
    }

    private async SyncIndexes(definition: ITableDefinition<any>): Promise<number> {
        const existing = await this.DescribeIndexes(definition.table);
        const current = new Map(existing.map((index) => [index.name, index]));
        const wanted = definition.indexes ?? [];

        let changes = 0;

        for (const index of wanted) {
            const columns = index.columns.map((field) => ColumnName(field, definition.columns[field]));
            const found = current.get(index.name);

            if (found && found.unique === (index.unique === true) && SameColumns(found.columns, columns)) continue;

            if (found) {
                logger.warn(`🗄️  ${definition.table}: Index "${index.name}" hat sich geändert - wird neu aufgebaut`);
                await this.executor.Raw(`ALTER TABLE \`${definition.table}\` DROP INDEX \`${index.name}\``);
            }

            await this.executor.Raw(`ALTER TABLE \`${definition.table}\` ADD ${this.IndexClause(definition, index)}`);

            logger.info(`🗄️  ${definition.table}: Index "${index.name}" angelegt`);
            changes++;
        }

        const names = new Set(wanted.map((index) => index.name));

        for (const index of existing) {
            if (names.has(index.name)) continue;

            logger.warn(`🗄️  ${definition.table}: Index "${index.name}" steht in keinem Model mehr - wird gelöscht`);

            await this.executor.Raw(`ALTER TABLE \`${definition.table}\` DROP INDEX \`${index.name}\``);
            changes++;
        }

        return changes;
    }

    private Matches(existing: IExistingColumn, column: IColumn): boolean {
        const shape = ColumnShape(column);

        if (!shape.dataTypes.includes(existing.dataType)) return false;
        if (shape.length !== null && existing.length !== shape.length) return false;
        if (shape.precision !== null && existing.precision !== shape.precision) return false;
        if (shape.numericPrecision !== null && existing.numericPrecision !== shape.numericPrecision) return false;
        if (shape.numericScale !== null && existing.numericScale !== shape.numericScale) return false;

        if (shape.columnType !== null && Normalize(existing.columnType) !== Normalize(shape.columnType)) return false;

        if (existing.nullable !== IsSqlNullable(column)) return false;

        return existing.unsigned === (column.unsigned === true);
    }

    private IndexClause(definition: ITableDefinition<any>, index: IIndex): string {
        const columns = index.columns.map((field) => `\`${ColumnName(field, definition.columns[field])}\``);

        return `${index.unique ? "UNIQUE KEY" : "KEY"} \`${index.name}\` (${columns.join(", ")})`;
    }

    private async DescribeColumns(table: string): Promise<IExistingColumn[]> {
        const rows = await this.executor.Rows(
            `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH, DATETIME_PRECISION,
                    NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
             ORDER BY ORDINAL_POSITION`,
            [table]
        );

        return rows.map((row) => ({
            name: String(row.COLUMN_NAME),
            dataType: String(row.DATA_TYPE).toLowerCase(),
            columnType: String(row.COLUMN_TYPE ?? ""),
            length: row.CHARACTER_MAXIMUM_LENGTH === null ? null : Number(row.CHARACTER_MAXIMUM_LENGTH),
            precision: row.DATETIME_PRECISION === null ? null : Number(row.DATETIME_PRECISION),
            numericPrecision: row.NUMERIC_PRECISION === null ? null : Number(row.NUMERIC_PRECISION),
            numericScale: row.NUMERIC_SCALE === null ? null : Number(row.NUMERIC_SCALE),
            nullable: String(row.IS_NULLABLE).toUpperCase() === "YES",
            unsigned: String(row.COLUMN_TYPE ?? "").toLowerCase().includes("unsigned"),
        }));
    }

    private async DescribeIndexes(table: string): Promise<IExistingIndex[]> {
        const rows = await this.executor.Rows(
            `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
             ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
            [table]
        );

        const indexes = new Map<string, IExistingIndex>();

        for (const row of rows) {
            const name = String(row.INDEX_NAME);
            if (name === PRIMARY_KEY) continue;

            const index = indexes.get(name) ?? { name, columns: [], unique: Number(row.NON_UNIQUE) === 0 };

            index.columns.push(String(row.COLUMN_NAME));
            indexes.set(name, index);
        }

        return [...indexes.values()];
    }

    private async ReportUnknownTables(known: Set<string>): Promise<void> {
        const rows = await this.executor.Rows(
            `SELECT TABLE_NAME FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
        );

        const unknown = rows.map((row) => String(row.TABLE_NAME)).filter((table) => !known.has(table));

        if (unknown.length > 0) {
            logger.warn(`🗄️  Tabellen ohne Model (bleiben unangetastet): ${unknown.join(", ")}`);
        }
    }
}

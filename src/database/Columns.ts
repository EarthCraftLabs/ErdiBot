import ColumnType from "../enums/ColumnType";
import { IColumn } from "../interfaces/database/ITableDefinition";

export const ID_COLUMN = "id";

export type Conversion = "string" | "number" | "boolean" | "date" | "json" | "buffer" | "list";

export interface ITypeSpec {
    sql: (column: IColumn) => string;
    dataTypes: string[];
    length?: (column: IColumn) => number;
    precision?: (column: IColumn) => number;
    numeric?: boolean;
    full?: boolean;
    conversion: Conversion;
}

export interface IColumnShape {
    dataTypes: string[];
    length: number | null;
    precision: number | null;
    numericPrecision: number | null;
    numericScale: number | null;
    columnType: string | null;
}

function Unsigned(column: IColumn): string {
    return column.unsigned ? " UNSIGNED" : "";
}

function Values(column: IColumn): string {
    const values = column.values ?? [];

    if (values.length === 0) throw new Error(`ColumnType "${column.type}" braucht eine "values"-Liste.`);

    return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(",");
}

export const TYPE_SPECS: Record<ColumnType, ITypeSpec> = {
    [ColumnType.CHAR]: {
        sql: (column) => `CHAR(${column.length ?? 1})`,
        dataTypes: ["char"],
        length: (column) => column.length ?? 1,
        conversion: "string",
    },
    [ColumnType.STRING]: {
        sql: (column) => `VARCHAR(${column.length ?? 255})`,
        dataTypes: ["varchar"],
        length: (column) => column.length ?? 255,
        conversion: "string",
    },
    [ColumnType.TINYTEXT]: { sql: () => "TINYTEXT", dataTypes: ["tinytext"], conversion: "string" },
    [ColumnType.TEXT]: { sql: () => "TEXT", dataTypes: ["text"], conversion: "string" },
    [ColumnType.MEDIUMTEXT]: { sql: () => "MEDIUMTEXT", dataTypes: ["mediumtext"], conversion: "string" },
    [ColumnType.LONGTEXT]: { sql: () => "LONGTEXT", dataTypes: ["longtext"], conversion: "string" },
    [ColumnType.UUID]: {
        sql: () => "CHAR(36)",
        dataTypes: ["char"],
        length: () => 36,
        conversion: "string",
    },

    [ColumnType.TINYINT]: { sql: (c) => `TINYINT${Unsigned(c)}`, dataTypes: ["tinyint"], conversion: "number" },
    [ColumnType.SMALLINT]: { sql: (c) => `SMALLINT${Unsigned(c)}`, dataTypes: ["smallint"], conversion: "number" },
    [ColumnType.MEDIUMINT]: { sql: (c) => `MEDIUMINT${Unsigned(c)}`, dataTypes: ["mediumint"], conversion: "number" },
    [ColumnType.INTEGER]: { sql: (c) => `INT${Unsigned(c)}`, dataTypes: ["int"], conversion: "number" },
    [ColumnType.BIGINT]: { sql: (c) => `BIGINT${Unsigned(c)}`, dataTypes: ["bigint"], conversion: "number" },

    [ColumnType.FLOAT]: { sql: (c) => `FLOAT${Unsigned(c)}`, dataTypes: ["float"], conversion: "number" },
    [ColumnType.DOUBLE]: { sql: (c) => `DOUBLE${Unsigned(c)}`, dataTypes: ["double"], conversion: "number" },
    [ColumnType.DECIMAL]: {
        sql: (c) => `DECIMAL(${c.precision ?? 10},${c.scale ?? 2})${Unsigned(c)}`,
        dataTypes: ["decimal"],
        numeric: true,
        conversion: "string",
    },

    [ColumnType.BOOLEAN]: { sql: () => "TINYINT(1)", dataTypes: ["tinyint"], conversion: "boolean" },

    [ColumnType.DATE]: { sql: () => "DATE", dataTypes: ["date"], conversion: "date" },
    [ColumnType.DATETIME]: {
        sql: (c) => `DATETIME(${c.precision ?? 3})`,
        dataTypes: ["datetime"],
        precision: (c) => c.precision ?? 3,
        conversion: "date",
    },
    [ColumnType.TIMESTAMP]: {
        sql: (c) => `TIMESTAMP(${c.precision ?? 3})`,
        dataTypes: ["timestamp"],
        precision: (c) => c.precision ?? 3,
        conversion: "date",
    },
    [ColumnType.TIME]: {
        sql: (c) => ((c.precision ?? 0) > 0 ? `TIME(${c.precision})` : "TIME"),
        dataTypes: ["time"],
        precision: (c) => c.precision ?? 0,
        conversion: "string",
    },
    [ColumnType.YEAR]: { sql: () => "YEAR", dataTypes: ["year"], conversion: "number" },

    [ColumnType.BINARY]: {
        sql: (c) => `BINARY(${c.length ?? 16})`,
        dataTypes: ["binary"],
        length: (c) => c.length ?? 16,
        conversion: "buffer",
    },
    [ColumnType.VARBINARY]: {
        sql: (c) => `VARBINARY(${c.length ?? 255})`,
        dataTypes: ["varbinary"],
        length: (c) => c.length ?? 255,
        conversion: "buffer",
    },
    [ColumnType.BLOB]: { sql: () => "BLOB", dataTypes: ["blob"], conversion: "buffer" },
    [ColumnType.MEDIUMBLOB]: { sql: () => "MEDIUMBLOB", dataTypes: ["mediumblob"], conversion: "buffer" },
    [ColumnType.LONGBLOB]: { sql: () => "LONGBLOB", dataTypes: ["longblob"], conversion: "buffer" },

    [ColumnType.JSON]: {
        sql: () => "JSON",
        dataTypes: ["json", "longtext"],
        conversion: "json",
    },
    [ColumnType.ENUM]: {
        sql: (c) => `ENUM(${Values(c)})`,
        dataTypes: ["enum"],
        full: true,
        conversion: "string",
    },
    [ColumnType.SET]: {
        sql: (c) => `SET(${Values(c)})`,
        dataTypes: ["set"],
        full: true,
        conversion: "list",
    },
};

export function Spec(column: IColumn): ITypeSpec {
    const spec = TYPE_SPECS[column.type];
    if (!spec) throw new Error(`Unbekannter ColumnType "${column.type}".`);

    return spec;
}

export function ToSnakeCase(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function ColumnName(field: string, column: IColumn): string {
    return column.column ?? ToSnakeCase(field);
}

export function IsSqlNullable(column: IColumn): boolean {
    return column.nullable === true && column.blankAsNull !== true;
}

export function SqlType(column: IColumn): string {
    return Spec(column).sql(column);
}

export function ColumnShape(column: IColumn): IColumnShape {
    const spec = Spec(column);

    return {
        dataTypes: spec.dataTypes,
        length: spec.length ? spec.length(column) : null,
        precision: spec.precision ? spec.precision(column) : null,
        numericPrecision: spec.numeric ? (column.precision ?? 10) : null,
        numericScale: spec.numeric ? (column.scale ?? 2) : null,
        columnType: spec.full ? spec.sql(column) : null,
    };
}

export function ColumnClause(field: string, column: IColumn): string {
    const parts = [`\`${ColumnName(field, column)}\``, SqlType(column), IsSqlNullable(column) ? "NULL" : "NOT NULL"];

    const fallback = column.default ?? (column.blankAsNull ? "''" : undefined);

    if (fallback !== undefined) parts.push(`DEFAULT ${fallback}`);

    return parts.join(" ");
}

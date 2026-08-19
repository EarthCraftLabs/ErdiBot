import ColumnType from "../../enums/ColumnType";

export interface IColumn {
    type: ColumnType;
    column?: string;
    length?: number;
    precision?: number;
    scale?: number;
    values?: string[];
    unsigned?: boolean;
    nullable?: boolean;
    blankAsNull?: boolean;
    default?: string | number;
}

export interface IIndex {
    name: string;
    columns: string[];
    unique?: boolean;
}

export default interface ITableDefinition<T = any> {
    name: string;
    table: string;
    columns: Record<keyof T & string, IColumn>;
    indexes?: IIndex[];
    cache?: boolean | { max?: number; ttl?: number };
}
